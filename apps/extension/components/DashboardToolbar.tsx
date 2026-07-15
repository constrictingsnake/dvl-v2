import { useAppStore } from '@/store/useAppStore';

// Dashboard shell controls (step 9): title search, sort, status filter, and
// watchlist group surfacing — all client-side over the store's ui slice. This is
// shell POLISH, not an engine: wire the inputs to the setters; the actual
// filtering/sorting is done by selectVisibleItems (store), which ItemList reads.
//
// Design language (CLAUDE.md): quiet controls — ghost/text styling, neutral,
// left-aligned. The one pink accent on this view belongs to AddItemForm's submit,
// not to a toolbar control.

/**
 * TODO (human):
 *  - search: <input> bound to s.search / s.setSearch (controlled).
 *  - sort: <select> over SortKey ('endTime' | 'price' | 'createdAt') → s.setSort.
 *  - statusFilter: <select> over StatusFilter ('all' | ItemStatus) → s.setStatusFilter.
 *  - group: surface the distinct item.group values (derive from s.items) as a
 *      picker → s.setGroup(value | null). null = show all.
 *  - Keep it minimal and on-brand; no need for fancy dropdown components.
 */
export function DashboardToolbar() {
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);

  // TODO (human): add the sort / filter / group controls per the checklist above.
  return (
    <div className="flex items-center gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="SEARCH…"
        className="flex-1 bg-transparent font-mono text-xs uppercase tracking-wider text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
      />
      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
        Sort / Filter / Group
      </span>
    </div>
  );
}
