import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * The decision lives in `lib/seasonProgress.ts` (`nextGameState`,
 * `nextGameLabel`) and has its own tests. What this pins is the CALL SITE —
 * the dialog that, after End Season, offered and started "Game 13 of 12" in the
 * season the director had just closed. The component had no test at all.
 */
const h = vi.hoisted(() => ({
  startNewGame: vi.fn(),
  openSetup: vi.fn(),
  seasons: [] as any[],
}));

vi.mock('@/hooks/useNewGame', () => ({
  useNewGame: () => ({ startNewGame: h.startNewGame, newGameGuard: null }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({ seasons: h.seasons, isLoading: false }),
}));
vi.mock('@/hooks/useLeague', () => ({ useLeague: () => ({}) }));

import NextGameControl from './NextGameControl';
import { SeasonSetupContext } from '@/hooks/useSeasonSetup';

const spring = (over: any = {}) => ({ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active', ...over });
const summer = { id: 's2', name: 'Summer 2026', numberOfGames: 12, status: 'active' };

/** One player with a result in each of `n` games of the season. */
const playedIn = (seasonId: string, n: number) => [{
  id: 'p1', name: 'Amy',
  tournamentResults: Array.from({ length: n }, (_, i) => ({ seasonId, tournamentId: `t${i + 1}` })),
}];

function open(currentSeason: any, gamesPlayed: number, storedSeasonId = 's1') {
  render(
    <SeasonSetupContext.Provider value={h.openSetup}>
    <NextGameControl
      tournament={{
        state: { details: { type: 'season' }, settings: { isSeasonTournament: true, seasonId: storedSeasonId } },
        updateSettings: vi.fn(),
      } as any}
      league={{ id: 'L1', name: 'Fish & Chips' } as any}
      userLeagues={[{ id: 'L1', name: 'Fish & Chips' }] as any}
      leaguePlayers={playedIn('s1', gamesPlayed) as any}
      switchLeague={vi.fn() as any}
      currentSeason={currentSeason}
      seasons={h.seasons as any}
    />
    </SeasonSetupContext.Provider>,
  );
  fireEvent.click(screen.getByText('Next Game'));
}

beforeEach(() => {
  h.startNewGame.mockReset();
  h.openSetup.mockReset();
});

describe('NextGameControl', () => {
  it('starts the next game of a season with games left', () => {
    h.seasons = [spring()];
    open(spring(), 4);
    expect(screen.getByText('Game 5 of 12')).toBeTruthy();
    expect(screen.getByText('Start Game 5')).toBeTruthy();
  });

  /**
   * THE REPORT. End Season, then Next Game offered — and started — Game 13 of
   * 12. An ended season takes no next game: there must be no button that starts
   * one, and the way forward is the next season.
   */
  it('offers no game in an ENDED season, only the next season', () => {
    h.seasons = [spring({ status: 'completed' })];
    open(spring({ status: 'completed' }), 12);

    expect(screen.getByText('Spring 2026 has ended.')).toBeTruthy();
    expect(screen.queryByText(/Start Game/)).toBeNull();
    expect(screen.queryByText(/Game 13/)).toBeNull();
    expect(screen.queryByText(/extra game/i)).toBeNull();

    // It leads to the season set-up in Manage League, and closes this dialog.
    fireEvent.click(screen.getByText('Start next season'));
    expect(h.openSetup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Start next league game')).toBeNull();
    expect(h.startNewGame).not.toHaveBeenCalled();
  });

  /**
   * Every scheduled game played, not yet ended: the next season is the main
   * action, and an extra game is still allowed — warned, not refused — and says
   * plainly that it is past the schedule rather than reading "Game 13 of 12".
   */
  it('points a FULL season at the next one, and labels an extra game honestly', () => {
    h.seasons = [spring()];
    open(spring(), 12);

    expect(screen.getByText('Start next season')).toBeTruthy();
    expect(screen.queryByText('Start Game 13')).toBeNull();
    expect(screen.queryByText(/Game 13 of 12/)).toBeNull();

    const extra = screen.getByText(/Play an extra game in Spring 2026/);
    expect(extra.textContent).toMatch(/Game 13 — beyond the 12 scheduled/);
    fireEvent.click(extra);
    expect(h.startNewGame).toHaveBeenCalledTimes(1);
  });

  /**
   * The finished game on screen still carries the ended season. Once the league
   * has moved on, Next Game must default to the league's CURRENT season rather
   * than the one the last game happened to be played in.
   */
  it('defaults to the current season once the stored one has ended', () => {
    h.seasons = [spring({ status: 'completed' }), summer];
    open(summer, 12, 's1');
    expect(screen.queryByText(/has ended/)).toBeNull();
    expect(screen.getByText('Start Game 1')).toBeTruthy();
  });
});
