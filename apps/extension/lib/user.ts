// User-doc bootstrap. On first sign-in we create users/{uid}; on repeat sign-in
// the doc already exists and we leave it untouched. This is the FIRST client
// Firestore write — permitted by the Phase-1 per-user rules (step 3).
//
// SDK usage (getDb + firebase/firestore) lives here in the extension lib, the
// same pattern the item helpers will follow (lib/items.ts, steps 5/7/8).
// (Alternative, if you'd rather keep firebase/* fully encapsulated: move this
// into packages/firebase/src/users.ts and export it. Left here for now to match
// where items.ts is planned.)
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { getDb, type AuthUser } from '@dvl/firebase';

/**
 * Ensure users/{uid} exists. Idempotent: creates the doc with defaults on first
 * sign-in, no-op if it already exists.
 *
 * TODO (human):
 *  - const db = getDb(); const ref = doc(db, 'users', user.uid).
 *  - Run inside runTransaction(db, async (tx) => { ... }):
 *      const snap = await tx.get(ref);
 *      if (snap.exists()) return;            // idempotent no-op
 *      tx.set(ref, { ...fields below });
 *  - Use a transaction (NOT setDoc merge) so a popup + background double sign-in
 *    can't both create / clobber the doc.
 *  - Fields (see User in packages/firebase/src/types.ts):
 *      createdAt: serverTimestamp()
 *      email: user.email ?? null
 *      displayName: user.displayName ?? null
 *      itemCount: 0
 *      defaultNotify: { onOutbid: false, minutesBefore: null,
 *                       priceThreshold: null, priceThresholdDirection: null }  // pick sane defaults
 *      fcmTokens: {}                          // token-keyed MAP, not an array
 *  - Type the payload as WithFieldValue<User> so serverTimestamp() typechecks.
 */
export async function ensureUserDoc(user: AuthUser): Promise<void> {
  const db = getDb();

  const ref = doc(db, 'users', user.uid);

  await runTransaction(db, async (tx) => {
    const exist = await tx.get(ref);

    if (exist.exists()) {
      return;
    }

    tx.set(ref, {
      createdAt: serverTimestamp(),
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      itemCount: 0,
      defaultNotify: {
        onOutbid: false,
        minutesBefore: null,
        priceThreshold: null,
        priceThresholdDirection: null,
      },
      fcmTokens: {},
    });
  });
}
