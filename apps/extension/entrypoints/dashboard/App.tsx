import { observeAuthState, type AuthUser } from '@dvl/firebase';
import { useEffect, useState } from 'react';

// Dashboard — the full-page view, opened in its own tab from the popup. Holds
// the toolbar (search/sort/filter/group, wired in step 9) and the item list
// (cards + empty/loading states, step 6), fed by the shared store (step 2) via
// an onSnapshot listener (step 5).

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => observeAuthState(setUser), []);

  return (
    <div className="w-full h-full bg-white p-6 font-sans text-neutral-900">
      <header className="mb-6">
        <h1 className="font-display text-5xl">DVL</h1>
        <p className="mt-1 text-lg text-neutral-500">An auction tracker</p>
        <p className="mt-1 text-lg text-neutral-500"> {user?.displayName}</p>
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

export default App;
