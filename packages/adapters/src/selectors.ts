import type { Site } from '@dvl/firebase';
import { EBAY_SELECTORS } from './ebay/selectors';

/**
 * DOM selectors an adapter needs to read a listing. Shared source of truth for
 * scrape-only sites: the content script (live DOM) and the server-side poller
 * (fetched HTML via cheerio) both import from here, so a site's HTML change is
 * fixed once.
 *
 * eBay is the exception — its poller reads the Browse API JSON, not HTML, so
 * its selectors are content-script-only (capture + logged-in bidStatus). See
 * CLAUDE.md.
 *
 * The four base fields are the scrape minimum; the optional fields are
 * capture-side extras a site defines only if its DOM exposes them.
 */
export interface SiteSelectors {
  title: string;
  price: string;
  bidCount: string;
  endTime: string;
  imageUrl?: string;
  buyItNowPrice?: string;
  /** Element present only once the listing has closed. */
  endedIndicator?: string;
  /** Logged-in bid-state banners (content-script-only — sets bidStatus). */
  bidStatusWinning?: string;
  bidStatusOutbid?: string;
}

/**
 * Per-site selector maps. eBay lands in Phase 2; GovDeals / Sites 3-4 in
 * Phase 5.
 */
export const SELECTORS: Partial<Record<Site, SiteSelectors>> = {
  ebay: EBAY_SELECTORS,
};
