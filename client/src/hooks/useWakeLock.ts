import { useEffect, useRef } from 'react';

/**
 * Keep the screen awake while the clock is running.
 *
 * The app's whole job is a timer a room looks at for three hours, usually on a
 * laptop or tablet propped up at the end of the table. Nothing asked the browser
 * to keep the screen on, so the device slept on its own schedule and the big
 * screen went dark mid-level. The director wakes it, and it sleeps again.
 *
 * Two things make this more than one API call.
 *
 * A wake lock is **released automatically whenever the page is hidden** — tab
 * switch, screen lock, app backgrounded — and it is NOT restored when the page
 * comes back. So a `visibilitychange` listener has to re-acquire it, or the lock
 * survives exactly until the first time anyone checks their phone.
 *
 * And the request **rejects** rather than resolving falsy when the browser
 * refuses: no user gesture yet, a battery-saver mode, a browser without the API
 * at all (it is unsupported in Firefox and only reached iOS Safari in 16.4).
 * None of that is worth telling the director about — there is nothing they can
 * do and the clock still works — so every path fails silently. It must never
 * take the timer down with it.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<any>(null);

  useEffect(() => {
    const anyNav = navigator as any;
    if (!anyNav?.wakeLock?.request) return;

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || !active || lockRef.current) return;
      try {
        const lock = await anyNav.wakeLock.request('screen');
        if (cancelled || !active) {
          // The clock stopped while we were waiting. Do not hold a lock for a
          // paused game — that is the director's battery.
          try { await lock.release(); } catch { /* already gone */ }
          return;
        }
        lockRef.current = lock;
        // The browser drops the lock on its own when the page is hidden; clear
        // our handle so the visibility listener knows to ask again.
        lock.addEventListener?.('release', () => { lockRef.current = null; });
      } catch {
        // Refused. Nothing to say, nothing to do.
      }
    };

    const release = async () => {
      const lock = lockRef.current;
      lockRef.current = null;
      if (!lock) return;
      try { await lock.release(); } catch { /* already gone */ }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    if (active) void acquire(); else void release();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void release();
    };
  }, [active]);
}
