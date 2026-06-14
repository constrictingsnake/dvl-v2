import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { ItemData } from '@dvl/firebase';
import { normalize } from '../src/normalize';

/** Reads a saved fixture from ../fixtures relative to this test file. */
function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');
}

describe('eBay auction adapter', () => {
  // Deliberately an expected-failure (step 10): normalize() is a Phase-0 stub, so
  // this assertion fails today. `it.fails` (Vitest's expected-failure marker)
  // keeps CI green while documenting the gap, and flips RED the moment normalize()
  // is implemented — a reminder to drop this marker and write real expectations.
  // Its value now is proving the fixture harness runs end-to-end: read snapshot →
  // normalize → compare to ItemData.
  it.fails('parses a saved auction snapshot into ItemData', () => {
    const expected: ItemData = {
      url: 'https://www.ebay.com/itm/123456789',
      site: 'ebay',
      listingType: 'auction',
      title: 'Vintage Omega Seamaster Watch',
      imageUrl: null,
      currency: 'USD',
      currentPrice: 25500, // minor units (cents)
      buyItNowPrice: null,
      bidCount: 12,
      endTimeMs: Date.parse('2026-06-20T18:30:00Z'),
      bidStatus: null,
    };

    expect(normalize(fixture('ebay-auction.sample.html'))).toEqual(expected);
  });
});
