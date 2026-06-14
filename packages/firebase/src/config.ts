// Firebase web config, read from WXT env at runtime — never hardcoded.
// The web config is not secret (it ships in the client bundle), but it lives in
// .env.local / .env.example so it stays swappable per environment. See CLAUDE.md step 5.

interface FirebaseEnv {
  WXT_PUBLIC_FIREBASE_API_KEY?: string;
  WXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  WXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  WXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  WXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  WXT_PUBLIC_FIREBASE_APP_ID?: string;
  WXT_PUBLIC_USE_EMULATORS?: string;
}

// Cast through `unknown` so this compiles both in this package's own tsc (where
// `import.meta.env` is untyped) and when the source is pulled into the
// extension's WXT-typed build (where ImportMetaEnv has different keys).
const env = (import.meta as unknown as { env: FirebaseEnv }).env;

function required(key: keyof FirebaseEnv): string {
  const value = env[key];
  if (!value) {
    throw new Error(
      `Missing ${key}. Copy apps/extension/.env.example to .env.local and fill in the Firebase web config.`,
    );
  }
  return value;
}

/** Builds the Firebase web config from env. Lazy, so importing never throws. */
export function getFirebaseConfig() {
  return {
    apiKey: required('WXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: required('WXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: required('WXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: required('WXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: required('WXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('WXT_PUBLIC_FIREBASE_APP_ID'),
  };
}

/** When true, the client connects to the local Emulator Suite (step 8). */
export const useEmulators = env.WXT_PUBLIC_USE_EMULATORS === 'true';
