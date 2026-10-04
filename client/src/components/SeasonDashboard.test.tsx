import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Pressing End Season used to take Start Next Season off the screen with it:
 * both lived in a banner gated on the season NOT being ended. That left Next
 * Game as the only thing to press, and it offered "Game 13 of 12" in the season
 * just closed. The way forward has to survive the act of ending.
 */
const h = vi.hoisted(() => ({ openSetup: vi.fn(), endCurrentSeason: vi.fn() }));

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1', name: 'Fish & Chips' }, leaguePlayers: [] }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({ currentSeason: null, seasons: [], formatSeasonDateRange: () => '' }),
}));
vi.mock('@/hooks/useSeasonRollover', () => ({
  useSeasonRollover: () => ({
    endCurrentSeason: h.endCurrentSeason, busy: false, error: null,
  }),
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
   * Start Next Season used to create a copy of the season — same number of
   * games — on the press. It leads to the existing season set-up now (Manage
   * League → Seasons → New Season), where the director says how it runs.
   */
  it('sends a finished season to the season set-up rather than creating one', () => {
    inPanel(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(12)}
      />,
    );
    fireEvent.click(screen.getByText('Start Next Season'));
    expect(h.openSetup).toHaveBeenCalledTimes(1);
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
});
