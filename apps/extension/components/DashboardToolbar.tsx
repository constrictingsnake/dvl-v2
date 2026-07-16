import { useAppStore } from '@/store/useAppStore';
import type { SortKey, StatusFilter } from '@/store/useAppStore';
import type { ItemStatus } from '@dvl/firebase';

const STATUSES: ItemStatus[] = ['pending', 'active', 'ended', 'stale', 'error'];

const selectCls =
  'bg-transparent font-mono text-[10px] uppercase tracking-wider text-neutral-500 ' +
  'hover:text-neutral-900 focus:text-neutral-900 focus:outline-none cursor-pointer';

export function DashboardToolbar() {
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const sort = useAppStore((s) => s.sort);
  const setSort = useAppStore((s) => s.setSort);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const group = useAppStore((s) => s.group);
  const setGroup = useAppStore((s) => s.setGroup);
  const items = useAppStore((s) => s.items);

  // Distinct non-null groups from the live items; the picker stays hidden until
  // something writes a `group` (nothing does yet — forward-wiring, not dead code).
  const groups = [...new Set(items.map((i) => i.group).filter((g): g is string => g != null))];

  return (
    <div className="flex items-center gap-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="SEARCH…"
        className="flex-1 bg-transparent font-mono text-xs uppercase tracking-wider text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
      />

      <select
        className={selectCls}
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
      >
        <option value="endTime">SORT · ENDING</option>
        <option value="price">SORT · PRICE</option>
        <option value="createdAt">SORT · ADDED</option>
      </select>

      <select
        className={selectCls}
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
      >
        <option value="all">ALL STATUS</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.toUpperCase()}
          </option>
        ))}
      </select>

      {groups.length > 0 && (
        <select
          className={selectCls}
          value={group ?? ''}
          onChange={(e) => setGroup(e.target.value || null)}
        >
          <option value="">ALL GROUPS</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g.toUpperCase()}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
