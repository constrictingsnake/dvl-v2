import { AuthGate } from '@/components/AuthGate';
import { AddItemForm } from '@/components/AddItemForm';
import { DashboardToolbar } from '@/components/DashboardToolbar';
import { ItemList } from '@/components/ItemList';
import { useItemsSync } from '@/lib/useItemsSync';
import { useAppStore } from '@/store/useAppStore';

// Dashboard — the full-page view, opened in its own tab from the popup. Shell
// follows the "02 — GRID" brutalist layout (Claude Design project
// e54948d8-4ca2-41ff-a1db-15e8956b6206): warm-grey page background, one hard
// 2px-bordered container, mono section labels. AuthGate drives auth -> store
// and gates the whole surface; DashboardHome is the signed-in content.
// useItemsSync (step 5) feeds the store; AddItemForm (step 7), DashboardToolbar
// (step 9), and ItemList (steps 5/6/8) render off it.

function DashboardHome() {
  const user = useAppStore((s) => s.user);
  const items = useAppStore((s) => s.items);
  useItemsSync();

  return (
    <div className="flex h-full w-full flex-col bg-neutral-50 font-sans text-neutral-900">
      <header className="flex flex-none items-end justify-between border-b-2 border-neutral-900 px-10 py-8">
        <div>
          <h1 className="font-display text-4xl leading-none">DVL</h1>
          {user?.displayName && (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              {user.displayName}
            </p>
          )}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-900">
          {items.length} {items.length === 1 ? 'lot' : 'lots'} tracked
        </span>
      </header>

      <div className="flex-none border-b-2 border-neutral-900 px-10 py-5">
        <AddItemForm />
      </div>

      <div className="flex-none border-b-2 border-neutral-900 px-10 py-5">
        <DashboardToolbar />
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto px-10 py-8">
        <ItemList />
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
