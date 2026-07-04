import { useState } from 'react';
import { requestSignIn } from '@/lib/auth-messages';

// Signed-out surface: the single sign-in call to action. Shown by AuthGate when
// there's no authenticated user. Keep it on-brand (Design language in CLAUDE.md):
// neutral base, one hot-pink accent on the primary action, left-aligned text.

export function SignInScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    // Wiring only — requestSignIn() is still a stub (throws until implemented).
    // On success, observeAuthState -> store flips the view to signed-in; no
    // manual navigation needed here.
    setBusy(true);
    setError(null);
    try {
      const res = await requestSignIn();
      if (!res.ok) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // TODO (human): build the layout — wordmark + tagline + the primary button.
  return (
    <div className="p-6">
      {/* TODO: on-brand sign-in layout */}
      <button
        onClick={handleSignIn}
        disabled={busy}
        className="text-left text-sm font-medium text-brand disabled:opacity-50"
      >
        Sign in with Google
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
