import { renderHook, act, render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * WHOLE NIGHTS, IN SEQUENCE (October 2026).
 *
 * Every bug below a single function's reach shows up only across a sequence:
 * a season that has ended and one that has begun, a reload between two
 * bust-outs, a rebuy after a result was already written. These play nights
 * through the REAL useTournament hook and feed each roster change through the
 * recorder's real decisions into an in-memory league (./leagueHarness.ts), then
 * assert on what the standings — and the screen that draws them — say.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

// What the league screens read: the in-memory league, as the hooks would serve it.
const screens = vi.hoisted(() => ({ league: null as any, current: 'spring', seasons: [] as any[] }));
vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1', name: 'Test League' }, leaguePlayers: screens.league.standings(), isLoading: false }),
}));
vi.mock('@/hooks/useLeagueSettings', () => {
  const s = { settings: { statsToDisplay: {}, displaySettings: {} }, calculatePoints: () => 0 };
  return { useLeagueSettings: () => s };
});
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({
    currentSeason: screens.seasons.find((s: any) => s.id === screens.current),
    seasons: screens.seasons,
    formatSeasonDateRange: () => '',
  }),
}));
vi.mock('@/components/export/captureSheet', () => ({ captureSheet: vi.fn(), sheetFilename: () => 'x.png' }));

import { useTournament } from '@/hooks/useTournament';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import { gameNumberFor, nextGameNumber, countGamesPlayed } from '@/lib/seasonProgress';
import { createLeague } from './leagueHarness';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

/** A night at the table, played through the real hook. */
function night(league: ReturnType<typeof createLeague>, gameId: string, seasonId: string, names: string[], prize: any = { buyIn: 10, manualPayouts: [] }) {
  const h = renderHook(() => useTournament(undefined));
  // Every night starts the way a director starts one: New Tournament. Without
  // it the local mirror restores last night's finished roster — correctly — and
  // tonight's players are refused on a game that is over.
  act(() => { h.result.current.resetTournament({ keepStructure: true }); });
  act(() => {
    h.result.current.updatePrizeStructure(prize);
    for (const n of names) h.result.current.addPlayer(n);
  });
  const s = () => h.result.current.state;
  const id = (name: string) => s().players.find(p => p.name === name)!.id;
  const sync = () => league.sync(s(), gameId, seasonId);
  return {
    h, s, id, sync,
    bust(name: string, by?: string) { act(() => { h.result.current.eliminatePlayer(id(name), by ? id(by) : undefined); }); sync(); },
    rebuy(name: string) { act(() => { h.result.current.processRebuy(id(name)); }); sync(); },
    reEnter(name: string) { act(() => { h.result.current.processReEntry(id(name)); }); sync(); },
    undo(name: string) { act(() => { h.result.current.undoBustOut(id(name)); }); sync(); },
    done() { h.unmount(); },
  };
}

/** One result per player for this game, places a run from 1 to the field. */
function expectCleanGame(league: ReturnType<typeof createLeague>, gameId: string, field: number) {
  const rows = league.results.filter(r => r.tournamentId === gameId);
  expect(rows).toHaveLength(field);
  expect(new Set(rows.map(r => r.leaguePlayerId)).size).toBe(field);
  expect(rows.map(r => r.position).sort((a, b) => a - b)).toEqual(Array.from({ length: field }, (_, i) => i + 1));
}

describe('a season ends and the next begins', () => {
  it('the new season starts empty, then lists only those who played it — and the old one keeps its table', () => {
    const league = createLeague();

    // Spring, night 1.
    const n1 = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat', 'Dan']);
    n1.bust('Dan', 'Amy'); n1.bust('Cat', 'Amy'); n1.bust('Bob', 'Amy');
    n1.done();
    expectCleanGame(league, 'g1', 4);

    // Spring, night 2 — "amy" typed in lower case is still Amy.
    const n2 = night(league, 'g2', 'spring', ['amy', 'Bob', 'Eve']);
    n2.bust('Eve', 'Bob'); n2.bust('amy', 'Bob');
    n2.done();
    expectCleanGame(league, 'g2', 3);
    expect(league.playerDocs.map(p => p.name).sort()).toEqual(['Amy', 'Bob', 'Cat', 'Dan', 'Eve']);

    const spring = league.table('spring');
    expect(spring.map(r => [r.name, r.games])).toEqual([
      ['Amy', 2], ['Bob', 2], ['Cat', 1], ['Eve', 1], ['Dan', 1],
    ]);
    expect(countGamesPlayed('spring', league.standings())).toBe(2);
    expect(nextGameNumber('spring', league.standings())).toBe(3);

    // Summer begins. Nobody has played it: no rows at all, and it is game 1.
    expect(league.table('summer')).toEqual([]);
    expect(gameNumberFor('summer', league.standings())).toBe(1);
    expect(nextGameNumber('summer', league.standings())).toBe(1);

    // Summer, night 1 — two regulars and a newcomer.
    const n3 = night(league, 'g3', 'summer', ['Bob', 'Eve', 'Finn']);
    n3.bust('Finn', 'Eve'); n3.bust('Bob', 'Eve');
    n3.done();
    expect(league.table('summer').map(r => [r.name, r.games])).toEqual([['Eve', 1], ['Bob', 1], ['Finn', 1]]);
    expect(gameNumberFor('summer', league.standings(), 'g3')).toBe(1);
    expect(nextGameNumber('summer', league.standings())).toBe(2);

    // Spring is exactly as it was.
    expect(league.table('spring')).toEqual(spring);
  });

  it('the SCREEN says the same: "starts tonight" on a fresh season, then only its players', () => {
    const league = createLeague();
    screens.league = league;
    screens.seasons = [{ id: 'spring', name: 'Spring', numberOfGames: 10 }, { id: 'summer', name: 'Summer', numberOfGames: 10 }];
    const tournament = { ownerId: 'u1', settings: { isSeasonTournament: true, leagueId: 'L1' } };

    const n1 = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat']);
    n1.bust('Cat', 'Amy'); n1.bust('Bob', 'Amy');
    n1.done();

    screens.current = 'summer';
    render(<RealTimeLeagueTable tournament={tournament} />);
    expect(screen.getByText(/starts tonight/)).toBeTruthy();
    for (const name of ['Amy', 'Bob', 'Cat']) expect(screen.queryByText(name)).toBeNull();
    cleanup();

    const n2 = night(league, 'g2', 'summer', ['Bob', 'Dan']);
    n2.bust('Dan', 'Bob');
    n2.done();
    render(<RealTimeLeagueTable tournament={tournament} />);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Dan').length).toBeGreaterThan(0);
    expect(screen.queryByText('Amy')).toBeNull();
    expect(screen.queryByText('Cat')).toBeNull();
    cleanup();

    // The old season, picked from the list, still shows its own.
    render(<RealTimeLeagueTable tournament={tournament} seasonIdOverride="spring" />);
    for (const name of ['Amy', 'Bob', 'Cat']) expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    expect(screen.queryByText('Dan')).toBeNull();
  });
});

describe('a night with rebuys, a re-entry, a reload and an undo', () => {
  const prize = { buyIn: 10, allowRebuys: true, rebuyAmount: 10, allowReEntry: true, manualPayouts: [] };

  it('ends with one result per player at the right place, and the money counted once', () => {
    const league = createLeague();
    const n = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat', 'Dan', 'Eve'], prize);

    n.bust('Eve', 'Amy');
    expect(league.results.filter(r => r.tournamentId === 'g1')).toHaveLength(1);

    n.rebuy('Eve'); // straight back in: her 5th-place result must go
    expect(league.results.filter(r => r.tournamentId === 'g1')).toHaveLength(0);

    n.bust('Dan', 'Bob');
    league.forgetTab(); // an iPad evicts the tab: this console's memory is gone
    n.sync();
    expect(league.results.filter(r => r.tournamentId === 'g1')).toHaveLength(1); // not recorded twice

    n.bust('Eve', 'Cat');
    n.bust('Cat', 'Amy');
    n.bust('Bob', 'Amy');
    expectCleanGame(league, 'g1', 5);

    const eve = league.results.find(r => r.tournamentId === 'g1' && league.playerDocs.find(p => p.id === r.leaguePlayerId)!.name === 'Eve')!;
    expect(eve.rebuys).toBe(1);
    expect(eve.position).toBe(4);
    n.done();
  });

  // October audit H6, as a sequence: the console's memory is per tab, so a
  // reload between a bust-out and a re-entry left the old result in place for
  // good — the recorder must read what is ALREADY recorded from the league.
  it('a reload between a bust-out and a re-entry still withdraws the old result', () => {
    const league = createLeague();
    const n = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat', 'Dan'], prize);
    n.bust('Dan', 'Amy');
    league.forgetTab();
    n.reEnter('Dan');
    expect(league.results.filter(r => r.tournamentId === 'g1')).toHaveLength(0);
    n.bust('Dan', 'Bob'); n.bust('Cat', 'Bob'); n.bust('Bob', 'Amy');
    expectCleanGame(league, 'g1', 4);
    n.done();
  });

  it('a re-entry renumbers those already out, and the league follows', () => {
    const league = createLeague();
    const n = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat', 'Dan', 'Eve'], prize);
    n.bust('Eve', 'Amy'); // 5th
    n.bust('Dan', 'Amy'); // 4th
    n.reEnter('Eve');     // Eve back in: Dan, who finished after her, moves to 5th
    const placeOf = (name: string) => league.results.find(r =>
      r.tournamentId === 'g1' && league.playerDocs.find(p => p.id === r.leaguePlayerId)!.name === name)?.position;
    expect(placeOf('Eve')).toBeUndefined();
    expect(placeOf('Dan')).toBe(n.s().players.find(p => p.name === 'Dan')!.position);
    n.bust('Eve', 'Bob'); n.bust('Cat', 'Bob'); n.bust('Bob', 'Amy');
    expectCleanGame(league, 'g1', 5);
    n.done();
  });

  it('undoing the final bust-out takes the winner back out of the league until it is played again', () => {
    const league = createLeague();
    const n = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat'], prize);
    n.bust('Cat', 'Amy'); n.bust('Bob', 'Amy');
    expectCleanGame(league, 'g1', 3);

    n.undo('Bob'); // the last hand was misrecorded
    const rows = league.results.filter(r => r.tournamentId === 'g1');
    expect(rows.map(r => r.position)).toEqual([3]); // only Cat stands; nobody holds 1st

    n.bust('Amy', 'Bob'); // replayed: Bob wins this time
    expectCleanGame(league, 'g1', 3);
    const winner = league.results.find(r => r.tournamentId === 'g1' && r.position === 1)!;
    expect(league.playerDocs.find(p => p.id === winner.leaguePlayerId)!.name).toBe('Bob');
    n.done();
  });
});

describe('a second console records the same night', () => {
  it('writes nothing twice, even against a duplicate player document', () => {
    const league = createLeague();
    // A duplicate Amy, as concurrent recording once made, with a result for g1 already under it.
    league.playerDocs.push({ id: 'dupe', name: 'amy' });
    const n = night(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat']);
    n.bust('Cat', 'Amy'); n.bust('Bob', 'Amy');
    league.forgetTab(); n.sync(); // the other console's pass, with nothing in memory
    expectCleanGame(league, 'g1', 3);
    // One row for Amy, under whichever of her documents came first.
    expect(league.table('spring').map(r => r.name.toLowerCase())).toEqual(['amy', 'bob', 'cat']);
    n.done();
  });

  it('a withdrawn result goes from EVERY document that is that person', () => {
    const league = createLeague();
    league.playerDocs.push({ id: 'a1', name: 'Amy' }, { id: 'a2', name: 'amy' });
    league.results.push(
      { id: 'x1', leaguePlayerId: 'a1', tournamentId: 'g1', seasonId: 'spring', position: 2 } as any,
      { id: 'x2', leaguePlayerId: 'a2', tournamentId: 'g1', seasonId: 'spring', position: 2 } as any,
    );
    league.removeResultForPlayer('Amy', 'g1');
    expect(league.results).toEqual([]);
  });
});
