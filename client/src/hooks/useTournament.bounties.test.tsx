import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Bounty money through the REAL useTournament (October audit, M6): what a
 * busted player and the winner are recorded as having collected, and what undo
 * gives back. prizeMoney is EVERYTHING collected; bountyWinnings says how much of
 * it was bounty.
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

function game(names: string[], prizeStructure: any) {
  const h = renderHook(() => useTournament(undefined));
  act(() => { h.result.current.updatePrizeStructure(prizeStructure); });
  act(() => { for (const n of names) h.result.current.addPlayer(n); });
  const p = (name: string) => h.result.current.state.players.find(q => q.name === name)!;
  const ko = (victim: string, hunter: string) =>
    act(() => { h.result.current.eliminatePlayer(p(victim).id, p(hunter).id); });
  return { h, p, ko };
}

const NO_PAYOUTS = { buyIn: 20, manualPayouts: [] };

describe('progressive bounties', () => {
  const PKO = { ...NO_PAYOUTS, enableBounties: true, bountyAmount: 10, bountyType: 'progressive' };

  it('records a busted hunter\'s REAL bounty take, not knockouts × the base bounty', () => {
    const g = game(['A', 'B', 'C', 'D'], PKO);
    g.ko('D', 'C');         // C takes half of D's 10: £5 cash
    g.ko('C', 'A');         // C busts out of the money
    expect(g.p('C').bountyWinnings).toBe(5);
    expect(g.p('C').prizeMoney).toBe(5);
  });

  it('pays the winner their knockout winnings AND their own head', () => {
    const g = game(['A', 'B', 'C'], PKO);
    g.ko('C', 'A');         // A: +5 cash, head 15
    g.ko('B', 'A');         // A: +5 cash, head 20 — and A wins
    expect(g.p('A').position).toBe(1);
    expect(g.p('A').prizeMoney).toBe(10 + 20);
  });

  it('gives back on undo the half bounty the knockout handed over', () => {
    const g = game(['A', 'B', 'C', 'D'], PKO);
    g.ko('D', 'A');
    act(() => { g.h.result.current.undoBustOut(g.p('D').id); });
    expect(g.p('A').bountyWinnings).toBe(0);
    expect(g.p('A').currentBounty).toBe(10);
    expect(g.p('A').knockouts).toBe(0);
  });
});

describe('a player carrying no bounty pays nothing', () => {
  const STANDARD = { ...NO_PAYOUTS, enableBounties: true, bountyAmount: 5, allowRebuys: true, rebuyBounty: false };

  it('does not pay a standard bounty for knocking out a player who rebought without one', () => {
    const g = game(['A', 'B', 'C', 'D'], STANDARD);
    g.ko('D', 'B');
    act(() => { g.h.result.current.processRebuy(g.p('D').id); });
    expect(g.p('D').currentBounty).toBe(0);
    g.ko('D', 'C');         // D carries no bounty now
    g.ko('C', 'A');
    expect(g.p('C').prizeMoney).toBe(0);
  });
});
