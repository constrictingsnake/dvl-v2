import { useAppStore } from '@/store/useAppStore';
import { removeItem } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

// The dashboard item list. Reads items off the store (fed by the step-5 onSnapshot
// listener) and renders a card each, with loading + empty states. Step 9 switches
// the source from raw `items` to a `selectVisibleItems` selector so
// search/sort/filter/group apply.
export function ItemList() {
  const status = useAppStore((s) => s.status);
  const items = useAppStore((s) => s.items);
  const uid = useAppStore((s) => s.user?.uid);

  if (status === 'loading')
    return <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">Loading…</p>;
  if (items.length === 0)
    return (
      <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">
        No items yet — your tracked auctions will show up here.
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
