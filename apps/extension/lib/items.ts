// Item read path. The dashboard/popup never query Firestore directly — they read
// the live list off the Zustand store, which this listener feeds. SDK usage
// (getDb + firebase/firestore) is encapsulated here, same pattern as lib/user.ts.
// Steps 7/8 add createPendingItem + removeItem alongside. (Manual add is scoped
// to eBay only — see CLAUDE.md; scrape-only sites are deferred.)
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { WithId, Item } from '@dvl/firebase';
import { getDb, MAX_ITEMS_PER_USER } from '@dvl/firebase';
import { siteFromUrl } from '@dvl/adapters';

/**
 * Subscribe to users/{uid}/items in real time. Calls `onItems` with the full
 * item list on the initial snapshot and again on every subsequent change; call
 * the returned Unsubscribe to tear the listener down. Ordering is left to the
 * step-9 selector (the UI re-sorts anyway, so an unordered query avoids an index).
 *
 * Doc times stay Firestore Timestamps — WithId<Item> types them as FsTimestamp
 * (structural, so a Timestamp satisfies it); convert to epoch-ms only at the UI
 * edge (formatMoney / formatTime). `onError` forwards permission/network errors
 * so the caller can surface them — a silent listener hides rules failures.
 */
export function subscribeToItems(
  uid: string,
  onItems: (items: WithId<Item>[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getDb();
  const col = collection(db, 'users', uid, 'items');
  return onSnapshot(
    col,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WithId<Item>);
      onItems(items);
    },
    onError,
  );
}

/**
 * Manual add — eBay only (step 7): detect the `site` from `url` and
 * transactionally write a `pending` Item to users/{uid}/items while bumping
 * users/{uid}.itemCount — enforcing the advisory MAX_ITEMS_PER_USER cap. Data
 * hydration is deferred to the Phase 3 poller (Browse API); the item stays
 * `pending` until then. Throws on a non-eBay URL or an over-cap user so the form
 * can surface the message. (eBay-only rationale is in CLAUDE.md.)
 */
export async function createPendingItem(uid: string, url: string): Promise<void> {
  const site = siteFromUrl(url);
  if (site !== 'ebay') {
    throw new Error('only ebay links rn');
  }
  const db = getDb();
  const userRef = doc(db, 'users', uid);
  const itemRef = doc(collection(db, 'users', uid, 'items'));
  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    const count = userSnap.data()?.itemCount ?? 0;
    if (count >= MAX_ITEMS_PER_USER) {
      throw new Error('Item Limit Reached');
    }
    tx.set(itemRef, {
      url,
      site,
      listingType: 'auction',
      addedVia: 'manual',
      createdAt: serverTimestamp(),
      title: null,
      imageUrl: null,
      currency: 'USD',
      currentPrice: null,
      buyItNowPrice: null,
      bidCount: null,
      endTime: null,
      status: 'pending',
      bidStatus: 'unknown',
      lastPolled: null,
      nextPollAt: null,
      consecutiveErrorCount: 0,
      lastError: null,
      notify: userSnap.data()?.defaultNotify ?? {
        onOutbid: false,
        minutesBefore: null,
        priceThreshold: null,
        priceThresholdDirection: null,
      },
      notificationState: {
        endingSoonSentAt: null,
        outbidNotifiedPrice: null,
        priceThresholdSentAt: null,
      },
      group: null,
    });
    tx.update(userRef, { itemCount: count + 1 });
  });
}

/**
 * Remove item (step 8): transactionally delete users/{uid}/items/{itemId} and
 * decrement users/{uid}.itemCount. Capture is one-way (no un-save detection), so
 * removal is dashboard-owned.
 *
 * TODO (human):
 *  - const db = getDb();
 *  - const userRef = doc(db, 'users', uid);
 *  - const itemRef = doc(db, 'users', uid, 'items', itemId);
 *  - runTransaction(db, async (tx) => {
 *      const userSnap = await tx.get(userRef);
 *      const count = userSnap.data()?.itemCount ?? 0;
 *      tx.delete(itemRef);
 *      tx.update(userRef, { itemCount: Math.max(0, count - 1) });
 *    });
 *  - NOTE: deleting a doc does NOT delete its subcollections. No `history` docs
 *    exist until Phase 3, so a recursive delete is deferred (tracked for later).
 */
export async function removeItem(uid: string, itemId: string): Promise<void> {
  // TODO (human): implement per the checklist above.
  throw new Error(`removeItem not implemented (uid=${uid}, itemId=${itemId})`);
}
