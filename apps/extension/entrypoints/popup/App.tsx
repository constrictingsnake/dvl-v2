import { useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAppStore } from '@/store/useAppStore';
import { requestSignOut } from '@/lib/auth-messages';
import { useItemsSync } from '@/lib/useItemsSync';

// Popup — the compact toolbar window (288px = Tailwind w-72, matching the
// design's real toolbar width). Layout follows the "B — SIGNED IN" popup cell
// from the imported Brutalist design (Claude Design project
// e54948d8-4ca2-41ff-a1db-15e8956b6206, Popup Brutalist.dc.html); the header
// cell is shared with SignInScreen's "A — SIGNED OUT" state, so it lives here in
// App() rather than inside AuthGate's branches. AuthGate renders the signed-out
// screen when there's no user; PopupHome is the signed-in content.

function PopupHome() {
  const user = useAppStore((s) => s.user);
  const items = useAppStore((s) => s.items);
  useItemsSync();
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
    <div>
      <div className="flex items-center justify-between border-b border-neutral-900 px-5 py-2.5">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-400">
            Signed in as
          </div>
          <div className="mt-0.5 text-[12.5px] text-neutral-900">{user?.displayName}</div>
        </div>
        <span className="inline-block h-2 w-2 flex-none bg-brand" />
      </div>

      <div className="flex items-baseline justify-between border-b border-neutral-900 px-5 py-3">
        <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-500">
          Tracking
        </span>
        <span className="font-display text-[22px] leading-none text-neutral-900">
          {String(items.length).padStart(2, '0')}{' '}
          <span className="font-mono text-[10px] tracking-wider text-neutral-400">LOTS</span>
        </span>
      </div>

      <button
        onClick={openDashboard}
        className="flex w-full items-center justify-between border-b border-neutral-900 bg-brand px-5 py-[17px] transition-colors hover:bg-neutral-900"
      >
        <span className="text-[13px] font-medium tracking-wide text-white">Open dashboard</span>
        <span className="text-[15px] text-white">→</span>
      </button>

      <button
        onClick={handleSignOut}
        disabled={busy}
        className="block w-full px-5 py-3.5 text-left transition-colors hover:bg-[#efedea] disabled:opacity-50"
      >
        <span className="font-mono text-[11.5px] uppercase tracking-wider text-neutral-500">
          Sign out
        </span>
      </button>

      {error && <p className="border-t border-neutral-900 p-4 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function App() {
  return (
    <div className="w-72 border-2 border-neutral-900 bg-neutral-50 font-sans text-neutral-900">
      <header className="border-b-2 border-neutral-900 px-5 py-[18px]">
        <h1 className="font-display text-[32px] leading-[0.9]">DVL</h1>
        <p className="mt-2.5 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          An auction tracker
        </p>
      </header>
      <AuthGate>
        <PopupHome />
      </AuthGate>
    </div>
  );
}

export default App;
