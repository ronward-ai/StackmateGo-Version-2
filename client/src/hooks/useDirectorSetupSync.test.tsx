import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Firestore and auth are mocked: this tests the WIRING — which direction runs,
// when, and what is guarded — not the decisions, which lib/setupSync.ts owns
// and its own tests cover.
const h = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` })),
  authUser: { id: 'alice' } as { id: string } | null,
  isAnonymous: false,
  isLoading: false,
}));

vi.mock('firebase/firestore', () => ({
  getDoc: h.getDoc,
  setDoc: h.setDoc,
  doc: h.doc,
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.authUser, isAnonymous: h.isAnonymous, isLoading: h.isLoading }),
}));

import { useDirectorSetupSync } from './useDirectorSetupSync';

const SETTINGS = { soundEnabled: true } as any;
const LEVELS = [{ duration: 900, smallBlind: 25, bigBlind: 50 }] as any;
const PRIZE = { buyIn: 10 } as any;

function target(over: Partial<Record<string, any>> = {}) {
  return {
    settings: SETTINGS,
    levels: LEVELS,
    prizeStructure: PRIZE,
    playerCount: 0,
    isDatabaseTournament: false,
    applySettings: vi.fn(),
    applyLevels: vi.fn(),
    applyPrizeStructure: vi.fn(),
    ...over,
  };
}

const snap = (setup: any) => ({ exists: () => setup !== undefined, data: () => ({ setup }) });

/**
 * Give a pending write a real chance to land before asserting it did NOT.
 *
 * The write path awaits a dynamic import, whose microtasks fake timers do not
 * turn — so asserting "not called" straight after advancing them passes whether
 * the guard works or not. Every negative assertion here has to go through this,
 * or it proves nothing.
 */
async function settleRealTime() {
  vi.useRealTimers();
  await new Promise(resolve => setTimeout(resolve, 20));
  vi.useFakeTimers();
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  h.getDoc.mockReset();
  h.setDoc.mockReset().mockResolvedValue(undefined);
  h.authUser = { id: 'alice' };
  h.isAnonymous = false;
  h.isLoading = false;
});
afterEach(() => {
  // A test that deliberately leaves a pull in flight also leaves a pending
  // debounce timer; without this it fires inside the NEXT test and lands on the
  // shared setDoc mock, which looks exactly like a duplicate write.
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('pulling the account copy', () => {
  it('applies a newer setup onto an empty table', async () => {
    const remote = {
      settings: { soundEnabled: false },
      blindLevels: [{ duration: 600 }],
      prizeStructure: { buyIn: 25 },
      updatedAt: '2030-01-01T00:00:00Z',
    };
    h.getDoc.mockResolvedValue(snap(remote));
    const t = target();
    renderHook(() => useDirectorSetupSync(t as any));

    await vi.waitFor(() => expect(t.applySettings).toHaveBeenCalledWith(remote.settings));
    expect(t.applyLevels).toHaveBeenCalledWith(remote.blindLevels);
    expect(t.applyPrizeStructure).toHaveBeenCalledWith(remote.prizeStructure);
  });

  it('leaves a game in progress alone', async () => {
    // The setup carries the blind structure and the payouts, so applying it to
    // a game under way would rewrite the terms of that game.
    h.getDoc.mockResolvedValue(snap({
      settings: { soundEnabled: false },
      updatedAt: '2030-01-01T00:00:00Z',
    }));
    const t = target({ playerCount: 6 });
    renderHook(() => useDirectorSetupSync(t as any));

    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());
    expect(t.applySettings).not.toHaveBeenCalled();
    expect(t.applyLevels).not.toHaveBeenCalled();
  });

  it('does nothing for a signed-out console', async () => {
    h.authUser = null;
    renderHook(() => useDirectorSetupSync(target() as any));
    await Promise.resolve();
    expect(h.getDoc).not.toHaveBeenCalled();
  });

  it('does nothing for an anonymous session', async () => {
    h.isAnonymous = true;
    renderHook(() => useDirectorSetupSync(target() as any));
    await Promise.resolve();
    expect(h.getDoc).not.toHaveBeenCalled();
  });

  it('survives the account copy being unreadable', async () => {
    // Offline or blocked. The device's own setup is already on screen; this is
    // a convenience and must never stop a director running a game.
    h.getDoc.mockRejectedValue(new Error('offline'));
    const t = target();
    expect(() => renderHook(() => useDirectorSetupSync(t as any))).not.toThrow();
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());
    expect(t.applySettings).not.toHaveBeenCalled();
  });

  it('stays read-only upward when the account copy could not be read', async () => {
    // The dangerous half of a failed pull. Not knowing what the account holds
    // is exactly when pushing is unsafe: this device would overwrite a league's
    // structure with whatever defaults it happens to be showing.
    h.getDoc.mockRejectedValue(new Error('offline'));
    const { rerender } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());

    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await settleRealTime();

    expect(h.setDoc).not.toHaveBeenCalled();
  });
});

describe('pushing to the account', () => {
  it('does not write before the account has been consulted', async () => {
    // The dangerous direction: a fresh device pushing its DEFAULTS up over the
    // account's real setup.
    let resolveGet: (v: any) => void = () => {};
    h.getDoc.mockReturnValue(new Promise(res => { resolveGet = res; }));

    const { rerender, unmount } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await settleRealTime();
    expect(h.setDoc).not.toHaveBeenCalled();

    resolveGet(snap(undefined));
    unmount();
  });

  it('seeds an account that has never saved a setup, with no edit needed', async () => {
    // Sign in on a new device, change nothing, sign in somewhere else: there
    // has to be something there to find.
    h.getDoc.mockResolvedValue(snap(undefined));
    renderHook(() => useDirectorSetupSync(target() as any));
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalled());
    expect((h.setDoc.mock.calls[0][1] as any).setup.prizeStructure).toEqual(PRIZE);
  });

  it('writes a genuine change once the pull has settled', async () => {
    h.getDoc.mockResolvedValue(snap(undefined));
    const { rerender } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());

    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalled());

    expect(h.setDoc).toHaveBeenCalledTimes(1);
    const written = h.setDoc.mock.calls[0][1] as any;
    expect(written.setup.prizeStructure).toEqual({ buyIn: 99 });
    expect(written.setup.updatedAt).toBeTruthy();
  });

  it('does not write the same setup twice', async () => {
    h.getDoc.mockResolvedValue(snap(undefined));
    const { rerender } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());

    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalled());

    expect(h.setDoc).toHaveBeenCalledTimes(1);
  });

  it('debounces a burst of edits into one write', async () => {
    h.getDoc.mockResolvedValue(snap(undefined));
    const { rerender } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());

    for (const buyIn of [11, 12, 13, 14]) {
      rerender(target({ prizeStructure: { buyIn } }) as any);
      await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalled());

    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect((h.setDoc.mock.calls[0][1] as any).setup.prizeStructure).toEqual({ buyIn: 14 });
  });

  it('keeps saving after a write fails, rather than going quiet for the session', async () => {
    h.getDoc.mockResolvedValue(snap(undefined));
    h.setDoc.mockRejectedValueOnce(new Error('offline'));
    const { rerender } = renderHook((p: any) => useDirectorSetupSync(p), {
      initialProps: target() as any,
    });
    await vi.waitFor(() => expect(h.getDoc).toHaveBeenCalled());

    rerender(target({ prizeStructure: { buyIn: 99 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(1));

    rerender(target({ prizeStructure: { buyIn: 100 } }) as any);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await vi.waitFor(() => expect(h.setDoc).toHaveBeenCalledTimes(2));
  });
});
