import { useState } from 'react';
import { signInAnonymouslyDev, useEmulators } from '@dvl/firebase';
import { requestSignIn } from '@/lib/auth-messages';

// Signed-out surface: the single sign-in call to action. Shown by AuthGate when
// there's no authenticated user. Layout follows the "A — SIGNED OUT" popup cell
// from the imported Brutalist design (Claude Design project
// e54948d8-4ca2-41ff-a1db-15e8956b6206, Popup Brutalist.dc.html): status strip,
// solid-pink primary action (inverts to neutral-900 on hover), quiet dev-sign-in
// cell. Renders inside the bordered box App.tsx already provides — no outer
// border/background here.

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

  async function handleDevSignIn() {
    // DEV ONLY — bypasses Google OAuth (blocked in the WXT dev browser) with an
    // anonymous Auth-emulator session. Shown only when emulators are on.
    setBusy(true);
    setError(null);
    try {
      await signInAnonymouslyDev();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-neutral-900 px-5 py-2 font-mono text-[9px] uppercase tracking-wider text-neutral-900">
        <span className="inline-block h-2 w-2 bg-brand" />
        Not signed in
      </div>

      <button
        onClick={handleSignIn}
        disabled={busy}
        className="block w-full border-b border-neutral-900 bg-brand p-5 text-left transition-colors hover:bg-neutral-900 disabled:opacity-50"
      >
        <div className="font-display text-[22px] leading-tight text-white">Sign in with Google</div>
        <div className="mt-2.5 font-mono text-[9px] uppercase tracking-wider text-white/80">
          Continue →
        </div>
      </button>

      {useEmulators && (
        <button
          onClick={handleDevSignIn}
          disabled={busy}
          className="block w-full p-4 text-left transition-colors hover:bg-[#efedea] disabled:opacity-50"
        >
          <div className="text-[11.5px] text-neutral-900">Dev sign-in</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-neutral-400">
            Emulator
          </div>
        </button>
      )}

      {error && <p className="border-t border-neutral-900 p-4 text-xs text-red-600">{error}</p>}
    </div>
  );
}
