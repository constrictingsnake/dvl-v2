import type { WithId, Item } from '@dvl/firebase';
import { formatMoney } from '@/lib/formatMoney';
import { formatEndTime, isEndingSoon } from '@/lib/formatTime';

// One tracked auction, rendered as a card. Reads a single item; the remove
// control calls back up to the list (which owns the removeItem write). Follows
// the brutalist design language (see CLAUDE.md): hard 1px border, numbered lot
// swatch, monospace data columns, pink-invert end badge when ending soon.

interface ItemCardProps {
  item: WithId<Item>;
  onRemove: (itemId: string) => void;
  /** 1-based position in the visible list — renders as the "01" lot number on the swatch. */
  index?: number;
}

export function ItemCard({ item, onRemove, index }: ItemCardProps) {
  const endingSoon = isEndingSoon(item.endTime);

  return (
    <div className="flex gap-4 border border-neutral-900 bg-neutral-50 p-5">
      <div className="relative h-16 w-16 flex-none overflow-hidden border border-neutral-900">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(45deg,#171717,#171717_1px,transparent_1px,transparent_7px)]" />
        )}
        {index != null && (
          <span className="absolute bottom-0.5 left-0.5 bg-neutral-50 px-1 font-mono text-[8px] text-neutral-900">
            {String(index).padStart(2, '0')}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-display text-lg leading-tight text-neutral-900">
            {item.title ?? 'Pending listing'}
          </h3>
          <button
            onClick={() => onRemove(item.id)}
            className="flex-none font-mono text-[10px] uppercase tracking-wide text-neutral-400 hover:text-neutral-900"
          >
            Remove
          </button>
        </div>

        <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-neutral-500">
          <span>{item.site}</span>
          {item.status !== 'active' && <span>· {item.status}</span>}
          {item.bidStatus !== 'unknown' && <span>· {item.bidStatus}</span>}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-sm text-neutral-900">
            {formatMoney(item.currentPrice, item.currency)}
            {item.bidCount != null && (
              <span className="ml-1.5 font-mono text-[10px] text-neutral-500">
                · {item.bidCount} bids
              </span>
            )}
          </span>
          <span
            className={
              endingSoon
                ? 'bg-brand px-1.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wide text-white'
                : 'font-mono text-xs uppercase text-neutral-900'
            }
          >
            {formatEndTime(item.endTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
