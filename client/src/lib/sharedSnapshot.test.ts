import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSharedSnapshot, activeListenerCount, type StartListener } from './sharedSnapshot';

/**
 * The behaviour that matters here is deduplication and lifecycle: N consumers of
 * one key must produce exactly one underlying listener, and that listener must
 * be torn down once — and only once — the last consumer is gone.
 */

const EMPTY: string[] = [];

/** A fake listener that records how many times it was opened and closed. */
function makeListener() {
  const state = { starts: 0, stops: 0, emit: null as null | ((d: string[]) => void), fail: null as null | ((e: Error) => void) };
  const start: StartListener<string[]> = (emit, fail) => {
    state.starts += 1;
    state.emit = emit;
    state.fail = fail;
    return () => { state.stops += 1; };
  };
  return { state, start };
}

let keyCounter = 0;
/** Unique key per test — the registry is module-level and persists across tests. */
const freshKey = () => `test-key-${keyCounter++}`;

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); });

describe('useSharedSnapshot', () => {
  it('opens exactly one listener no matter how many consumers subscribe', () => {
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const c = renderHook(() => useSharedSnapshot(key, start, EMPTY));

    expect(state.starts).toBe(1);

    a.unmount(); b.unmount(); c.unmount();
  });

  it('delivers data to every consumer of the same key', async () => {
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));

    expect(a.result.current.isLoading).toBe(true);

    act(() => { state.emit!(['alice', 'bob']); });

    await waitFor(() => {
      expect(a.result.current.data).toEqual(['alice', 'bob']);
      expect(b.result.current.data).toEqual(['alice', 'bob']);
      expect(a.result.current.isLoading).toBe(false);
      expect(b.result.current.isLoading).toBe(false);
    });

    a.unmount(); b.unmount();
  });

  it('keeps the listener open while any consumer remains', () => {
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));

    a.unmount();
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(state.stops).toBe(0);

    b.unmount();
  });

  it('tears down after the grace period once the last consumer unmounts', () => {
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    a.unmount();

    // Still alive during the grace period.
    act(() => { vi.advanceTimersByTime(4_000); });
    expect(state.stops).toBe(0);

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(state.stops).toBe(1);
  });

  it('reuses the listener when a consumer remounts within the grace period', () => {
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    a.unmount();

    act(() => { vi.advanceTimersByTime(1_000); });

    // This is the StrictMode double-mount / route-change case.
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    act(() => { vi.advanceTimersByTime(10_000); });

    expect(state.stops).toBe(0);
    expect(state.starts).toBe(1);

    b.unmount();
  });

  it('opens separate listeners for different keys', () => {
    const one = makeListener();
    const two = makeListener();

    const a = renderHook(() => useSharedSnapshot(freshKey(), one.start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(freshKey(), two.start, EMPTY));

    expect(one.state.starts).toBe(1);
    expect(two.state.starts).toBe(1);

    a.unmount(); b.unmount();
  });

  it('switches subscriptions when the key changes', () => {
    const first = freshKey();
    const second = freshKey();
    const { state, start } = makeListener();

    const { rerender, unmount } = renderHook(
      ({ k }) => useSharedSnapshot(k, start, EMPTY),
      { initialProps: { k: first } },
    );
    expect(state.starts).toBe(1);

    rerender({ k: second });
    expect(state.starts).toBe(2);

    // The first key's listener closes only after its grace period.
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(state.stops).toBe(1);

    unmount();
  });

  it('subscribes to nothing for a null key and reports not-loading', () => {
    const { state, start } = makeListener();
    const { result, unmount } = renderHook(() => useSharedSnapshot(null, start, EMPTY));

    expect(state.starts).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBe(EMPTY);

    unmount();
  });

  it('returns a referentially stable snapshot for a null key', () => {
    // A fresh object per getSnapshot call would send useSyncExternalStore into
    // an infinite render loop, so this guards a real failure mode.
    const { start } = makeListener();
    const { result, rerender, unmount } = renderHook(() => useSharedSnapshot(null, start, EMPTY));

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    unmount();
  });

  it('surfaces listener errors without clearing already-delivered data', async () => {
    const key = freshKey();
    const { state, start } = makeListener();
    const { result, unmount } = renderHook(() => useSharedSnapshot(key, start, EMPTY));

    act(() => { state.emit!(['alice']); });
    await waitFor(() => expect(result.current.data).toEqual(['alice']));

    const boom = new Error('permission-denied');
    act(() => { state.fail!(boom); });

    await waitFor(() => {
      expect(result.current.error).toBe(boom);
      expect(result.current.isLoading).toBe(false);
      // Data survives so a transient error does not blank the UI.
      expect(result.current.data).toEqual(['alice']);
    });

    unmount();
  });

  it('unsubscribes exactly once when consumers unmount at different times', () => {
    // Staggered unmounts must not each schedule their own teardown: two timers
    // both firing with refs at zero would call Firestore's unsubscribe twice.
    // Caught by mutation testing — the timer's own refs re-check does not
    // protect against this on its own.
    const key = freshKey();
    const { state, start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));

    a.unmount();
    act(() => { vi.advanceTimersByTime(1_000); });
    b.unmount();

    act(() => { vi.advanceTimersByTime(20_000); });

    expect(state.stops).toBe(1);
  });

  it('leaves no live listeners once everything unmounts', () => {
    const before = activeListenerCount();
    const key = freshKey();
    const { start } = makeListener();

    const a = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    const b = renderHook(() => useSharedSnapshot(key, start, EMPTY));
    expect(activeListenerCount()).toBe(before + 1);

    a.unmount(); b.unmount();
    act(() => { vi.advanceTimersByTime(6_000); });

    expect(activeListenerCount()).toBe(before);
  });
});
