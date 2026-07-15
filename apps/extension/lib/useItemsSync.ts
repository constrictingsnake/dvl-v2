// Bridges the live Firestore item list into the shared store, keyed on the
// signed-in user. Mount ONCE per surface that shows items (the dashboard; the
// popup too if it lists items). Mirrors useAuthSync's shape: subscribe when a
// user is present, tear down on sign-out or unmount — no listener leaks.
import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { subscribeToItems } from './items';

/**
 * Subscribe to the current user's items and drive the store. Re-subscribes when
 * the user changes; clears items when signed out. `useAuthSync` owns `status`,
 * so this hook only touches `items` (and forwards non-permission errors).
 */
export function useItemsSync(): void {
  const uid = useAppStore((s) => s.user?.uid);
  useEffect(() => {
    const { setItems, setError } = useAppStore.getState();

    if (!uid) {
      setItems([]);
      return;
    }

    const unsub = subscribeToItems(
      uid,
      (items) => setItems(items),
      (err) => {
        if ((err as { code?: string }).code === 'permission-denied') return;
        setError(err.message);
      },
    );
    return unsub;
  }, [uid]);
}
