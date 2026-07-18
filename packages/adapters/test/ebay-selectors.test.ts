// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { EBAY_SELECTORS } from '../src/ebay/selectors';
import { EBAY_TRIGGER } from '../src/ebay/trigger';

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

// Every selector under test, including the TRIGGER watch button.
const selectors = { ...EBAY_SELECTORS, watchButton: EBAY_TRIGGER.watchButton } as const;

// Which selectors MUST resolve on which fixture — the step-2 done-when gate.
// `true` = element must exist, `false` = must NOT (that structure lacks it).
// Verified against the captured corpus; encodes real eBay listing semantics:
// bidCount/endTime are auction-only, buyItNowPrice skips pure auctions,
// endedIndicator is ended-only, watchButton exists on live listings not ended.
const matrix: Record<string, Record<keyof typeof selectors, boolean>> = {
  'ebay-live-auction.html': {
    title: true,
    price: true,
    bidCount: true,
    endTime: true,
    imageUrl: true,
    buyItNowPrice: false,
    endedIndicator: false,
    watchButton: true,
  },
  'ebay-live-auction-bin.html': {
    title: true,
    price: true,
    bidCount: true,
    endTime: true,
    imageUrl: true,
    buyItNowPrice: true,
    endedIndicator: false,
    watchButton: true,
  },
  'ebay-live-bin.html': {
    title: true,
    price: true,
    bidCount: false,
    endTime: false,
    imageUrl: true,
    buyItNowPrice: true,
    endedIndicator: false,
    watchButton: true,
  },
  'ebay-live-ended.html': {
    title: true,
    price: true,
    bidCount: false,
    endTime: false,
    imageUrl: true,
    buyItNowPrice: true,
    endedIndicator: true,
    watchButton: false,
  },
};

describe('EBAY_SELECTORS / EBAY_TRIGGER resolve against the fixture corpus', () => {
  for (const [fixture, expected] of Object.entries(matrix)) {
    describe(fixture, () => {
      const doc = fixtureDom(fixture);
      for (const [field, shouldResolve] of Object.entries(expected)) {
        const selector = selectors[field as keyof typeof selectors];
        it(`${field} ${shouldResolve ? 'resolves' : 'is absent'}`, () => {
          expect(doc.querySelector(selector) !== null).toBe(shouldResolve);
        });
      }
    });
  }
});
