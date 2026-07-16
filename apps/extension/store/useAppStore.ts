import { create } from 'zustand';
import type { AuthUser, WithId, Item, ItemStatus } from '@dvl/firebase';

// Shared app store (Zustand) — the single source of truth the popup and the
// dashboard both read from: the signed-in user, the live Firestore item list, and
// the dashboard's view state (search/sort/filter/group).

/** How the dashboard list is ordered. */
export type SortKey = 'endTime' | 'price' | 'createdAt';

/** Status filter — a single `ItemStatus`, or 'all' for no filtering. */
export type StatusFilter = ItemStatus | 'all';

/** Top-level load state for the UI shell. */
export type AppStatus = 'loading' | 'ready' | 'error';

interface AppState {
  // --- auth ---
  user: AuthUser | null;

  // --- items ---
  items: WithId<Item>[];

  // --- ui slice ---
  status: AppStatus;
  error: string | null;
  search: string;
  sort: SortKey;
  statusFilter: StatusFilter;
  group: string | null; // active watchlist group; null = show all

  // --- actions ---
  setUser: (user: AuthUser | null) => void;
  setItems: (items: WithId<Item>[]) => void;
  setStatus: (status: AppStatus) => void;
  setError: (error: string | null) => void;
  setSearch: (search: string) => void;
  setSort: (sort: SortKey) => void;
  setStatusFilter: (filter: StatusFilter) => void;
  setGroup: (group: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // --- initial state ---
  user: null,
  items: [],
  status: 'loading',
  error: null,
  search: '',
  sort: 'endTime',
  statusFilter: 'all',
  group: null,

  // --- actions ---
  setUser: (user) => set({ user }),
  setItems: (items) => set({ items }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? 'error' : 'ready' }),
  setSearch: (search) => set({ search }),
  setSort: (sort) => set({ sort }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setGroup: (group) => set({ group }),
}));

/**
 * Derived list for the dashboard: filter (search → statusFilter → group), then
 * sort a COPY (mutating state.items breaks Zustand equality / React renders).
 * Null endTime (BIN/GTC) and null prices sort last; createdAt is newest-first.
 * Call as `useAppStore(selectVisibleItems)`.
 */
export function selectVisibleItems(state: AppState): WithId<Item>[] {
  const query = state.search.trim().toLowerCase();

  const filtered = state.items.filter((item) => {
    if (query && !(item.title ?? '').toLowerCase().includes(query)) return false;
    if (state.statusFilter !== 'all' && item.status !== state.statusFilter) return false;
    if (state.group !== null && item.group !== state.group) return false;
    return true;
  });

  const asc = (a: number | null, b: number | null) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  };

  return [...filtered].sort((a, b) => {
    switch (state.sort) {
      case 'endTime':
        return asc(a.endTime?.toMillis() ?? null, b.endTime?.toMillis() ?? null);
      case 'createdAt':
        // newest first; a just-written item's serverTimestamp is briefly null
        return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);
      case 'price':
        return asc(a.currentPrice ?? null, b.currentPrice ?? null);
    }
  });
}
