import { useEffect, useRef } from 'react';

/**
 * An account change this tab did not make is treated as a logout: a full page
 * load to `/?home=1` (October audit, M4).
 *
 * Logging out is already a full page load, and that is load-bearing: the console
 * runs on in-memory state that signing out does not clear, and every writer here
 * resolves "which account" afresh — the local mirror on each clock tick, the
 * setup sync, Recent Players. But an account can change WITHOUT that page load:
 * signing out in another tab (the participant view's Sign out reloads only its
 * own), or signing in as somebody else on this tab's "Sign in to run this game"
 * screen. Then account A's live roster was mirrored into the signed-out bucket
 * every second, and account B's setup sync pushed A's settings and structure into
 * B's cloud copy. A comment promised an effect that re-read on such a change; it
 * never existed.
 *
 * Only a change AWAY FROM AN ACCOUNT THIS TAB HAD CONFIRMED counts. Every cold
 * load starts with no user and then resolves one — that is not a change — and a
 * session that has expired never resolves at all, so it cannot loop a reload.
 */
export function useAccountChangeIsALogout(
  userId: string | null | undefined,
  isLoading: boolean,
  leave: () => void = () => { window.location.href = '/?home=1'; },
): void {
  const confirmedRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const current = userId ?? null;
    const previous = confirmedRef.current;
    confirmedRef.current = current;
    if (previous && previous !== current) leave();
    // `leave` is deliberately not a dependency: a fresh closure on every render
    // must not re-run this, and the decision is about the account alone.
  }, [userId, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
