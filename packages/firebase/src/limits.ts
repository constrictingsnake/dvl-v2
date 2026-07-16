// Shared cost-safety constant(s) needed by BOTH tiers. Kept here (not in
// functions/) because the client reads MAX_ITEMS_PER_USER as an advisory cap in
// the manual-add write path (Phase 1, eBay-only) and the Phase 2 capture write
// path, and the poller/trigger enforces it for real (Phase 3) — a shared
// contract belongs in the package both depend
// on. Server-only knobs (poll intervals, circuit breaker, budget) stay in
// functions/src/limits.ts. This file imports nothing, so pulling it in never
// drags the Firebase web SDK anywhere.

/** Hard cap on tracked items per user. Bounds Firestore docs and poll workload. */
export const MAX_ITEMS_PER_USER = 200;
