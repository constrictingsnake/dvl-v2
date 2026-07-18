import type { SiteSelectors } from '../selectors';

/**
 * eBay live-DOM selectors — content-script-only (the eBay poller reads the
 * Browse API JSON, not HTML; see CLAUDE.md). Fill these against the saved
 * fixture corpus in ../../fixtures (Phase 2 step 2), not from memory of the
 * live page — fixtures are what CI regression-tests against.
 *
 * eBay renders different structures for auction / BIN / ended listings; a
 * selector may need to be a comma-separated list to cover variants.
 *
 * TODO (human): fill every selector from the fixtures; if the DOM demands more
 * fields, extend SiteSelectors (optional fields) rather than parsing ad hoc.
 */
export const EBAY_SELECTORS: SiteSelectors = {
  title: '', // TODO (human)
  price: '', // TODO (human)
  bidCount: '', // TODO (human)
  endTime: '', // TODO (human)
  imageUrl: '', // TODO (human)
  buyItNowPrice: '', // TODO (human)
  endedIndicator: '', // TODO (human)
  bidStatusWinning: '', // TODO (human)
  bidStatusOutbid: '', // TODO (human)
};
