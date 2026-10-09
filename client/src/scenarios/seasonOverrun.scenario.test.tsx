import { renderHook, act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A SEASON PLAYED PAST ITS SCHEDULE, THEN ENDED (October 2026).
 *
 * A two-game season that gets a third night — a rescheduled week is real — and
 * then is ended and replaced. Each screen asks its own question about where the
 * season is, and they have disagreed before: "Game 14 of 13" on one card and
 * "Game 13 of 13" on another, and Next Game offering "Game 13 of 12" in a season
 * the director had just ended. This plays the nights through the real hook and
 * recorder decisions (./leagueHarness.ts) and reads the real screens.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

const screens = vi.hoisted(() => ({
  league: null as any, seasons: [] as any[], current: 'spring',
  startNewGame: null as any, openSetup: null as any,
}));
vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1', name: 'Test League' }, leaguePlayers: screens.league.standings(), isLoading: false }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({
    currentSeason: screens.seasons.find((s: any) => s.id === screens.current),
    seasons: screens.seasons, isLoading: false, formatSeasonDateRange: () => '',
  }),
}));
vi.mock('@/hooks/useLeagueSettings', () => {
  const s = { settings: { statsToDisplay: {}, displaySettings: {} }, calculatePoints: () => 0 };
  return { useLeagueSettings: () => s };
});
vi.mock('@/hooks/useNewGame', () => ({ useNewGame: () => ({ startNewGame: screens.startNewGame, newGameGuard: null }) }));
vi.mock('@/components/export/captureSheet', () => ({ captureSheet: vi.fn(), sheetFilename: () => 'x.png' }));

import { useTournament } from '@/hooks/useTournament';
import NextGameControl from '@/components/NextGameControl';
import SeasonDashboard from '@/components/SeasonDashboard';
import { SeasonSetupContext } from '@/hooks/useSeasonSetup';
import { gameNumberFor, nextGameNumber, nextGameState, seasonLine, countGamesPlayed } from '@/lib/seasonProgress';
import { createLeague } from './leagueHarness';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
  screens.startNewGame = vi.fn();
  screens.openSetup = vi.fn();
});

function playNight(league: ReturnType<typeof createLeague>, gameId: string, seasonId: string, names: string[]) {
  const h = renderHook(() => useTournament(undefined));
  act(() => { h.result.current.resetTournament({ keepStructure: true }); });
  act(() => { for (const n of names) h.result.current.addPlayer(n); });
  const id = (n: string) => h.result.current.state.players.find(p => p.name === n)!.id;
  for (const out of names.slice(1).reverse()) {
    act(() => { h.result.current.eliminatePlayer(id(out), id(names[0])); });
    league.sync(h.result.current.state, gameId, seasonId);
  }
  h.unmount();
}

function openNextGame(seasonId: string) {
  render(
    <SeasonSetupContext.Provider value={screens.openSetup}>
      <NextGameControl
        tournament={{ state: { details: { type: 'season' }, settings: { isSeasonTournament: true, seasonId } }, updateSettings: vi.fn() } as any}
        league={{ id: 'L1', name: 'Test League' } as any}
        userLeagues={[{ id: 'L1', name: 'Test League' }] as any}
        leaguePlayers={screens.league.standings()}
        switchLeague={vi.fn() as any}
        currentSeason={screens.seasons.find((s: any) => s.id === screens.current)}
        seasons={screens.seasons}
      />
    </SeasonSetupContext.Provider>,
  );
  fireEvent.click(screen.getByText('Next Game'));
}

describe('a two-game season that gets a third night, and is then ended', () => {
  it('says the same thing on every screen at every step', () => {
    const league = createLeague();
    screens.league = league;
    screens.seasons = [{ id: 'spring', name: 'Spring', numberOfGames: 2, status: 'active' }];
    screens.current = 'spring';

    playNight(league, 'g1', 'spring', ['Amy', 'Bob', 'Cat']);
    playNight(league, 'g2', 'spring', ['Amy', 'Bob', 'Dan']);
    const players = league.standings();
    expect(countGamesPlayed('spring', players)).toBe(2);
    expect(nextGameState(screens.seasons[0], 2)).toBe('full');

    // Next Game: steered to the next season, with the extra game labelled honestly.
    openNextGame('spring');
    expect(screen.getByText('Start next season')).toBeTruthy();
    expect(screen.queryByText('Start Game 3')).toBeNull();
    expect(screen.queryByText(/Game 3 of 2/)).toBeNull();
    const extra = screen.getByText(/Play an extra game in Spring/);
    expect(extra.textContent).toMatch(/Game 3 — beyond the 2 scheduled/);
    fireEvent.click(extra);
    expect(screens.startNewGame).toHaveBeenCalledTimes(1);
    cleanup();

    // The extra night is played and counts.
    playNight(league, 'g3', 'spring', ['Bob', 'Cat', 'Dan']);
    expect(countGamesPlayed('spring', league.standings())).toBe(3);
    expect(league.table('spring').find(r => r.name === 'Bob')!.games).toBe(3);
    // During it, the header clamps — "Game 2 of 2" is the kinder reading on a
    // game already under way — and never says "Game 3 of 2".
    expect(gameNumberFor('spring', league.standings(), 'g3')).toBe(3);
    expect(seasonLine({ seasonName: 'Spring', gameNumber: 3, numberOfGames: 2 })).toBe('Spring · Game 2 of 2');

    // The season panel agrees: clamped, nothing remaining.
    render(
      <SeasonSetupContext.Provider value={screens.openSetup}>
        <SeasonDashboard tournament={{ ownerId: 'u1', settings: { isSeasonTournament: true, leagueId: 'L1' } } as any} />
      </SeasonSetupContext.Provider>,
    );
    expect(screen.getByText('2 of 2 played')).toBeTruthy();
    expect(screen.getByText('0 remaining')).toBeTruthy();
    cleanup();

    // The director ends it. No game can start in it any more.
    screens.seasons = [{ id: 'spring', name: 'Spring', numberOfGames: 2, status: 'completed' }];
    openNextGame('spring');
    expect(screen.getByText('Spring has ended.')).toBeTruthy();
    expect(screen.queryByText(/Start Game/)).toBeNull();
    expect(screen.queryByText(/extra game/i)).toBeNull();
    cleanup();

    // Summer begins: game 1, an empty table, and Next Game defaults to it even
    // though the last game on screen was played in Spring.
    screens.seasons = [
      { id: 'spring', name: 'Spring', numberOfGames: 2, status: 'completed' },
      { id: 'summer', name: 'Summer', numberOfGames: 10, status: 'active' },
    ];
    screens.current = 'summer';
    expect(nextGameNumber('summer', league.standings())).toBe(1);
    expect(league.table('summer')).toEqual([]);
    openNextGame('spring');
    expect(screen.queryByText(/has ended/)).toBeNull();
    expect(screen.getByText('Start Game 1')).toBeTruthy();
    cleanup();

    // And Spring's three nights stand, scored 10 a place (linear): Bob 20+20+30,
    // Amy 30+30, Cat 10+20, Dan 10+10.
    expect(league.table('spring').map(r => [r.name, r.games, r.points])).toEqual([
      ['Bob', 3, 70], ['Amy', 2, 60], ['Cat', 2, 30], ['Dan', 2, 20],
    ]);
  });
});
