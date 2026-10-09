import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Pressing End Season used to take Start Next Season off the screen with it:
 * both lived in a banner gated on the season NOT being ended. That left Next
 * Game as the only thing to press, and it offered "Game 13 of 12" in the season
 * just closed. The way forward has to survive the act of ending.
 */
const h = vi.hoisted(() => ({ openSetup: vi.fn() }));

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1', name: 'Fish & Chips' }, leaguePlayers: [] }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({ currentSeason: null, seasons: [], formatSeasonDateRange: () => '' }),
}));
vi.mock('@/components/RealTimeLeagueTable', () => ({ default: () => null }));

import SeasonDashboard from './SeasonDashboard';
import { SeasonSetupContext } from '@/hooks/useSeasonSetup';

/** Inside the league panel, which provides the way to the season set-up. */
const inPanel = (ui: React.ReactElement) => render(
  <SeasonSetupContext.Provider value={h.openSetup}>{ui}</SeasonSetupContext.Provider>,
);

const played = (n: number) => [{
  id: 'p1', name: 'Amy',
  tournamentResults: Array.from({ length: n }, (_, i) => ({ seasonId: 's1', tournamentId: `t${i + 1}` })),
}];

beforeEach(() => { h.openSetup.mockReset(); });

describe('SeasonDashboard', () => {
  /** THE MUTANT: gate this banner on `!isCompleted` like its sibling, and
   *  ending a season leaves nothing on screen but Next Game. */
  it('offers Start Next Season once the current season has ENDED', () => {
    inPanel(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'completed' } as any}
        leaguePlayers={played(12)}
      />,
    );
    expect(screen.getByText('Spring 2026 has ended')).toBeTruthy();
    fireEvent.click(screen.getByText('Start Next Season'));
    expect(h.openSetup).toHaveBeenCalledTimes(1);
  });

  /**
   * "This season looks finished" — an advisory box with End Season and Start
   * Next Season on a full season not yet ended — was removed on request: the
   * season pickers do that job (Next Game offers Start next season once a
   * season is full; Manage League → Seasons has End). A full season shows no box.
   */
  it('a full season that has not been ended shows no box', () => {
    inPanel(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(12)}
      />,
    );
    expect(screen.queryByText(/looks finished/)).toBeNull();
    expect(screen.queryByText('End Season')).toBeNull();
    expect(screen.queryByText('Start Next Season')).toBeNull();
  });

  it('says nothing about ending while the season is still running', () => {
    inPanel(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(4)}
      />,
    );
    expect(screen.queryByText(/has ended/)).toBeNull();
    expect(screen.queryByText('Start Next Season')).toBeNull();
  });

  // October audit, Low: the bar's label read "Game 4 of 12" from the PLAYED
  // count, one card away from a header saying "Game 5 of 12" for the game in
  // progress. It says what it measures now.
  it('labels the progress bar with games played, not a game number', () => {
    inPanel(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(4)}
      />,
    );
    expect(screen.getByText('4 of 12 played')).toBeTruthy();
    expect(screen.queryByText(/Game 4 of 12/)).toBeNull();
  });
});
