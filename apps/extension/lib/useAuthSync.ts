// Bridges Firebase auth state into the shared Zustand store. Mount ONCE per
// surface — AuthGate does it. On every auth change it mirrors the user into the
// store; on sign-in it also bootstraps users/{uid}.
import { useEffect } from 'react';
import { observeAuthState } from '@dvl/firebase';
import { useAppStore } from '@/store/useAppStore';
import { ensureUserDoc } from './user';

// TODO imports (human): observeAuthState from '@dvl/firebase';
//   useAppStore from '@/store/useAppStore'; ensureUserDoc from '@/lib/user'.

/**
 * Subscribe to auth state and drive the store.
 *
 * TODO (human):
 *  - Inside the effect: const unsub = observeAuthState(async (user) => { ... }).
 *  - setUser(user) from the store on every change.
 *  - user != null: await ensureUserDoc(user) in try/catch (setError on failure),
 *    then setStatus('ready').
 *  - user == null: setStatus('ready') — signed-out is a valid resolved state.
 *  - return unsub so the listener tears down on unmount.
 *  - Guard setState-after-unmount (a `let alive = true` flag) since the callback
 *    awaits.
 */
export function useAuthSync(): void {
  useEffect(() => {
    let alive = true;
    const unsub = observeAuthState(async (user) => {
      if (!alive) return;
      const { setUser, setStatus, setError } = useAppStore.getState();
      setUser(user);
      if (user) {
        try {
          await ensureUserDoc(user);
          if (!alive) return;
          setStatus('ready');
        } catch (e) {
          if (!alive) return;
          setError(e instanceof Error ? e.message : 'Failed to sync user');
        }
      }
      if (user == null) {
        setStatus('ready');
      }
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);
}
