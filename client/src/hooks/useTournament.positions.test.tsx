import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Finishing places across the actions that change the field, driven through the
 * REAL useTournament (October audit, H7 and M7). The rules live in lib/ and are
 * tested there; these prove every door actually calls them — the "one door out
 * of three" fault this file's history keeps recording.
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
  const bust = (name: string) => act(() => { h.result.current.eliminatePlayer(id(name)); });
  const places = () => h.result.current.state.players
    .filter(p => p.position).map(p => p.position as number).sort((a, b) => a - b);
  return { h, id, bust, places };
}

describe('late entry (Oct H7)', () => {
  it('never hands two players one place', () => {
    const g = game(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    g.bust('I'); g.bust('H'); g.bust('G');
    act(() => { g.h.result.current.addPlayer('Late'); });
    g.bust('F');
    const placed = g.places();
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toEqual([7, 8, 9, 10]);
  });
});

describe('removing a player (Oct H7)', () => {
  it('keeps the places inside the field', () => {
    const g = game(['A', 'B', 'C', 'D']);
    g.bust('D');
    act(() => { g.h.result.current.removePlayer(g.id('A')); });
    expect(g.places()).toEqual([3]);
  });
});

describe('undo bust-out (Oct H7)', () => {
  it('renumbers like a re-entry when it is not the last bust-out', () => {
    const g = game(['A', 'B', 'C', 'D', 'E']);
    g.bust('E'); g.bust('D'); g.bust('C');
    act(() => { g.h.result.current.undoBustOut(g.id('E')); });
    g.bust('B');
    const placed = g.places();
    expect(new Set(placed).size).toBe(placed.length);
  });

  // THE regression: undo the FIRST player out of a finished game, bust them
  // again, and the league got two winners.
  it('never leaves two players holding 1st', () => {
    const g = game(['A', 'B', 'C']);
    g.bust('C'); g.bust('B');
    expect(g.places()).toEqual([1, 2, 3]);
    act(() => { g.h.result.current.undoBustOut(g.id('C')); });
    expect(g.places()).not.toContain(1);
    g.bust('C');
    g.bust('A');
    expect(g.places()).toEqual([1, 2, 3]);
  });
});

describe('a re-entry re-prices whoever it moves (Oct M7)', () => {
  it('takes the 3rd-place money off somebody pushed down to 4th', () => {
    const g = game(['A', 'B', 'C', 'D', 'E']);
    act(() => {
      g.h.result.current.updatePrizeStructure({
        buyIn: 20, allowReEntry: true, enableBounties: false,
        manualPayouts: [{ position: 1, percentage: 60 }, { position: 2, percentage: 30 }, { position: 3, percentage: 10 }],
      } as any);
    });
    g.bust('E'); g.bust('D'); g.bust('C');
    const c = () => g.h.result.current.state.players.find(p => p.name === 'C')!;
    expect(c().position).toBe(3);
    expect(c().prizeMoney).toBeGreaterThan(0);

    act(() => { g.h.result.current.processReEntry(g.id('E')); });
    expect(c().position).toBe(4);
    expect(c().prizeMoney).toBe(0);
  });
});
