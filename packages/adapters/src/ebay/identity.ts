// eBay listing identity. A listing's canonical identity is its numeric item id
// (the /itm/<digits> path segment) — URLs for the same listing vary wildly
// (SEO slugs, tracking params, the legacy ?item= query form), so dedupe keys on
// the id, never the raw URL. Both write paths (manual add in createPendingItem,
// capture in upsertCapturedItem) derive the same deterministic doc id from this,
// which is what makes save-vs-paste dedupe a simple transactional get().

/**
 * Extract the numeric eBay item id from a listing URL, or null if the URL
 * doesn't point at a single listing.
 *
 * TODO (human):
 * - handle https://www.ebay.com/itm/123456789012 and /itm/<slug>/123456789012
 * - handle the legacy ?item=123456789012 query form
 * - return null for non-listing pages (search, watchlist, stores) and garbage
 *   input (new URL throws — catch it)
 * - don't check the host here: siteFromUrl decides "is this eBay"; this only
 *   parses the listing id out of the path/query
 */
export function ebayListingIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  // Modern path form: /itm/<id> or /itm/<slug>/<id> (slug may itself contain
  // digits, so the greedy `.*/` consumes it and backtracks to leave the id).
  const pathMatch = parsed.pathname.match(/\/itm\/(?:.*\/)?(\d{9,15})(?:\/|$)/);
  if (pathMatch) return pathMatch[1];

  // Legacy query form: ?item=<id>
  const itemParam = parsed.searchParams.get('item');
  if (itemParam && /^\d{9,15}$/.test(itemParam)) return itemParam;

  return null;
}

/**
 * The canonical URL to store (and later poll) for a listing id — strips slugs
 * and tracking junk so stored urls are stable and comparable.
 *
 * TODO (human): return `https://www.ebay.com/itm/${listingId}`.
 */
export function canonicalEbayUrl(listingId: string): string {
  return `https://www.ebay.com/itm/${listingId}`;
}
