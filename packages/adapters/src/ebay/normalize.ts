import type { ItemData, ListingType } from '@dvl/firebase';
import { EBAY_SELECTORS } from './selectors';
import { canonicalEbayUrl, ebayListingIdFromUrl } from './identity';

/**
 * Parse a rendered price string into integer minor units (cents) — never a
 * float, per the money invariant. Handles thousands separators and trailing
 * noise: "US $1,234.56" -> 123456, "US $260.00or Best Offer" -> 26000,
 * "US $80" -> 8000. A one-digit fraction is tens-of-cents ("$1.5" -> 150).
 * Throws when no number is present so a drifted/empty price can't write $0.00.
 */
export function parseMoneyToMinorUnits(text: string): number {
  const match = text.replace(/,/g, '').match(/(\d+)(?:\.(\d{1,2}))?/);
  if (!match) throw new Error(`unparseable money: ${JSON.stringify(text)}`);
  const dollars = Number.parseInt(match[1], 10);
  const cents = Number.parseInt((match[2] ?? '').padEnd(2, '0') || '0', 10);
  return dollars * 100 + cents;
}

/**
 * Collect every JSON-LD block on the page as plain objects (each script may be
 * a single node or an array; both are flattened). Parse failures are skipped so
 * one malformed block can't sink the read. eBay embeds a Product schema whose
 * nested `offers` carry the ISO `priceCurrency` and `availability` we trust over
 * DOM text — pull those with findStringDeep rather than assuming the shape.
 */
function readLdJson(doc: Document): unknown[] {
  const blocks: unknown[] = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      blocks.push(JSON.parse(script.textContent ?? ''));
    } catch {
      // malformed block — skip, other blocks may still carry what we need
    }
  }
  return blocks;
}

/**
 * First string value found for `key` anywhere in a nested JSON structure.
 * Shape-tolerant (offers can be an object or an array; schema nesting drifts),
 * so we search by key name instead of hard-coding the path to offers.
 */
function findStringDeep(node: unknown, key: string): string | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findStringDeep(item, key);
      if (found !== null) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (typeof record[key] === 'string') return record[key];
  for (const value of Object.values(record)) {
    const found = findStringDeep(value, key);
    if (found !== null) return found;
  }
  return null;
}

/**
 * Absolute end time (epoch ms) from the embedded TimerModel state script, or
 * null when there's no countdown (BIN / GTC / ended). This is the trustworthy
 * source per the step-2 findings — the rendered .ux-timer is relative
 * ("Ends in 2d 21h") and date-less, so we never parse that.
 */
function readTimerEndMs(doc: Document): number | null {
  for (const script of doc.querySelectorAll('script')) {
    const text = script.textContent;
    if (!text || !text.includes('TimerModel')) continue;
    const match = text.match(/"endTime":\{"_type":"TimerModel","endTime":\{"value":"([^"]+)"/);
    if (match) {
      const ms = Date.parse(match[1]);
      return Number.isNaN(ms) ? null : ms;
    }
  }
  return null;
}

/**
 * Parse a LIVE eBay listing DOM (after JS has run — the content-script flavor;
 * the Phase 3 poller maps Browse API JSON instead and never calls this) into
 * the SDK-free ItemData contract.
 *
 * Must handle all three eBay structures: auction, BIN, ended (plus
 * auction+BIN combos and logged-in bid-state banners).
 *
 * TODO (human) checklist:
 * - read via EBAY_SELECTORS (import from './selectors'), never inline selectors
 * - title (required — throw if missing), imageUrl (null if absent)
 * - money: parse rendered text ("US $255.00", "$1,234.56") into integer minor
 *   units + ISO 4217 currency; never floats — parse dollars/cents as strings
 * - listingType: 'auction' | 'bin' | 'auction_bin' from which price/bid
 *   affordances exist on the page
 * - bidCount: parse "12 bids"; null for pure BIN
 * - endTime: PREFER an absolute timestamp (embedded JSON/JSON-LD, data-attrs)
 *   over rendered relative text ("2d 3h left" is timezone-sensitive — see
 *   CLAUDE.md gotcha); emit epoch ms; null for BIN / Good-'Til-Cancelled
 * - ended: true when the closed-listing banner is present (endedIndicator);
 *   the write path maps it to status 'ended'
 * - bidStatus: 'winning' / 'outbid' from the logged-in banners; null when
 *   absent (logged out or no bid) — best-effort per CLAUDE.md
 * - url: canonicalEbayUrl(ebayListingIdFromUrl(url)) so stored urls are stable
 * - throw on unparseable/required-missing — the content script catches, logs,
 *   and skips (a broken selector must not write garbage)
 *
 * Step-2 findings from the fixture corpus (facts to build on, so step 3 doesn't
 * re-discover them):
 * - endTime: the DOM (.ux-timer) has NO trustworthy absolute time — only
 *   relative ("Ends in 2d 21h") + a date-less absolute ("Monday, 09:25 PM").
 *   The real absolute end lives in an embedded state script as
 *   `"endTime":{"_type":"TimerModel", … }` — parse epoch ms from THAT, not the
 *   rendered text. (The kept state script is the only <script> in the fixtures.)
 * - listingType: key off the selectors, not text. .x-bid-count / .ux-timer
 *   present ⇒ has an auction; .x-bin-price__content present ⇒ has a BIN. Both ⇒
 *   'auction_bin'. bidCount/endTime resolve ONLY on auction & auction_bin.
 * - two prices on auction+BIN: .x-price-primary appears TWICE (current bid AND
 *   the BIN). Read the current/bid price from the bid section's .x-price-primary
 *   and the BIN price from .x-bin-price__content specifically.
 * - ended: robust signal is JSON-LD `"availability":"…/OutOfStock"` (in one of
 *   the 2 ld+json blocks); the DOM endedIndicator text ("This listing sold on
 *   …") is a secondary confirmation.
 * - price text carries noise on BIN: ".x-price-primary" can read
 *   "US $260.00or Best Offer" — strip the "or Best Offer" suffix before parsing.
 */
export function normalizeEbayDom(doc: Document, url: string): ItemData {
  const listingId = ebayListingIdFromUrl(url);
  if (!listingId) throw new Error(`not an eBay listing URL: ${JSON.stringify(url)}`);

  const title = doc.querySelector(EBAY_SELECTORS.title)?.textContent?.trim();
  if (!title) throw new Error('missing title (selector drift?)');

  // The first .x-price-primary is the current price — the bid on auctions, the
  // BIN price on pure BIN. ld+json's price is the BIN amount on auction+BIN, so
  // it can't stand in for the current bid; prices come from the DOM.
  const priceText = doc.querySelector(EBAY_SELECTORS.price)?.textContent;
  if (!priceText) throw new Error('missing price (selector drift?)');
  const currentPrice = parseMoneyToMinorUnits(priceText);

  // Currency is only trustworthy from JSON-LD (the DOM shows a bare "US $").
  // Without it the minor-units are meaningless, so it's required.
  const ldJson = readLdJson(doc);
  const currency = findStringDeep(ldJson, 'priceCurrency');
  if (!currency) throw new Error('missing priceCurrency (selector drift?)');

  // .x-bin-price__content isolates the BIN price from the bid price (auction+BIN
  // renders two .x-price-primary); its presence also marks the listing as BIN.
  const binEl = EBAY_SELECTORS.buyItNowPrice
    ? doc.querySelector(EBAY_SELECTORS.buyItNowPrice)
    : null;
  const buyItNowPrice = binEl?.textContent ? parseMoneyToMinorUnits(binEl.textContent) : null;

  const hasBin = binEl !== null;
  const hasAuction =
    doc.querySelector(EBAY_SELECTORS.bidCount) !== null ||
    doc.querySelector(EBAY_SELECTORS.endTime) !== null;
  let listingType: ListingType = 'auction';
  if (hasBin && hasAuction) listingType = 'auction_bin';
  else if (hasBin) listingType = 'bin';

  // bidCount / endTime exist only on the auction structures.
  const bidMatch = doc.querySelector(EBAY_SELECTORS.bidCount)?.textContent?.match(/(\d+)\s*bids?/i);
  const bidCount = bidMatch ? Number.parseInt(bidMatch[1], 10) : null;

  const endTimeMs = readTimerEndMs(doc);
  const ended = (findStringDeep(ldJson, 'availability') ?? '').includes('OutOfStock');

  const imageUrl = EBAY_SELECTORS.imageUrl
    ? (doc.querySelector(EBAY_SELECTORS.imageUrl)?.getAttribute('src') ?? null)
    : null;

  // Best-effort, logged-in only. The winning/outbid selectors are undefined this
  // phase (no fixtures), so this stays null — and a null never clobbers a stored
  // value in the write path.
  let bidStatus: ItemData['bidStatus'] = null;
  if (EBAY_SELECTORS.bidStatusWinning && doc.querySelector(EBAY_SELECTORS.bidStatusWinning)) {
    bidStatus = 'winning';
  } else if (EBAY_SELECTORS.bidStatusOutbid && doc.querySelector(EBAY_SELECTORS.bidStatusOutbid)) {
    bidStatus = 'outbid';
  }

  return {
    url: canonicalEbayUrl(listingId),
    site: 'ebay',
    listingType,
    title,
    imageUrl,
    currency,
    currentPrice,
    buyItNowPrice,
    bidCount,
    endTimeMs,
    ended,
    bidStatus,
  };
}
