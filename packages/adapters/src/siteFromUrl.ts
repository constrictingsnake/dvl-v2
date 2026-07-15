import type { Site } from '@dvl/firebase';

// Host -> Site detection for manual add (step 7). Lives in adapters (not the
// extension) so the poller and any future consumer share one mapping. Returns
// null for a host with no adapter, so the form can reject it.

/**
 * Map a listing URL's host to its Site, or null if unrecognized.
 *
 * TODO (human):
 *  - Parse: const host = new URL(url).hostname.toLowerCase(); (try/catch — an
 *    unparseable URL returns null, not throws; the form validates format too).
 *  - Match by suffix so subdomains work (www.ebay.com, www.ebay.co.uk):
 *      host.endsWith('ebay.com') || host.includes('ebay.') -> 'ebay'
 *      host.endsWith('govdeals.com') -> 'govdeals'
 *  - return null for anything else.
 *  - Keep the site list aligned with the `Site` union in packages/firebase types.
 */
export function siteFromUrl(url: string): Site | null {
  // TODO (human): implement per the checklist above.
  void url;
  return null; // placeholder — treat every host as unrecognized until implemented
}
