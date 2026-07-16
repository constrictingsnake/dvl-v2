// Cost-safety constants — Phase 0 step 4.
//
// These are the *written-down* defenses against runaway cost. Enforcement lands
// later: the per-user item cap in the write path (Phase 2), the poller circuit
// breaker + adaptive polling in the poller (Phase 3), and MONTHLY_BUDGET_USD in
// the GCP budget alert + billing kill-switch wired up at the start of Phase 3.
//
// Invariant (see CLAUDE.md): never deploy the poller without Blaze + the billing
// kill-switch already live.
//
// MAX_ITEMS_PER_USER moved to packages/firebase/src/limits.ts — it's a shared
// contract the client reads as an advisory cap (Phase 1) and the poller/trigger
// enforces for real (Phase 3). When Phase 3 server code needs it, import it from
// @dvl/firebase (via a pure subpath, NOT the package index, so the Firebase web
// SDK doesn't load into the server). The server-only knobs below stay here.

/**
 * Adaptive polling bounds, in seconds. The poller picks a per-item interval from
 * how soon the auction ends, clamped to [MIN, MAX]. MIN is the cost-critical
 * floor — never poll any item more often than this, no matter what.
 */
export const MIN_POLL_INTERVAL_SECONDS = 60; // 1 min  — auctions ending very soon
export const MAX_POLL_INTERVAL_SECONDS = 60 * 60; // 1 hour — distant auctions

/**
 * Reference adaptive schedule: time-until-end → poll interval. Phase 3 implements
 * the actual selection; kept here so the cadence is reviewable in one place.
 */
export const ADAPTIVE_POLL_SCHEDULE = [
  { endsWithinSeconds: 10 * 60, intervalSeconds: 60 }, // < 10 min → every 1 min
  { endsWithinSeconds: 60 * 60, intervalSeconds: 2 * 60 }, // < 1 hour → every 2 min
  { endsWithinSeconds: 24 * 60 * 60, intervalSeconds: 15 * 60 }, // < 1 day  → every 15 min
  { endsWithinSeconds: Infinity, intervalSeconds: 60 * 60 }, // else     → every 1 hour
] as const;

/** Poller circuit breaker — trips polling OFF when things go wrong. */
export const CIRCUIT_BREAKER = {
  /** Max items processed in a single Scheduler invocation. */
  maxItemsPerRun: 500,
  /** Trip if a run's error rate exceeds this fraction (0..1). */
  errorRateThreshold: 0.5,
  /** Trip after this many consecutive failed runs. */
  consecutiveFailureThreshold: 5,
  /** Once tripped, skip polling for this long before retrying. */
  cooldownSeconds: 15 * 60,
  /** Absolute safety ceiling: polls per item per day, regardless of schedule. */
  maxPollsPerItemPerDay: 200,
} as const;

/** Monthly GCP budget (USD) — drives the budget alert + kill-switch in Phase 3. */
export const MONTHLY_BUDGET_USD = 10;
