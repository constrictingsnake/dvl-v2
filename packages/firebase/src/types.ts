// Firestore document types — the schema source of truth shared by the extension,
// the dashboard, and the Cloud Functions poller. Keep in sync with the schema
// block in CLAUDE.md.
//
// Conventions:
// - Money is stored as integer MINOR UNITS (cents), never floats. Pair every
//   amount with `currency` (ISO 4217): 123456 + 'USD' = $1,234.56.
// - Times use FsTimestamp, a structural type satisfied by BOTH the client
//   (firebase/firestore) and Admin (firebase-admin/firestore) Timestamp classes,
//   so this model isn't coupled to either SDK.
// - Interfaces describe the STORED (read) shape. On write, timestamp fields may
//   be a server sentinel (serverTimestamp()); wrap with Firestore's
//   WithFieldValue<T> at the write site rather than widening these types.

/** Timestamp shape common to the client and Admin Firestore SDKs. */
export interface FsTimestamp {
  toDate(): Date;
  toMillis(): number;
  readonly seconds: number;
  readonly nanoseconds: number;
}

/** A stored document plus its Firestore document id. */
export type WithId<T> = T & { id: string };

/** Auction sites with an adapter. Sites 3/4 are TBD (see CLAUDE.md). */
export type Site = 'ebay' | 'govdeals';

/** Listing format. An eBay listing can be auction, fixed-price (BIN), or both. */
export type ListingType = 'auction' | 'bin' | 'auction_bin';

/**
 * Lifecycle status.
 * - pending: just added (manual paste / capture), not yet polled — fields sparse
 * - active:  live and being polled
 * - ended:   auction closed / listing no longer live
 * - stale:   last poll couldn't refresh it, but not a hard failure
 * - error:   repeated fetch/parse failures (see lastError / consecutiveErrorCount)
 */
export type ItemStatus = 'pending' | 'active' | 'ended' | 'stale' | 'error';

/**
 * Whether the user is currently the high bidder. Only knowable from a logged-in
 * page via a content script — the server poller reads public data and leaves it
 * 'unknown'.
 */
export type BidStatus = 'winning' | 'outbid' | 'unknown';

/** Per-item notification preferences. */
export interface NotificationPrefs {
  /** Notify on a winning -> outbid transition (requires BidStatus from a page). */
  onOutbid: boolean;
  /** Snipe / ending-soon reminder, minutes before close. null = off. */
  minutesBefore: number | null;
  /** Notify when currentPrice crosses this threshold (minor units). null = off. */
  priceThreshold: number | null;
  /** Direction for priceThreshold; null when the threshold is off. */
  priceThresholdDirection: 'above' | 'below' | null;
}

/** Dedup bookkeeping so the notify Function doesn't re-fire on every poll. */
export interface NotificationState {
  endingSoonSentAt: FsTimestamp | null;
  /** Price at the last outbid notification; avoids repeats until it changes. */
  outbidNotifiedPrice: number | null;
  priceThresholdSentAt: FsTimestamp | null;
}

/**
 * A tracked auction: users/{uid}/items/{itemId}.
 * Poll-derived fields are nullable: a freshly added ('pending') item has only
 * url/site until the first poll, and BIN / Good-'Til-Cancelled listings have no
 * bids or end time.
 */
export interface Item {
  // identity / source
  url: string;
  site: Site;
  listingType: ListingType;
  addedVia: 'capture' | 'manual';
  createdAt: FsTimestamp;

  // listing content (filled and refreshed by the poller)
  title: string | null;
  imageUrl: string | null;
  currency: string; // ISO 4217, e.g. 'USD'
  currentPrice: number | null; // minor units (cents)
  buyItNowPrice: number | null; // minor units (cents); null if not BIN
  bidCount: number | null; // null for pure BIN
  endTime: FsTimestamp | null; // null for BIN / Good-'Til-Cancelled
  status: ItemStatus;
  bidStatus: BidStatus;

  // polling / health
  lastPolled: FsTimestamp | null;
  nextPollAt: FsTimestamp | null; // adaptive polling; null once ended
  consecutiveErrorCount: number;
  lastError: string | null;

  // user config + notification bookkeeping
  notify: NotificationPrefs;
  notificationState: NotificationState;

  // organization
  group: string | null; // watchlist grouping; null = ungrouped
}

/**
 * A price/bid snapshot: users/{uid}/items/{itemId}/history/{snapshotId}.
 * Appended only when something changed (write-only-diffs).
 */
export interface ItemHistory {
  price: number; // minor units (cents)
  bidCount: number | null;
  recordedAt: FsTimestamp;
}

/**
 * A registered FCM target. The extension and the web companion use different
 * push setups, so the platform is tracked to route and prune correctly.
 */
export interface FcmToken {
  token: string;
  platform: 'extension' | 'web';
  updatedAt: FsTimestamp;
}

/** A tracker account: users/{uid}. */
export interface User {
  createdAt: FsTimestamp;
  email: string | null;
  displayName: string | null;
  /** Denormalized count for cheap per-user item-cap checks (see limits.ts). */
  itemCount: number;
  /** Defaults applied to newly added items. */
  defaultNotify: NotificationPrefs;
  /** One per device; fan out notifications and prune stale ones. */
  fcmTokens: FcmToken[];
}

/**
 * The normalized result of parsing a listing page — the adapter contract
 * (`normalize(doc) => ItemData`). Deliberately SDK-free: no Firestore types,
 * times as epoch millis, money as minor units. The write path maps this onto an
 * Item (adding status, polling, notify config, timestamps). Defined here so
 * content scripts and the server poller share one shape and packages/adapters
 * stays free of any firebase dependency.
 */
export interface ItemData {
  url: string;
  site: Site;
  listingType: ListingType;
  title: string;
  imageUrl: string | null;
  currency: string;
  currentPrice: number; // minor units (cents)
  buyItNowPrice: number | null;
  bidCount: number | null;
  endTimeMs: number | null; // epoch millis; null if no end
  /** Set only when scraped from a logged-in page (content script); else null. */
  bidStatus: BidStatus | null;
}
