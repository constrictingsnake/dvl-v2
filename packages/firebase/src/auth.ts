// Firebase Auth helpers. The SDK stays encapsulated here so consumers (the
// extension, a future web companion) never import `firebase/*` directly.
//
// The *how you obtain the credential* differs by surface — the extension uses
// chrome.identity.launchWebAuthFlow, the web companion would use
// signInWithPopup — but both end in a Google credential exchanged here.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User as FirebaseUser,
  type Unsubscribe,
} from 'firebase/auth';
import { getFirebaseAuth } from './client';

/** The signed-in Firebase Auth user (distinct from the Firestore `User` doc). */
export type AuthUser = FirebaseUser;

/** Exchanges a Google OpenID `id_token` for a Firebase user. */
export async function signInWithGoogleIdToken(idToken: string): Promise<AuthUser> {
  const credential = GoogleAuthProvider.credential(idToken);
  const { user } = await signInWithCredential(getFirebaseAuth(), credential);
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
