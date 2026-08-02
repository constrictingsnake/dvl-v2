import type { SiteSelectors } from '../selectors';

/**
 * eBay live-DOM selectors — content-script-only (the eBay poller reads the
 * Browse API JSON, not HTML; see CLAUDE.md). Derived from the fixture corpus in
 * ../../fixtures (Phase 2 step 2) and regression-tested by test/ebay-selectors
 * .resolve.test.ts, not written from memory of the live page.
 *
 * eBay's design-system classes (`x-*` / `ux-*`) are stable across the auction /
 * BIN / auction+BIN / ended structures; a field that only exists on some
 * structures (endTime, buyItNowPrice, endedIndicator) resolves only on those.
 */
export const EBAY_SELECTORS: SiteSelectors = {
  title: 'h1.x-item-title__mainTitle',
  // Primary price = current bid on auctions, BIN price on pure BIN listings.
  price: '.x-price-primary',
  bidCount: '.x-bid-count',
  // Countdown block. Renders only relative ("Ends in 2d 21h") + a date-less
  // absolute ("Monday, 09:25 PM") — NOT a trustworthy timestamp; step 3's
  // normalize reads the absolute end from the embedded TimerModel JSON instead.
  endTime: '.ux-timer',
  imageUrl: '[data-testid="ux-image"], .ux-image-carousel-item img',
  // BIN price specifically — present on pure-BIN and auction+BIN, absent on pure
  // auctions. Distinct from `price` because auction+BIN renders TWO
  // .x-price-primary (the bid AND the BIN); this isolates the BIN.
  buyItNowPrice: '.x-bin-price__content',
  endedIndicator: '.d-statusmessage__notice-live-region',
  // bidStatusWinning / bidStatusOutbid are deferred: they only exist on a
  // logged-in page where you're actively the high/losing bidder, so there's no
  // fixture to validate them against yet. Add them when those pages are
  // captured (best-effort per CLAUDE.md — bidStatus is never authoritative).
};
