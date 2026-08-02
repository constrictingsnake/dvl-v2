import { useShallow } from 'zustand/react/shallow';
import { selectVisibleItems, useAppStore } from '@/store/useAppStore';
import { removeItem } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

export function ItemList() {
  const status = useAppStore((s) => s.status);
  // selectVisibleItems builds a fresh filtered+sorted array each call; without a
  // shallow-equality wrapper Zustand's useSyncExternalStore sees a new reference
  // every render and loops forever (React #185). useShallow returns the cached
  // array while its contents are unchanged.
  const items = useAppStore(useShallow(selectVisibleItems));
  const totalItems = useAppStore((s) => s.items.length);
  const uid = useAppStore((s) => s.user?.uid);

  if (status === 'loading')
    return <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">Loading…</p>;
  if (items.length === 0)
    return (
      <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">
        {totalItems === 0
          ? 'No items yet — your tracked auctions will show up here.'
          : 'No items match the current filters.'}
      </p>
    );

  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item, i) => (
        <ItemCard
          key={item.id}
          item={item}
          index={i + 1}
          onRemove={(id) => uid && removeItem(uid, id)}
        />
      ))}
    </div>
  );
}
