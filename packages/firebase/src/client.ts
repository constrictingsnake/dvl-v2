// Shared Firebase client init. Lazy singletons so any context (background,
// popup, content script) gets the same app, and importing never side-effects.
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import {
  getFirestore as getLiteFirestore,
  connectFirestoreEmulator as connectLiteEmulator,
  type Firestore as LiteFirestore,
} from 'firebase/firestore/lite';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';
import { getFirebaseConfig, useEmulators } from './config';

// Emulator Suite defaults — firebase.json (step 8) will match these ports.
const EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const FIRESTORE_EMULATOR_PORT = 8080;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let liteDb: LiteFirestore | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(getFirebaseConfig());
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    // Persist to IndexedDB explicitly. The popup and the background service
    // worker are separate JS contexts that share the extension origin's
    // IndexedDB, so a sign-in completed in the worker shows up in the popup and
    // survives worker restarts. Default getAuth() would fall back to in-memory
    // persistence in the worker and not survive.
    auth = initializeAuth(getFirebaseApp(), { persistence: indexedDBLocalPersistence });
    if (useEmulators) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
        disableWarnings: true,
      });
    }
  }
  return auth;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
    if (useEmulators) {
      connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    }
  }
  return db;
}

/**
 * Firestore for the MV3 background service worker ONLY. The full SDK's RPCs go
 * through Closure `XhrIo` (XMLHttpRequest), which does not exist in a service
 * worker — every get/transaction fails there with an empty error. The Lite SDK
 * is fetch-based, so it works in the worker; it has no real-time listeners, but
 * the worker only ever reads/writes (the dashboard owns the onSnapshot). Never
 * mix this with getDb() in the same JS context — one context, one SDK.
 */
export function getLiteDb(): LiteFirestore {
  if (!liteDb) {
    liteDb = getLiteFirestore(getFirebaseApp());
    if (useEmulators) {
      connectLiteEmulator(liteDb, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    }
  }
  return liteDb;
}

/**
 * Returns Messaging, or null where it isn't supported (e.g. the MV3 service
 * worker has no `window`). Real FCM wiring lands in Phase 4.
 */
export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!(await isSupported())) {
    return null;
  }
  return getMessaging(getFirebaseApp());
}
