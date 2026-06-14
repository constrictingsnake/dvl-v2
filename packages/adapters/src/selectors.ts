import type { Site } from '@dvl/firebase';

/**
 * DOM selectors a scrape-only adapter needs to read a listing. Shared source of
 * truth: the content script (live DOM) and the server-side poller (fetched HTML
 * via cheerio) both import from here, so a site's HTML change is fixed once.
 *
 * eBay is the exception — its poller reads the Browse API JSON, not HTML, so its
 * selectors stay content-script-only (capture + logged-in bidStatus). See CLAUDE.md.
 */
export interface SiteSelectors {
  title: string;
  price: string;
  bidCount: string;
  endTime: string;
}

/**
 * Per-site selector maps. Stub for now — filled in per adapter: eBay in Phase 2,
 * GovDeals / Sites 3-4 in Phase 5.
 */
export const SELECTORS: Partial<Record<Site, SiteSelectors>> = {};
