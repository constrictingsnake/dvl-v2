// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
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
  // Harness smoke — unskip once ebay-live-auction.html exists (step 2) and
  // normalizeEbayDom is implemented (step 3), then assert the full ItemData.
  it.skip('parses the auction fixture into ItemData', () => {
    const data = normalizeEbayDom(
      fixtureDom('ebay-live-auction.html'),
      'https://www.ebay.com/itm/123456789012',
    );
    expect(data.site).toBe('ebay');
    // TODO (human, step 3): assert the FULL expected ItemData (toEqual), like
    // the Phase-0 harness did — title, minor-unit price, bidCount, endTimeMs…
  });

  // TODO (human, step 3): one real test per fixture in the matrix
  // (fixtures/README.md), asserting complete ItemData objects.
  it.todo('BIN (GTC): buyItNowPrice set, bidCount/endTimeMs null, listingType bin');
  it.todo('auction+BIN: both prices, listingType auction_bin');
  it.todo('ended listing: ended true');
  it.todo('logged-in winning banner: bidStatus winning');
  it.todo('logged-in outbid banner: bidStatus outbid');
  it.todo('prefers the absolute end time over rendered relative text');
  it.todo('throws when required fields are missing (selector drift)');
});
