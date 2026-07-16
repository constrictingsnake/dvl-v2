import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { createPendingItem } from '@/lib/items';

// Manual add — eBay only (step 7): paste an eBay listing URL -> a `pending` item.
// createPendingItem throws on a non-eBay URL / over cap; we surface the message
// inline. No success toast — the onSnapshot listener paints the new card. The
// submit button is the view's single hot-pink `brand` accent (design language).
export function AddItemForm() {
  const uid = useAppStore((s) => s.user?.uid);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      await createPendingItem(uid, url);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="PASTE AN EBAY LISTING URL…"
        className="flex-1 bg-transparent font-mono text-xs uppercase tracking-wider text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="flex-none bg-brand px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
      >
        Add
      </button>
      {error && <p className="font-mono text-xs text-neutral-500">{error}</p>}
    </form>
  );
}
