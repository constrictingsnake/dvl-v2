import { describe, it, expect } from 'vitest';
import { ebayListingIdFromUrl, canonicalEbayUrl } from '../src/ebay/identity';
import { itemDocId } from '../src/itemDocId';

// Pure-function tests (node env, no DOM).
describe('ebayListingIdFromUrl', () => {
  it('extracts the id from /itm/<id>', () => {
    expect(ebayListingIdFromUrl('https://www.ebay.com/itm/123456789012')).toBe('123456789012');
  });

  it('extracts the id from a slugged /itm/<slug>/<id> URL', () => {
    expect(ebayListingIdFromUrl('https://www.ebay.com/itm/Vintage-Rolex-Watch/123456789012')).toBe(
      '123456789012',
    );
  });

  it('extracts the id from a slug that itself contains digits', () => {
    expect(
      ebayListingIdFromUrl('https://www.ebay.com/itm/Nike-Air-Max-90-US-10/123456789012'),
    ).toBe('123456789012');
  });

  it('extracts the id from the legacy ?item= query form', () => {
    expect(ebayListingIdFromUrl('https://www.ebay.com/itm?item=123456789012')).toBe('123456789012');
  });

  it('ignores tracking params (?hash=…&_trkparms=…)', () => {
    expect(
      ebayListingIdFromUrl(
        'https://www.ebay.com/itm/123456789012?hash=item1a2b&_trkparms=foo%3Abar',
      ),
    ).toBe('123456789012');
  });

  it('returns null for non-listing eBay pages (search, watchlist, store)', () => {
    expect(ebayListingIdFromUrl('https://www.ebay.com/sch/i.html?_nkw=rolex')).toBeNull();
    expect(ebayListingIdFromUrl('https://www.ebay.com/mye/myebay/watchlist')).toBeNull();
    expect(ebayListingIdFromUrl('https://www.ebay.com/str/somestore')).toBeNull();
  });

  it('returns null for garbage / unparseable input', () => {
    expect(ebayListingIdFromUrl('not a url')).toBeNull();
    expect(ebayListingIdFromUrl('')).toBeNull();
    expect(ebayListingIdFromUrl('https://www.ebay.com/itm/short-123')).toBeNull();
  });
});

describe('canonicalEbayUrl / itemDocId', () => {
  it('canonicalEbayUrl builds https://www.ebay.com/itm/<id>', () => {
    expect(canonicalEbayUrl('123456789012')).toBe('https://www.ebay.com/itm/123456789012');
  });

  it('itemDocId is `${site}-${listingId}`', () => {
    expect(itemDocId('ebay', '123456789012')).toBe('ebay-123456789012');
  });

  it('itemDocId throws on an empty listingId', () => {
    expect(() => itemDocId('ebay', '')).toThrow();
  });
});
