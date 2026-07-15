import { type ReactNode } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useAuthSync } from '@/lib/useAuthSync';
import { SignInScreen } from '@/components/SignInScreen';

// Gates a surface on auth: subscribes auth -> store (useAuthSync), then renders
// the sign-in screen when signed out and its children when signed in. Wrap the
// popup and dashboard roots in this.

export function AuthGate({ children }: { children: ReactNode }) {
  useAuthSync();
  const user = useAppStore((s) => s.user);
  const status = useAppStore((s) => s.status);

  // UX bug this guards against: observeAuthState resolves the persisted session
  // asynchronously (IndexedDB read), so on first mount `user` is still null even
  // for an already-signed-in user. Without this check, AuthGate would render
  // SignInScreen for that gap, then swap to `children` once auth resolves —
  // a visible flash of the sign-in screen on every popup open / dashboard load.
  if (status === 'loading') {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <p className="font-mono text-xs uppercase tracking-wider text-neutral-400">Loading…</p>
      </div>
    );
  }

  return user ? <>{children}</> : <SignInScreen />;
}
