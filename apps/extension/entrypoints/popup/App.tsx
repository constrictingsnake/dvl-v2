import { useEffect, useState } from 'react';
import { observeAuthState, type AuthUser } from '@dvl/firebase';
import './App.css';

type AuthResponse = { ok: true; uid?: string } | { ok: false; error: string };

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the UI in sync with Firebase auth state across reloads. The background
  // worker owns the flow; this picks up the persisted result on (re)open.
  useEffect(() => observeAuthState(setUser), []);

  async function send(type: 'auth:signIn' | 'auth:signOut') {
    setBusy(true);
    setError(null);
    try {
      const res = (await browser.runtime.sendMessage({ type })) as AuthResponse | undefined;
      if (res && !res.ok) setError(res.error);
    } catch (e) {
      // The popup is usually torn down when the Google window takes focus, so
      // this await may never resolve — the background finishes regardless and
      // the result shows on next open. Only real errors land here.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h1>Auction Tracker</h1>

      {user ? (
        <>
          <p>
            Signed in as <strong>{user.displayName ?? user.email}</strong>
          </p>
          <p className="read-the-docs">uid: {user.uid}</p>
          <button onClick={() => send('auth:signOut')} disabled={busy}>
            Sign out
          </button>
        </>
      ) : (
        <button onClick={() => send('auth:signIn')} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
      )}

      {error && <p style={{ color: 'crimson', maxWidth: 280 }}>{error}</p>}
    </div>
  );
}

export default App;
