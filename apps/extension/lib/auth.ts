// Google sign-in for the MV3 extension.
//
// We use `chrome.identity.launchWebAuthFlow` (NOT `signInWithPopup`, which can't
// run in an extension) against a *Web application* OAuth client whose redirect
// URI is `https://<extension-id>.chromiumapp.org/`. The flow returns a Google
// OpenID `id_token`, which we exchange into a Firebase user with
// `signInWithCredential`. See CLAUDE.md Phase 0 step 7.
import { signInWithGoogleIdToken, signOutUser, type AuthUser } from '@dvl/firebase';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

// WXT inlines WXT_PUBLIC_* at build time; cast since the generated ImportMetaEnv
// doesn't know our custom key.
const clientId = (import.meta.env as Record<string, string | undefined>)
  .WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;

/** Hex nonce for OAuth implicit-flow replay protection. */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Runs the interactive Google consent flow and signs the user into Firebase.
 * Resolves with the Firebase user. Throws if the user cancels or no token comes
 * back.
 */
export async function signInWithGoogle(): Promise<AuthUser> {
  if (!clientId) {
    throw new Error(
      'Missing WXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID. Add the Web-application OAuth ' +
        'client ID to apps/extension/.env.local (see .env.example).',
    );
  }

  // Always matches the actual runtime extension ID; the pinned manifest key
  // makes it the registered `https://<id>.chromiumapp.org/`.
  const redirectUri = browser.identity.getRedirectURL();
  const nonce = randomNonce();

  const authUrl = `${GOOGLE_AUTH_ENDPOINT}?${new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    nonce,
    prompt: 'select_account',
  }).toString()}`;

  const redirectResponse = await browser.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });
  if (!redirectResponse) {
    throw new Error('OAuth flow returned no redirect URL.');
  }

  // Google returns tokens in the URL fragment: #id_token=...&...
  const fragment = new URL(redirectResponse).hash.slice(1);
  const idToken = new URLSearchParams(fragment).get('id_token');
  if (!idToken) {
    const error = new URLSearchParams(fragment).get('error');
    throw new Error(`No id_token in OAuth response${error ? ` (error: ${error})` : ''}.`);
  }

  return signInWithGoogleIdToken(idToken);
}

/** Signs the current user out of Firebase (handy for re-testing the flow). */
export async function signOutGoogle(): Promise<void> {
  await signOutUser();
}
