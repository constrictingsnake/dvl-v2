// Firestore access for items is encapsulated here (same pattern as lib/user.ts);
// the dashboard/popup read the live list off the Zustand store, never Firestore.
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
import { siteFromUrl, ebayListingIdFromUrl, canonicalEbayUrl, itemDocId } from '@dvl/adapters';

/**
 * Subscribe to users/{uid}/items in real time; call the returned Unsubscribe to
 * tear the listener down. The query is unordered (the UI re-sorts anyway, which
 * avoids needing an index). Doc times stay Firestore Timestamps, converted to
 * epoch-ms only at the UI edge. `onError` forwards permission/network errors so
 * the caller can surface them — a silent listener hides rules failures.
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
 * Manual add (eBay only): transactionally write a `pending` Item and bump
 * users/{uid}.itemCount, enforcing the advisory MAX_ITEMS_PER_USER cap. The item
 * stays `pending` until the poller hydrates it. Throws on a non-eBay URL, a
 * non-listing eBay URL, an over-cap user, or an already-tracked listing so the
 * form can surface the message.
 *
 * Identity is deterministic (itemDocId(site, listingId)) so a pasted URL and a
 * later capture of the same listing resolve to ONE doc — the tx.get() existence
 * check below IS the dedupe (client-SDK transactions can't run queries).
 */
export async function createPendingItem(uid: string, url: string): Promise<void> {
  const site = siteFromUrl(url);
  if (site !== 'ebay') {
    throw new Error('only ebay links rn');
  }
  const listingId = ebayListingIdFromUrl(url);
  if (!listingId) {
    throw new Error("that doesn't look like an ebay listing");
  }
  const canonicalUrl = canonicalEbayUrl(listingId);
  const db = getDb();
  const userRef = doc(db, 'users', uid);
  const itemRef = doc(db, 'users', uid, 'items', itemDocId(site, listingId));
  await runTransaction(db, async (tx) => {
    // Both reads must precede any write in a Firestore transaction.
    const itemSnap = await tx.get(itemRef);
    if (itemSnap.exists()) {
      throw new Error('already tracking this item');
    }
    const userSnap = await tx.get(userRef);
    const count = userSnap.data()?.itemCount ?? 0;
    if (count >= MAX_ITEMS_PER_USER) {
      throw new Error('Item Limit Reached');
    }
    tx.set(itemRef, {
      url: canonicalUrl,
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
 * Transactionally delete users/{uid}/items/{itemId} and decrement itemCount.
 *
 * NOTE: deleting a doc does NOT delete its subcollections. Once `history` docs
 * exist, removal will need a recursive delete.
 */
export async function removeItem(uid: string, itemId: string): Promise<void> {
  const db = getDb();
  const userRef = doc(db, 'users', uid);
  const itemRef = doc(db, 'users', uid, 'items', itemId);
  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    const count = userSnap.data()?.itemCount ?? 0;
    tx.delete(itemRef);
    tx.update(userRef, { itemCount: Math.max(0, count - 1) });
  });
}
