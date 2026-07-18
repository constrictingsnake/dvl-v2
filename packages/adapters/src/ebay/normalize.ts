import type { ItemData } from '@dvl/firebase';

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
export function normalizeEbayDom(_doc: Document, _url: string): ItemData {
  // TODO (human): implement — Phase 2 step 3
  throw new Error('not implemented — Phase 2 step 3');
}
