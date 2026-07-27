// Firestore access for items is encapsulated here (same pattern as lib/user.ts);
// the dashboard/popup read the live list off the Zustand store, never Firestore.
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import type { WithId, Item, ItemData } from '@dvl/firebase';
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
 * The listing-content fields a capture is allowed to refresh on an existing
 * item, diffed against the stored doc. Returns ONLY the changed fields (a
 * Partial<Item>) so an empty result means "nothing changed, don't write" — the
 * write-only-diffs invariant, kept literal. Deliberately excludes notify /
 * group / addedVia / createdAt / polling+error fields: those are user config or
 * poller-owned, never touched by a capture.
 *
 * endTime is compared in millis (stored FsTimestamp.toMillis() vs endTimeMs)
 * and written back as a Timestamp. bidStatus is only ever included when the
 * capture actually read one (data.bidStatus != null) — a logged-out visit
 * returns null and must not clobber a 'winning'/'outbid' set earlier from a
 * logged-in page.
 */
function captureDiff(stored: Item, data: ItemData): Partial<Item> {
  const patch: Partial<Item> = {};
  if (stored.title !== data.title) patch.title = data.title;
  if (stored.imageUrl !== data.imageUrl) patch.imageUrl = data.imageUrl;
  if (stored.currency !== data.currency) patch.currency = data.currency;
  if (stored.currentPrice !== data.currentPrice) patch.currentPrice = data.currentPrice;
  if (stored.buyItNowPrice !== data.buyItNowPrice) patch.buyItNowPrice = data.buyItNowPrice;
  if (stored.bidCount !== data.bidCount) patch.bidCount = data.bidCount;
  if (stored.listingType !== data.listingType) patch.listingType = data.listingType;

  const nextStatus: Item['status'] = data.ended ? 'ended' : 'active';
  if (stored.status !== nextStatus) patch.status = nextStatus;

  const storedEndMs = stored.endTime?.toMillis() ?? null;
  if (storedEndMs !== data.endTimeMs) {
    patch.endTime = data.endTimeMs == null ? null : Timestamp.fromMillis(data.endTimeMs);
  }

  // null never clobbers a known bidStatus (only a logged-in page can set it).
  if (data.bidStatus != null && stored.bidStatus !== data.bidStatus) {
    patch.bidStatus = data.bidStatus;
  }
  return patch;
}

/**
 * Capture write path (Phase 2): upsert a captured ('save') or revisited
 * ('visit') listing for uid. Runs in the background worker. Returns what
 * happened so the worker can answer the content script (CaptureResponse).
 *
 * Identity is the deterministic itemDocId(site, listingId); the transaction's
 * tx.get() IS the dedupe check (client-SDK transactions can't run queries), so
 * re-watching a tracked listing under any URL shape can never create a second
 * doc. A 'save' on an untracked listing creates (advisory-capped); a 'visit'
 * on an untracked listing is ignored (passive refresh never creates). Either
 * mode updates a tracked item, but only writes when captureDiff is non-empty —
 * this also hydrates a manual-add 'pending' item for free on the first visit.
 */
export async function upsertCapturedItem(
  uid: string,
  data: ItemData,
  mode: 'save' | 'visit',
): Promise<'created' | 'updated' | 'unchanged' | 'ignored'> {
  const listingId = ebayListingIdFromUrl(data.url);
  if (!listingId) return 'ignored'; // never guess a doc id from a non-listing URL
  const db = getDb();
  const userRef = doc(db, 'users', uid);
  const itemRef = doc(db, 'users', uid, 'items', itemDocId(data.site, listingId));
  return runTransaction(db, async (tx) => {
    const itemSnap = await tx.get(itemRef);

    if (itemSnap.exists()) {
      const patch = captureDiff(itemSnap.data() as Item, data);
      if (Object.keys(patch).length === 0) return 'unchanged'; // write-only-diffs
      tx.update(itemRef, patch);
      return 'updated';
    }

    if (mode === 'visit') return 'ignored'; // passive refresh never creates

    // MISSING + 'save' — read the user (all reads must precede writes), enforce
    // the advisory cap, then write the full Item and bump the count.
    const userSnap = await tx.get(userRef);
    const count = userSnap.data()?.itemCount ?? 0;
    if (count >= MAX_ITEMS_PER_USER) {
      throw new Error('Item Limit Reached');
    }
    tx.set(itemRef, {
      url: data.url,
      site: data.site,
      listingType: data.listingType,
      addedVia: 'capture',
      createdAt: serverTimestamp(),
      title: data.title,
      imageUrl: data.imageUrl,
      currency: data.currency,
      currentPrice: data.currentPrice,
      buyItNowPrice: data.buyItNowPrice,
      bidCount: data.bidCount,
      endTime: data.endTimeMs == null ? null : Timestamp.fromMillis(data.endTimeMs),
      status: data.ended ? 'ended' : 'active',
      bidStatus: data.bidStatus ?? 'unknown',
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
    return 'created';
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
