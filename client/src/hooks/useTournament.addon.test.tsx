import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));

import { useTournament } from '@/hooks/useTournament';

/**
 * October audit, Low: `processAddon` checked only that add-ons were allowed.
 * The window, a player still in, one each and a finished game were all
 * enforced by the screen alone.
 */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

function game(addonAvailableLevel: number) {
  const h = renderHook(() => useTournament(undefined));
  act(() => {
    h.result.current.updatePrizeStructure({ buyIn: 10, allowAddons: true, addonAvailableLevel, manualPayouts: [] } as any);
    for (const n of ['A', 'B', 'C']) h.result.current.addPlayer(n);
  });
  const p = (n: string) => h.result.current.state.players.find(x => x.name === n)!;
  const addon = (n: string) => act(() => { h.result.current.processAddon(p(n).id); });
  return { h, p, addon };
}

describe('processAddon', () => {
  it('takes one add-on from a player still in, inside the window', () => {
    const g = game(1);
    g.addon('A');
    g.addon('A');
    expect(g.p('A').addons).toBe(1);
  });

  it('refuses before the window opens', () => {
    const g = game(5);
    g.addon('A');
    expect(g.p('A').addons || 0).toBe(0);
  });

  it('refuses a busted player and a finished game', () => {
    const g = game(1);
    act(() => { g.h.result.current.eliminatePlayer(g.p('C').id); });
    g.addon('C');
    expect(g.p('C').addons || 0).toBe(0);
    act(() => { g.h.result.current.eliminatePlayer(g.p('B').id); });
    g.addon('A');
    expect(g.p('A').addons || 0).toBe(0);
  });
});
