// Item read path. The dashboard/popup never query Firestore directly — they read
// the live list off the Zustand store, which this listener feeds. SDK usage
// (getDb + firebase/firestore) is encapsulated here, same pattern as lib/user.ts.
// Later steps add createPendingItem (step 7) and removeItem (step 8) alongside.
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { WithId, Item } from '@dvl/firebase';
import { getDb } from '@dvl/firebase';

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
 * Manual add (step 7): validate `url`, detect its `site`, and transactionally
 * write a `pending` Item to users/{uid}/items while bumping users/{uid}.itemCount
 * — enforcing the advisory MAX_ITEMS_PER_USER cap. Data hydration is deferred to
 * the Phase 3 poller; the item stays `pending` until then. Rejects (throws) on an
 * invalid URL, an unrecognized site, or an over-cap user so the form can message it.
 *
 * TODO (human):
 *  - Validate url: `new URL(url)` in try/catch; reject non-http(s).
 *  - const site = siteFromUrl(url) (from '@dvl/adapters'); reject if null.
 *  - const db = getDb();
 *  - const userRef = doc(db, 'users', uid);
 *  - const itemRef = doc(collection(db, 'users', uid, 'items')); // auto-id
 *  - runTransaction(db, async (tx) => {
 *      const userSnap = await tx.get(userRef);
 *      const count = userSnap.data()?.itemCount ?? 0;
 *      if (count >= MAX_ITEMS_PER_USER) throw new Error('Item limit reached');
 *      tx.set(itemRef, { ...pending Item defaults below });
 *      tx.update(userRef, { itemCount: count + 1 });
 *    });
 *  - Pending Item defaults (see Item in packages/firebase/src/types.ts): url, site,
 *    listingType: 'auction' (best guess until polled), addedVia: 'manual',
 *    createdAt: serverTimestamp(), title/imageUrl/currentPrice/... : null,
 *    currency: 'USD', status: 'pending', bidStatus: 'unknown',
 *    consecutiveErrorCount: 0, lastError: null, nextPollAt: null,
 *    notify: user.defaultNotify (or the same defaults ensureUserDoc uses),
 *    notificationState: { endingSoonSentAt: null, outbidNotifiedPrice: null,
 *    priceThresholdSentAt: null }, group: null.
 *  - Type the payload WithFieldValue<Item> so serverTimestamp() typechecks.
 *  - MAX_ITEMS_PER_USER lives in functions/src/limits.ts — import it (advisory /
 *    client-side only; real enforcement is the Phase 3 trigger).
 */
export async function createPendingItem(uid: string, url: string): Promise<void> {
  // TODO (human): implement per the checklist above.
  throw new Error(`createPendingItem not implemented (uid=${uid}, url=${url})`);
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
