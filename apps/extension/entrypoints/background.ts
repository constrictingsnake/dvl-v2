import { getFirebaseApp, getFirebaseAuth, useEmulators } from '@dvl/firebase';
import { signInWithGoogle, signOutGoogle } from '@/lib/auth';
import { upsertCapturedItem } from '@/lib/capture-write';
import type { CaptureMessage } from '@/lib/capture-messages';

export default defineBackground(() => {
  const app = getFirebaseApp();
  console.log('Firebase initialized', {
    projectId: app.options.projectId,
    useEmulators,
  });

  // Auth runs here, not in the popup: launchWebAuthFlow opens a focused window
  // that tears the popup down mid-flow, killing the credential exchange. The
  // service worker persists, finishes the exchange, and writes auth state to
  // IndexedDB, which the popup reads on its next open.
  browser.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
    if (message?.type === 'auth:signIn') {
      signInWithGoogle()
        .then((user) => sendResponse({ ok: true, uid: user.uid }))
        .catch((e: unknown) =>
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
      return true; // keep the channel open for the async response
    }
    if (message?.type === 'capture:save' || message?.type === 'capture:visit') {
      // authStateReady() FIRST: the worker may have just woken up for this very
      // message, and currentUser stays null until IndexedDB persistence
      // rehydrates the session.
      const msg = message as CaptureMessage;
      const auth = getFirebaseAuth();
      auth
        .authStateReady()
        .then(() => {
          const uid = auth.currentUser?.uid;
          if (!uid) return sendResponse({ ok: false, error: 'not signed in' });
          const mode = msg.type === 'capture:save' ? 'save' : 'visit';
          return upsertCapturedItem(uid, msg.data, mode).then((outcome) =>
            sendResponse({ ok: true, outcome }),
          );
        })
        .catch((e: unknown) =>
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
      return true;
    }
    if (message?.type === 'auth:signOut') {
      signOutGoogle()
        .then(() => sendResponse({ ok: true }))
        .catch((e: unknown) =>
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
        );
      return true;
    }
    return false;
  });
});
