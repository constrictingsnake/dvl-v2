// Capture write path — runs ONLY in the MV3 background service worker, so it
// uses the Firestore Lite SDK (fetch-based). The full SDK's RPCs use
// XMLHttpRequest via Closure XhrIo, which doesn't exist in a service worker and
// fails every get/transaction with an empty error. Lite has no onSnapshot, but
// the worker never listens — the dashboard owns real-time reads (lib/items.ts,
// full SDK). Keep the two SDKs in separate modules: one context, one SDK.
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore/lite';
import type { Item, ItemData } from '@dvl/firebase';
import { getLiteDb, MAX_ITEMS_PER_USER } from '@dvl/firebase';
import { ebayListingIdFromUrl, itemDocId } from '@dvl/adapters';

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
  const db = getLiteDb();
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
