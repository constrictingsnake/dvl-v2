import type { ItemData } from '@dvl/firebase';

/**
 * Adapter contract: turn a site's raw input into the SDK-free `ItemData` the
 * write path consumes. The input flavor differs per site — live DOM (content
 * script), fetched HTML (scrape-only poller), or Browse API JSON (eBay poller) —
 * so real implementations live in per-site adapters.
 *
 * Placeholder for now: site parsing lands in Phase 2 (eBay) / Phase 5 (others).
 * It throws so the fixture harness has something concrete to assert against.
 */
export function normalize(_input: string): ItemData {
  throw new Error('normalize() not implemented — site parsing lands in Phase 2');
}
