// Firebase Auth helpers. The SDK stays encapsulated here so consumers (the
// extension, a future web companion) never import `firebase/*` directly.
//
// The *how you obtain the credential* differs by surface — the extension uses
// chrome.identity.launchWebAuthFlow, the web companion would use
// signInWithPopup — but both end in a Google credential exchanged here.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
  type User as FirebaseUser,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth } from './client';
import { useEmulators } from './config';

/** The signed-in Firebase Auth user (distinct from the Firestore `User` doc). */
export type AuthUser = FirebaseUser;

/** Exchanges a Google OpenID `id_token` for a Firebase user. */
export async function signInWithGoogleIdToken(idToken: string): Promise<AuthUser> {
  const credential = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(getFirebaseAuth(), credential);
  return user;
}

/**
 * DEV ONLY — anonymous sign-in against the Auth emulator, so the app can be
 * exercised without the Google OAuth flow (which Google blocks in the WXT dev
 * browser). Mints a REAL emulator session with a real uid, so Firestore rules
 * pass and the full listener/write path works locally — unlike faking a user in
 * the store. Hard-guarded to the emulator: throws if WXT_PUBLIC_USE_EMULATORS
 * isn't 'true', so it can never run against prod. Remove the SignInScreen dev
 * button (or this helper) before release.
 */
export async function signInAnonymouslyDev(): Promise<AuthUser> {
  if (!useEmulators) {
    throw new Error('signInAnonymouslyDev is emulator-only; set WXT_PUBLIC_USE_EMULATORS=true');
  }
  const { user } = await signInAnonymously(getFirebaseAuth());
  return user;
}

/** Signs the current user out. */
export function signOutUser(): Promise<void> {
  return signOut(getFirebaseAuth());
}

/** Subscribes to auth-state changes; returns the unsubscribe function. */
export function observeAuthState(callback: (user: AuthUser | null) => void): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}
