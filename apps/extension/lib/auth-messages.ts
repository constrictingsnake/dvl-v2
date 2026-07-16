// Thin wrappers over the background auth messages. The interactive OAuth flow
// (launchWebAuthFlow) MUST run in the background service worker — a focused
// window tears the popup down mid-flow — so UI components ask the worker to run
// it via runtime messaging instead of calling signInWithGoogle() directly.
// See entrypoints/background.ts (the listener) and lib/auth.ts (the flow).

/** Response shape returned by the background auth listener. */
export type AuthResponse = { ok: true; uid?: string } | { ok: false; error: string };

/**
 * Ask the background worker to run Google sign-in.
 * TODO (human): const res = await browser.runtime.sendMessage({ type: 'auth:signIn' });
 *   return it as AuthResponse; normalize undefined / thrown errors -> { ok:false, error }.
 */
export async function requestSignIn(): Promise<AuthResponse> {
  try {
    const res = await browser.runtime.sendMessage({ type: 'auth:signIn' });
    return res ?? { ok: false, error: 'no response' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Ask the background worker to sign out.
 * TODO (human): browser.runtime.sendMessage({ type: 'auth:signOut' }) -> AuthResponse.
 */
export async function requestSignOut(): Promise<AuthResponse> {
  try {
    const res = await browser.runtime.sendMessage({ type: 'auth:signOut' });
    return res ?? { ok: false, error: 'no response from background' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
