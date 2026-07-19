// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import type { ItemData } from '@dvl/firebase';
import { normalizeEbayDom } from '../src/ebay/normalize';

/**
 * Parse a saved live-DOM fixture into a Document (happy-dom). Anchored to
 * process.cwd() (the package root under vitest) rather than import.meta.url —
 * the happy-dom test env rewrites import.meta.url to http://localhost/, which
 * breaks relative file resolution.
 */
function fixtureDom(name: string): Document {
  const html = readFileSync(resolve(process.cwd(), 'fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('normalizeEbayDom (live-DOM flavor)', () => {
  it('parses an active auction (bids, end time, no BIN)', () => {
    const data = normalizeEbayDom(
      fixtureDom('ebay-live-auction.html'),
      'https://www.ebay.com/itm/358792978410',
    );
    expect(data).toEqual<ItemData>({
      url: 'https://www.ebay.com/itm/358792978410',
      site: 'ebay',
      listingType: 'auction',
      title: 'Dingos Western Timber CaneBreak Rattlesnake boots men’s size 9',
      imageUrl: 'https://i.ebayimg.com/images/g/sZgAAeSwUXxqVY9V/s-l500.webp',
      currency: 'USD',
      currentPrice: 10550,
      buyItNowPrice: null,
      bidCount: 3,
      endTimeMs: 1784597135000,
      ended: false,
      bidStatus: null,
    });
  });

  it('parses a pure BIN / GTC (BIN price, no bids, no end time)', () => {
    // Slugged URL with tracking params — canonical form must strip to /itm/<id>.
    const data = normalizeEbayDom(
      fixtureDom('ebay-live-bin.html'),
      'https://www.ebay.com/itm/new-rock-leather-boots/227435756339?hash=item34ab',
    );
    expect(data).toEqual<ItemData>({
      url: 'https://www.ebay.com/itm/227435756339',
      site: 'ebay',
      listingType: 'bin',
      title: 'New Rock Leather Boots 38',
      imageUrl: 'https://i.ebayimg.com/images/g/sWEAAeSwy7NqHwYm/s-l500.webp',
      currency: 'USD',
      currentPrice: 26000,
      buyItNowPrice: 26000,
      bidCount: null,
      endTimeMs: null,
      ended: false,
      bidStatus: null,
    });
  });

  it('parses an auction+BIN (both prices, current bid distinct from BIN)', () => {
    const data = normalizeEbayDom(
      fixtureDom('ebay-live-auction-bin.html'),
      'https://www.ebay.com/itm/407070494316',
    );
    expect(data).toEqual<ItemData>({
      url: 'https://www.ebay.com/itm/407070494316',
      site: 'ebay',
      listingType: 'auction_bin',
      title: 'NEW ROCK ULTRA  HIGH BOOTS M-MET033-C3 (Size: 45)',
      imageUrl: 'https://i.ebayimg.com/images/g/9EEAAeSw--9p3rhn/s-l500.webp',
      currency: 'USD',
      currentPrice: 60000, // current bid
      buyItNowPrice: 250000, // BIN — distinct from the bid
      bidCount: 0,
      endTimeMs: 1784832711000,
      ended: false,
      bidStatus: null,
    });
  });

  it('parses an ended listing (ended flag from JSON-LD OutOfStock)', () => {
    const data = normalizeEbayDom(
      fixtureDom('ebay-live-ended.html'),
      'https://www.ebay.com/itm/198495089189',
    );
    expect(data).toEqual<ItemData>({
      url: 'https://www.ebay.com/itm/198495089189',
      site: 'ebay',
      listingType: 'bin',
      title: "Corral A1986 Square Toe Cross & Wings Western Cowboy Boots Men's US 11 M",
      imageUrl: 'https://i.ebayimg.com/images/g/-6sAAeSwDB5qVOjW/s-l500.jpg',
      currency: 'USD',
      currentPrice: 8000,
      buyItNowPrice: 8000,
      bidCount: null,
      endTimeMs: null,
      ended: true,
      bidStatus: null,
    });
  });

  it('prefers the absolute end time from embedded JSON over rendered relative text', () => {
    const { endTimeMs } = normalizeEbayDom(
      fixtureDom('ebay-live-auction.html'),
      'https://www.ebay.com/itm/358792978410',
    );
    // The DOM .ux-timer shows only "Ends in 2d 21h" (relative, date-less); this
    // must be the absolute TimerModel value, not a wall-clock-derived guess.
    expect(endTimeMs).toBe(Date.parse('2026-07-21T01:25:35.000Z'));
  });

  it('throws on required-missing (title stripped = selector drift) so no garbage is written', () => {
    const doc = fixtureDom('ebay-live-auction.html');
    doc.querySelector('h1.x-item-title__mainTitle')?.remove();
    expect(() => normalizeEbayDom(doc, 'https://www.ebay.com/itm/358792978410')).toThrow(/title/i);
  });
});
