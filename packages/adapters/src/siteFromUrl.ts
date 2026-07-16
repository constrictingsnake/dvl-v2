import type { Site } from '@dvl/firebase';

// Host -> Site detection for manual add (step 7). Lives in adapters (not the
// extension) so the poller and any future consumer share one mapping. Returns
// null for a host with no adapter, so the form can reject it.
//
// NOTE: this detects every known Site (ebay + govdeals). Manual add is currently
// gated to eBay only in createPendingItem — the eBay-only policy lives at the
// write site, not here, so this detector stays reusable when a scrape site is
// eventually promoted.

/**
 * Map a listing URL's host to its Site, or null if unrecognized or unparseable.
 * Matches by suffix so subdomains work (www.ebay.com, www.ebay.co.uk).
 */
export function siteFromUrl(url: string): Site | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'ebay.com' || host.endsWith('.ebay.com') || host.includes('.ebay.')) {
      return 'ebay';
    } else if (host === 'govdeals.com' || host.endsWith('.govdeals.com')) {
      return 'govdeals';
    }
    return null;
  } catch {
    return null;
  }
}
