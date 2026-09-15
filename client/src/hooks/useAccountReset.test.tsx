import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(() => '__deleted__'),
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((a: any, b: any) => ({ ref: `${a?.name ?? b}/${b}` })),
  query: vi.fn((c: any, w: any) => ({ c, w })),
  where: vi.fn((field: string, _op: string, value: string) => ({ field, value })),
  authUser: { id: 'alice' } as { id: string } | null,
  isAnonymous: false,
}));

vi.mock('firebase/firestore', () => ({
  getDocs: h.getDocs, writeBatch: h.writeBatch, updateDoc: h.updateDoc,
  deleteField: h.deleteField, collection: h.collection, doc: h.doc,
  query: h.query, where: h.where,
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.authUser, isAnonymous: h.isAnonymous, isLoading: false }),
}));

import { useAccountReset } from './useAccountReset';

/** Which collection a query was against, from the mocked query object. */
const collectionOf = (call: any) => call[0]?.c?.name;

function stubData(byCollection: Record<string, string[]>) {
  h.getDocs.mockImplementation(async (q: any) => {
    const name = q?.c?.name as string;
    return { docs: (byCollection[name] ?? []).map(id => ({ id })) };
  });
}

let committed: string[][];
beforeEach(() => {
  localStorage.clear();
  committed = [];
  h.authUser = { id: 'alice' };
  h.isAnonymous = false;
  h.getDocs.mockReset();
  h.updateDoc.mockReset().mockResolvedValue(undefined);
  h.writeBatch.mockReset().mockImplementation(() => {
    const deletes: string[] = [];
    return {
      delete: (ref: any) => deletes.push(ref?.ref ?? String(ref)),
      commit: vi.fn(async () => { committed.push(deletes); }),
    };
  });
  // jsdom refuses a real navigation; the hook only ever assigns to it.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: '' },
  });
});
afterEach(() => vi.restoreAllMocks());

describe('resetDevice', () => {
  it('clears the account bucket AND its cloud copy', async () => {
    // Both halves or neither: clearing only local storage leaves the account's
    // copy, and the next sign-in pulls back exactly what was just cleared.
    localStorage.setItem('tournamentSettings::alice', '{"a":1}');
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.resetDevice(); });

    expect(localStorage.getItem('tournamentSettings::alice')).toBeNull();
    expect(h.updateDoc).toHaveBeenCalledTimes(1);
    expect(h.updateDoc.mock.calls[0][1]).toEqual({ setup: '__deleted__' });
  });

  it('still clears this device when the cloud write fails', async () => {
    // Offline, or no document yet. The local clear is what was actually asked
    // for and must not be lost to a failed network call.
    h.updateDoc.mockRejectedValue(new Error('offline'));
    localStorage.setItem('tournamentSettings::alice', '{"a":1}');
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.resetDevice(); });

    expect(localStorage.getItem('tournamentSettings::alice')).toBeNull();
  });

  it('keeps the site gate and the device id', async () => {
    localStorage.setItem('smgo_unlocked', '1');
    localStorage.setItem('playerDeviceId', 'device-1');
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.resetDevice(); });

    expect(localStorage.getItem('smgo_unlocked')).toBe('1');
    expect(localStorage.getItem('playerDeviceId')).toBe('device-1');
  });

  it('works signed out, without touching Firestore', async () => {
    h.authUser = null;
    localStorage.setItem('tournamentSettings::local', '{"a":1}');
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.resetDevice(); });

    expect(localStorage.getItem('tournamentSettings::local')).toBeNull();
    expect(h.updateDoc).not.toHaveBeenCalled();
  });
});

describe('deleteEverything', () => {
  it('deletes league-scoped rows BEFORE the leagues they hang off', async () => {
    // The whole reason the order is pinned: seasons, leaguePlayers and
    // tournamentResults delete under ownsLeague(), which reads the league. Once
    // the league is gone those rows can never be deleted by any client.
    stubData({
      leagues: ['L1'],
      tournamentResults: ['r1'],
      leaguePlayers: ['p1'],
      seasons: ['s1'],
      activeTournaments: ['t1'],
      completedTournaments: [],
      tournamentTemplates: [],
      leagueSettings: ['ls1'],
    });
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.deleteEverything(); });

    const order = h.writeBatch.mock.results.map((_r, i) => committed[i]);
    const flat = order.flat();
    const leaguesAt = flat.findIndex(ref => ref.startsWith('leagues/'));
    const childAt = ['tournamentResults/', 'leaguePlayers/', 'seasons/']
      .map(prefix => flat.findIndex(ref => ref.startsWith(prefix)));
    expect(leaguesAt).toBeGreaterThan(-1);
    for (const at of childAt) {
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(leaguesAt);
    }
  });

  it('never deletes from users, which holds the subscription', async () => {
    stubData({ leagues: ['L1'], tournamentResults: ['r1'] });
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.deleteEverything(); });

    expect(committed.flat().some(ref => ref.startsWith('users/'))).toBe(false);
  });

  it('stops at the failing stage and names it', async () => {
    stubData({ leagues: ['L1'], tournamentResults: ['r1'] });
    h.writeBatch.mockImplementation(() => ({
      delete: () => {},
      commit: vi.fn(async () => { throw new Error('permission-denied'); }),
    }));
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.deleteEverything(); });

    expect(result.current.error).toContain('results');
    expect(result.current.error).toContain('permission-denied');
  });

  it('does not navigate away when it failed', async () => {
    // A half-finished wipe that looks like a success is the worst outcome.
    stubData({ leagues: ['L1'], tournamentResults: ['r1'] });
    h.writeBatch.mockImplementation(() => ({
      delete: () => {},
      commit: vi.fn(async () => { throw new Error('nope'); }),
    }));
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.deleteEverything(); });

    expect(window.location.href).toBe('');
  });

  it('does nothing at all for a signed-out console', async () => {
    h.authUser = null;
    const { result } = renderHook(() => useAccountReset());

    await act(async () => { await result.current.deleteEverything(); });

    expect(h.getDocs).not.toHaveBeenCalled();
    expect(result.current.canDelete).toBe(false);
  });
});

describe('countEverything', () => {
  it('counts what would go, so the confirmation can say it', async () => {
    stubData({
      leagues: ['L1', 'L2'],
      tournamentResults: ['r1', 'r2', 'r3'],
      leaguePlayers: [],
      seasons: ['s1'],
      activeTournaments: [],
      completedTournaments: [],
      tournamentTemplates: [],
      leagueSettings: [],
    });
    const { result } = renderHook(() => useAccountReset());

    let counts: any;
    await act(async () => { counts = await result.current.countEverything(); });

    expect(counts.leagues).toBe(2);
    // Two leagues, three results returned per league query by the stub.
    expect(counts.tournamentResults).toBe(6);
    expect(counts.seasons).toBe(2);
  });
});
