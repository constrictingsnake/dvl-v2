import { useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { requestSignOut } from '@/lib/auth-messages';

// Popup — the compact toolbar window. AuthGate drives auth -> store and renders
// the signed-out screen; PopupHome is the signed-in content (read from the store).

function PopupHome() {
  const user = useAppStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestSignOut();
      if (!res.ok) setError(res.error);
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
    <div className="space-y-3">
      <p className="text-sm text-neutral-700">Welcome, {user?.displayName}</p>
      <button
        onClick={openDashboard}
        className="block w-full px-4 py-2 text-left text-sm text-neutral-500 hover:text-neutral-900"
      >
        Open dashboard
      </button>
      <button
        onClick={handleSignOut}
        disabled={busy}
        className="text-sm text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
      >
        Sign out
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function App() {
  return (
    <div className="w-72 bg-white p-6 font-sans text-neutral-900">
      <header className="mb-6">
        <h1 className="font-display text-2xl">DVL</h1>
        <p className="mt-1 text-sm text-neutral-500">An auction tracker</p>
      </header>
      <AuthGate>
        <PopupHome />
      </AuthGate>
    </div>
  );
}

export default App;
