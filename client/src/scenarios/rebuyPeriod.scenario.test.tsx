import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A REBUY IN THE LAST HAND OF THE REBUY PERIOD (reported from a live night).
 *
 * A player busts in the last level rebuys are allowed; the level ends while the
 * "rebuy?" question is still on screen. It used to vanish — the rebuy window was
 * judged at the level the clock had moved on to — and the director had to
 * extend the period to honour it. Played through the real useTournament and
 * useRebuyOffer hooks, and on into the league (./leagueHarness.ts), because the
 * report was that rebuys were missing from the STANDINGS.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useTournament } from '@/hooks/useTournament';
import { useRebuyOffer } from '@/hooks/useRebuyOffer';
import { createLeague } from './leagueHarness';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

const levels = [1, 2, 3, 4, 5].map(n => ({ small: n * 25, big: n * 50, duration: 600 }));

function game(names: string[]) {
  const h = renderHook(() => {
    const t = useTournament(undefined);
    const offer = useRebuyOffer(t, false);
    return { t, offer };
  });
  act(() => { h.result.current.t.resetTournament({ keepStructure: true }); });
  act(() => {
    h.result.current.t.setBlindLevels(levels as any);
    h.result.current.t.updatePrizeStructure({
      buyIn: 10, allowRebuys: true, rebuyAmount: 10, rebuyPeriodLevels: 2, manualPayouts: [],
    } as any);
    for (const n of names) h.result.current.t.addPlayer(n);
  });
  const id = (n: string) => h.result.current.t.state.players.find(p => p.name === n)!.id;
  return { h, id, get t() { return h.result.current.t; }, get offer() { return h.result.current.offer; } };
}

describe('a rebuy in the last hand of the period', () => {
  it('stays on offer after the level ends, is taken, and reaches the standings', () => {
    const league = createLeague();
    const g = game(['Amy', 'Bob', 'Cat', 'Dan']);
    act(() => { g.t.skipToNextLevel(); });            // level 2: the last rebuy level
    act(() => { g.t.eliminatePlayer(g.id('Dan'), g.id('Amy')); });
    league.sync(g.t.state, 'g1', 'spring');
    expect(g.offer.player?.name).toBe('Dan');

    act(() => { g.t.skipToNextLevel(); });            // the level ends with the question up
    expect(g.offer.player?.name).toBe('Dan');         // it used to vanish here

    act(() => { g.offer.answer(true); });
    expect(g.t.state.players.find(p => p.name === 'Dan')).toMatchObject({ isActive: true, rebuys: 1 });
    league.sync(g.t.state, 'g1', 'spring');

    // A bust-out AFTER the period gets no rebuy — the rule still bites.
    act(() => { g.t.eliminatePlayer(g.id('Cat'), g.id('Bob')); });
    expect(g.offer.player).toBeNull();
    league.sync(g.t.state, 'g1', 'spring');

    act(() => { g.t.eliminatePlayer(g.id('Dan'), g.id('Bob')); });
    league.sync(g.t.state, 'g1', 'spring');
    act(() => { g.t.eliminatePlayer(g.id('Bob'), g.id('Amy')); });
    league.sync(g.t.state, 'g1', 'spring');

    const dan = league.results.find(r => league.playerDocs.find(p => p.id === r.leaguePlayerId)!.name === 'Dan')!;
    expect(dan.rebuys).toBe(1);
    expect(league.results).toHaveLength(4);
    g.h.unmount();
  });
});
