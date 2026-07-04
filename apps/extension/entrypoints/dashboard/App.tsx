import { AuthGate } from '@/components/AuthGate';
import { useAppStore } from '@/store/useAppStore';

// Dashboard — the full-page view, opened in its own tab from the popup. AuthGate
// drives auth -> store and gates the whole surface; DashboardHome is the
// signed-in content. The toolbar (step 9) and item list (steps 5/6) land here.

function DashboardHome() {
  const user = useAppStore((s) => s.user);

  return (
    <div className="h-full w-full bg-white p-6 font-sans text-neutral-900">
      <header className="mb-6">
        <h1 className="font-display text-5xl">DVL</h1>
        <p className="mt-1 text-lg text-neutral-500">An auction tracker</p>
        <p className="mt-1 text-lg text-neutral-500">{user?.displayName}</p>
      </header>

      <div className="mb-6 flex items-center gap-3 border-b border-neutral-200 pb-4">
        <input
          type="text"
          placeholder="Search auctions…"
          className="flex-1 bg-transparent text-sm placeholder:text-neutral-400 focus:outline-none"
        />
        <span className="text-sm text-neutral-400">Sort · Filter · Group</span>
      </div>

      <main className="text-sm text-neutral-400">
        No items yet — your tracked auctions will show up here.
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <DashboardHome />
    </AuthGate>
  );
}

export default App;
