import { create } from 'zustand';
import type { AuthUser, WithId, Item, ItemStatus } from '@dvl/firebase';

// Shared app store (Zustand) — the single source of truth the popup and the
// dashboard both read from. Three concerns live here:
//   - auth:  the signed-in user (mirrors observeAuthState; wired in step 4)
//   - items: the live Firestore item list (fed by the onSnapshot listener, step 5)
//   - ui:    view state for the dashboard shell (search/sort/filter/group, step 9)
// This step only establishes the typed shape + action signatures; the bodies are
// `// TODO:` — the human fills them in as the later steps land.

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
  /** Set (or clear) the signed-in user; drives the signed-out/in screens. */
  setUser: (user: AuthUser | null) => void;
  /** Replace the item list from the latest onSnapshot payload. */
  setItems: (items: WithId<Item>[]) => void;
  /** Move the shell between loading / ready / error. */
  setStatus: (status: AppStatus) => void;
  /** Set (or clear) the current error message. */
  setError: (error: string | null) => void;
  /** Update the title search query. */
  setSearch: (search: string) => void;
  /** Change the sort order. */
  setSort: (sort: SortKey) => void;
  /** Change the status filter. */
  setStatusFilter: (filter: StatusFilter) => void;
  /** Select a watchlist group (or null for all). */
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
 * Derived list for the dashboard (step 9): apply search + statusFilter + group,
 * then sort by `sort`. The list (ItemList) reads THIS instead of raw `items` so
 * filtering/sorting lives in one place. Pure function of state — call as
 * `useAppStore(selectVisibleItems)`.
 *
 * TODO (human):
 *  - Start from state.items; filter in order:
 *      search: case-insensitive substring on (item.title ?? '') — skip if search is ''.
 *      statusFilter: keep item.status === filter — skip if 'all'.
 *      group: keep item.group === state.group — skip if group is null (show all).
 *  - Sort a COPY (don't mutate state.items):
 *      'endTime'  → by endTime ascending; null endTime (BIN/GTC) sorts last.
 *      'price'    → by currentPrice; null prices last.
 *      'createdAt'→ by createdAt descending (newest first).
 *    endTime/createdAt are FsTimestamp — compare via .toMillis().
 *  - Return the filtered+sorted array.
 */
export function selectVisibleItems(state: AppState): WithId<Item>[] {
  // TODO (human): implement per the checklist above.
  return state.items; // placeholder — no filtering/sorting yet
}
