import { useEffect, useState } from 'react';
import { observeAuthState, type AuthUser } from '@dvl/firebase';

// Popup — the compact toolbar window. Shows auth state and opens the full
// dashboard tab. The sign in/out below is the Phase-0 smoke flow; step 4 turns
// it into the real signed-out/signed-in screen (and step 2 moves auth/items to
// the shared store).

type AuthResponse = { ok: true; uid?: string } | { ok: false; error: string };

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => observeAuthState(setUser), []);

  async function send(type: 'auth:signIn' | 'auth:signOut') {
    setBusy(true);
    setError(null);
    try {
      const res = (await browser.runtime.sendMessage({ type })) as AuthResponse | undefined;
      if (res && !res.ok) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function openDashboard() {
    const url = browser.runtime.getURL('/dashboard.html');
    browser.tabs.create({ url });
  }

  return (
    <div className="w-72 bg-white p-6 font-sans text-neutral-900">
      <header className="mb-6">
        <h1 className="font-display text-2xl">DVL</h1>
        <p className="mt-1 text-sm text-neutral-500">An auction tracker</p>
      </header>

      {user ? (
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">Welcome, {user.displayName}</p>
          <button
            onClick={() => send('auth:signOut')}
            disabled={busy}
            className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
          >
            Sign out
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => send('auth:signIn')}
            disabled={busy}
            className="w-full  px-4 py-2 text-sm text-left font-medium text-brand hover:opacity-90 disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <button
            onClick={() => openDashboard()}
            className="w-full px-4 py-2 text-sm text-left text-neutral-500 hover:text-neutral-900"
          >
            Open dashboard
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

export default App;
