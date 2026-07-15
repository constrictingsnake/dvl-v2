import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { createPendingItem } from '@/lib/items';

// Manual add (step 7): paste a listing URL -> a `pending` item. Completes the
// write -> listener -> card loop without content scripts. The site is detected
// from the host inside createPendingItem (siteFromUrl); this form only collects
// the URL, submits, and surfaces validation / over-cap errors.
//
// Design language (CLAUDE.md): this is the dashboard's ONE primary action — the
// submit button is the single hot-pink `brand` accent for the view. Everything
// else stays neutral.

/**
 * TODO (human):
 *  - const uid = useAppStore((s) => s.user?.uid); guard if missing.
 *  - Controlled input for the URL; local `busy` + `error` state.
 *  - onSubmit (preventDefault): setBusy(true); try { await createPendingItem(uid, url);
 *      clear the input } catch (e) { setError(message) } finally { setBusy(false) }.
 *  - createPendingItem throws on invalid URL / unrecognized site / over cap —
 *    show that message inline. No success toast needed: the onSnapshot listener
 *    makes the new `pending` card appear on its own.
 *  - The submit button is the pink accent (bg-brand text-white, or text-brand);
 *    disable while busy.
 */
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
        placeholder="PASTE A LISTING URL…"
        className="flex-1 bg-transparent font-mono text-xs uppercase tracking-wider text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="flex-none bg-brand px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50"
      >
        Add
      </button>
      {error && <p className="font-mono text-xs text-red-600">{error}</p>}
    </form>
  );
}
