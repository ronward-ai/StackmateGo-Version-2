/**
 * Refcounted sharing layer for Firestore onSnapshot listeners.
 *
 * The league hooks are called from many components (useLeague from 9 places,
 * useSeasons from 7, useLeagueSettings from 5 directly plus once inside each of
 * the other two). Each instance previously opened its own onSnapshot, so a
 * single page could hold 20+ listeners against the same handful of queries —
 * every one of them doing a full initial read of every matching document, all
 * billable on Blaze.
 *
 * This registry keys a subscription by a caller-supplied string. The first
 * consumer of a key opens the real listener; subsequent consumers attach to it
 * and share the same snapshot. When the last consumer unmounts the listener is
 * torn down after a short grace period, so ordinary route changes and React
 * StrictMode's double-mount don't churn connections.
 *
 * Call sites are unchanged — identical parameters produce an identical key, so
 * deduplication happens without any component knowing about it.
 */

import { useCallback, useSyncExternalStore } from 'react';

export interface Snapshot<T> {
  data: T;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Opens the underlying listener. Receives callbacks to push data or an error
 * into the registry, and returns its own unsubscribe function.
 */
export type StartListener<T> = (
  emit: (data: T) => void,
  fail: (error: Error) => void,
) => () => void;

interface Entry<T> {
  refs: number;
  unsub: (() => void) | null;
  snapshot: Snapshot<T>;
  notify: Set<() => void>;
  teardown: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry<any>>();

/** Grace period before tearing down an unreferenced listener. Covers route
 *  transitions and StrictMode's mount/unmount/remount cycle. */
const TEARDOWN_DELAY_MS = 5000;

/**
 * Idle snapshots for null keys, cached by the `empty` reference so that
 * getSnapshot stays referentially stable — returning a fresh object each call
 * would send useSyncExternalStore into an infinite re-render loop.
 */
const idleSnapshots = new Map<unknown, Snapshot<any>>();

function idleSnapshot<T>(empty: T): Snapshot<T> {
  let s = idleSnapshots.get(empty);
  if (!s) {
    s = { data: empty, isLoading: false, error: null };
    idleSnapshots.set(empty, s);
  }
  return s;
}

/** Create the entry if absent. Allocates only — never starts I/O — so this is
 *  safe to call from getSnapshot during render. */
function ensureEntry<T>(key: string, empty: T): Entry<T> {
  let entry = registry.get(key);
  if (!entry) {
    entry = {
      refs: 0,
      unsub: null,
      snapshot: { data: empty, isLoading: true, error: null },
      notify: new Set(),
      teardown: null,
    };
    registry.set(key, entry);
  }
  return entry;
}

function publish<T>(entry: Entry<T>, snapshot: Snapshot<T>): void {
  entry.snapshot = snapshot;
  entry.notify.forEach(fn => fn());
}

/**
 * Subscribe to a shared Firestore listener.
 *
 * @param key    Unique per query. Pass null to subscribe to nothing (e.g. while
 *               a league id is still unknown) — returns `empty`, not loading.
 * @param start  Opens the listener. Only invoked for the first consumer of a key.
 * @param empty  Value used before data arrives. MUST be a stable reference
 *               (a module-level constant), not a literal created inline.
 */
export function useSharedSnapshot<T>(
  key: string | null,
  start: StartListener<T>,
  empty: T,
): Snapshot<T> {
  // `start` closes over fresh values each render, but it is only ever invoked
  // for the first consumer of a key — and the key fully determines the query —
  // so a stale closure cannot produce a mismatched subscription.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (key === null) return () => {};

      const entry = ensureEntry<T>(key, empty);

      if (entry.teardown) {
        clearTimeout(entry.teardown);
        entry.teardown = null;
      }

      entry.notify.add(onStoreChange);
      entry.refs += 1;

      if (!entry.unsub) {
        entry.unsub = start(
          data => publish(entry, { data, isLoading: false, error: null }),
          error => publish(entry, { ...entry.snapshot, isLoading: false, error }),
        );
      }

      return () => {
        entry.notify.delete(onStoreChange);
        entry.refs -= 1;
        if (entry.refs > 0) return;

        entry.teardown = setTimeout(() => {
          // Re-check: a new consumer may have arrived during the grace period.
          if (entry.refs > 0) return;
          entry.unsub?.();
          registry.delete(key);
        }, TEARDOWN_DELAY_MS);
      };
    },
    // Intentionally keyed on `key` alone — see the note above about `start`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  const getSnapshot = useCallback(
    () => (key === null ? idleSnapshot(empty) : ensureEntry<T>(key, empty).snapshot),
    [key, empty],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test/debug helper: how many live listeners the registry currently holds. */
export function activeListenerCount(): number {
  let n = 0;
  registry.forEach(e => { if (e.unsub) n += 1; });
  return n;
}
