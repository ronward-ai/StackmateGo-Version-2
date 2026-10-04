import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Pressing End Season used to take Start Next Season off the screen with it:
 * both lived in a banner gated on the season NOT being ended. That left Next
 * Game as the only thing to press, and it offered "Game 13 of 12" in the season
 * just closed. The way forward has to survive the act of ending.
 */
const h = vi.hoisted(() => ({ startNextSeason: vi.fn(), endCurrentSeason: vi.fn() }));

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ league: { id: 'L1', name: 'Fish & Chips' }, leaguePlayers: [] }),
}));
vi.mock('@/hooks/useSeasons', () => ({
  useSeasons: () => ({ currentSeason: null, seasons: [], formatSeasonDateRange: () => '' }),
}));
vi.mock('@/hooks/useSeasonRollover', () => ({
  useSeasonRollover: () => ({
    startNextSeason: h.startNextSeason, endCurrentSeason: h.endCurrentSeason, busy: false, error: null,
  }),
}));
vi.mock('@/components/RealTimeLeagueTable', () => ({ default: () => null }));

import SeasonDashboard from './SeasonDashboard';

const played = (n: number) => [{
  id: 'p1', name: 'Amy',
  tournamentResults: Array.from({ length: n }, (_, i) => ({ seasonId: 's1', tournamentId: `t${i + 1}` })),
}];

beforeEach(() => { h.startNextSeason.mockReset().mockResolvedValue('s2'); });

describe('SeasonDashboard', () => {
  /** THE MUTANT: gate this banner on `!isCompleted` like its sibling, and
   *  ending a season leaves nothing on screen but Next Game. */
  it('offers Start Next Season once the current season has ENDED', async () => {
    render(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'completed' } as any}
        leaguePlayers={played(12)}
      />,
    );
    expect(screen.getByText('Spring 2026 has ended')).toBeTruthy();
    fireEvent.click(screen.getByText('Start Next Season'));
    // It leads to set-up — it does not create a season by itself.
    expect(screen.getByText('Set up the next season')).toBeTruthy();
    expect(h.startNextSeason).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Create season'));
    await waitFor(() => expect(h.startNextSeason).toHaveBeenCalledTimes(1));
    expect(h.startNextSeason.mock.calls[0][0]).toMatchObject({ kind: 'games', numberOfGames: 12 });
  });

  /**
   * THE REPORT: Start Next Season created a copy of the old season — same
   * number of games — with no chance to say the new one runs between dates.
   * THE MUTANT: wire the button straight to startNextSeason again.
   */
  it('asks how the next season runs before creating it', async () => {
    render(
      <SeasonDashboard
        season={{ id: 's1', name: 'Season 3', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(12)}
      />,
    );
    fireEvent.click(screen.getByText('Start Next Season'));
    expect(h.startNextSeason).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('radio', { name: /Between two dates/ }));
    const [from, to] = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(from, { target: { value: '2027-01-01' } });
    fireEvent.change(to, { target: { value: '2027-03-31' } });
    fireEvent.change(screen.getByLabelText('Number of Games'), { target: { value: '13' } });
    fireEvent.click(screen.getByText('Create season'));

    await waitFor(() => expect(h.startNextSeason).toHaveBeenCalledTimes(1));
    expect(h.startNextSeason.mock.calls[0][0]).toMatchObject({
      kind: 'calendar', name: 'Season 4', numberOfGames: 13, startDate: '2027-01-01', endDate: '2027-03-31',
    });
  });

  it('says nothing about ending while the season is still running', () => {
    render(
      <SeasonDashboard
        season={{ id: 's1', name: 'Spring 2026', numberOfGames: 12, status: 'active' } as any}
        leaguePlayers={played(4)}
      />,
    );
    expect(screen.queryByText(/has ended/)).toBeNull();
    expect(screen.queryByText('Start Next Season')).toBeNull();
  });
});
