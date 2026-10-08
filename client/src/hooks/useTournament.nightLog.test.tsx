import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The Summary, driven through the REAL useTournament: every door that changes
 * the roster logs what it did, once, and a refused action logs nothing from the
 * action itself. lib/nightLog.ts's rules are tested there; this proves the
 * actions are wired to them — the "one door out of three" fault again.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));

import { useTournament } from '@/hooks/useTournament';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

function game(names: string[]) {
  const h = renderHook(() => useTournament(undefined));
  act(() => { for (const n of names) h.result.current.addPlayer(n); });
  const id = (name: string) => h.result.current.state.players.find(p => p.name === name)!.id;
  const kinds = () => (h.result.current.state.nightLog ?? []).map(e => `${e.kind}:${e.playerName ?? ''}`);
  return { h, id, kinds };
}

describe('the Summary records what each action did', () => {
  it('adds, busts, rebuys, undoes and add-ons — one event each, with the level', () => {
    const g = game(['Amy', 'Bob', 'Cat']);
    expect(g.kinds()).toEqual(['added:Amy', 'added:Bob', 'added:Cat']);

    act(() => { g.h.result.current.eliminatePlayer(g.id('Cat'), g.id('Amy')); });
    act(() => { g.h.result.current.processRebuy(g.id('Cat')); });
    act(() => { g.h.result.current.eliminatePlayer(g.id('Cat')); });
    act(() => { g.h.result.current.undoBustOut(g.id('Cat')); });

    expect(g.kinds().slice(3)).toEqual(['bust:Cat', 'rebuy:Cat', 'bust:Cat', 'undoBust:Cat']);
    const log = g.h.result.current.state.nightLog!;
    expect(log[3]).toMatchObject({ byName: 'Amy', position: 3, level: 1 });
    expect(log[4]).toMatchObject({ count: 1 });
    expect(new Set(log.map(e => e.id)).size).toBe(log.length);
  });

  it('the bust-out that ends the game logs the runner-up, then the winner', () => {
    const g = game(['Amy', 'Bob']);
    act(() => { g.h.result.current.eliminatePlayer(g.id('Bob'), g.id('Amy')); });
    expect(g.kinds().slice(2)).toEqual(['bust:Bob', 'bust:Amy']);
    expect(g.h.result.current.state.nightLog!.at(-1)).toMatchObject({ position: 1 });
  });

  it('a refused rebuy logs nothing from the action', () => {
    const g = game(['Amy', 'Bob', 'Cat']);
    act(() => { g.h.result.current.updatePrizeStructure({ allowRebuys: false } as any); });
    act(() => { g.h.result.current.eliminatePlayer(g.id('Cat')); });
    const before = g.kinds().length;
    act(() => { g.h.result.current.processRebuy(g.id('Cat')); });
    expect(g.kinds()).toHaveLength(before);
  });

  it('logEvent records what the roster cannot show, with the name looked up', () => {
    const g = game(['Amy', 'Bob']);
    act(() => { g.h.result.current.logEvent({ kind: 'rebuyDeclined', playerId: g.id('Bob') }); });
    expect(g.kinds().at(-1)).toBe('rebuyDeclined:Bob');
  });

  it('a new game starts with an empty Summary', () => {
    const g = game(['Amy', 'Bob']);
    act(() => { g.h.result.current.resetTournament({ keepStructure: true }); });
    expect(g.h.result.current.state.nightLog ?? []).toEqual([]);
  });
});
