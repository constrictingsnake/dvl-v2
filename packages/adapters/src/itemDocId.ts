import type { Site } from '@dvl/firebase';

/**
 * Deterministic Firestore doc id for users/{uid}/items/{itemId}:
 * `${site}-${listingId}`. Every write path (manual add, capture, future sites)
 * MUST derive item doc ids through this so the same listing can never exist
 * twice for a user — a transaction get() on the derived ref IS the dedupe
 * check (client-SDK transactions can't run queries, so identity has to live
 * in the doc id).
 *
 * TODO (human): implement; throw on an empty listingId so a parse bug can't
 * mint a doc id like 'ebay-'.
 */
export function itemDocId(site: Site, listingId: string): string {
  if (!listingId) {
    throw new Error(`itemDocId: empty listingId for site '${site}'`);
  }
  return `${site}-${listingId}`;
}
