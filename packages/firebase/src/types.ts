// Firestore document types — mirror the schema in CLAUDE.md.
// Paths: users/{uid}, users/{uid}/items/{itemId}, users/{uid}/items/{itemId}/history/{snapshotId}.
import type { Timestamp } from 'firebase/firestore';

/** Auction sites with an adapter. Sites 3/4 are TBD (see CLAUDE.md). */
export type Site = 'ebay' | 'govdeals';

export type ItemStatus = 'active' | 'ended' | 'stale' | 'error';

/** A tracked auction: users/{uid}/items/{itemId}. */
export interface Item {
  url: string;
  site: Site;
  title: string;
  currentPrice: number;
  endTime: Timestamp;
  bidCount: number;
  lastPolled: Timestamp;
  nextPollAt: Timestamp; // adaptive polling — when the poller should next fetch
  status: ItemStatus;
  notifyOnOutbid: boolean;
  notifyMinutesBefore: number;
}

/** A price/bid snapshot: users/{uid}/items/{itemId}/history/{snapshotId}. */
export interface ItemHistory {
  price: number;
  bidCount: number;
  recordedAt: Timestamp;
}

/** A tracker account: users/{uid}. FCM tokens live here, not on items. */
export interface User {
  fcmTokens: string[]; // one per device; fan out notifications and prune stale ones
}
