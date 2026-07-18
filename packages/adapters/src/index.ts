// Shared site adapter configs and selector maps.
export { SELECTORS, type SiteSelectors } from './selectors';
export { siteFromUrl } from './siteFromUrl';
export { itemDocId } from './itemDocId';

// eBay adapter (content-script flavor; the Phase 3 poller maps Browse API JSON)
export { ebayListingIdFromUrl, canonicalEbayUrl } from './ebay/identity';
export { EBAY_SELECTORS } from './ebay/selectors';
export { EBAY_TRIGGER } from './ebay/trigger';
export { normalizeEbayDom } from './ebay/normalize';
