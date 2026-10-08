import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/**
 * Reported: "how many rebuys did we have last night" could not be answered
 * from History. Every record saved the totals and per-player rebuys and add-ons;
 * nothing drew them.
 */
const entry = {
  id: 'h1', name: 'Friday', type: 'season', endTime: '2026-10-07T23:00:00Z', playerCount: 6,
  winner: 'Amy', prizePool: 100, currency: '£',
  totalRebuys: 4, totalReEntries: 1, totalAddons: 0,
  results: [
    { playerId: 'a', playerName: 'Amy', position: 1, prizeMoney: 60, knockouts: 3, rebuys: 2, addons: 0 },
    { playerId: 'b', playerName: 'Bob', position: 2, prizeMoney: 40, knockouts: 1, rebuys: 1, reEntries: 1, addons: 0 },
  ],
};
vi.mock('@/hooks/useCompletedTournaments', () => ({
  useCompletedTournaments: () => ({ history: [entry], isLoading: false, deleteCompletedTournament: vi.fn() }),
}));

import TournamentHistoryDialog, { entriesLine } from './TournamentHistoryDialog';

describe('History shows what was bought back in', () => {
  it('summarises the game, leaving out what is zero', () => {
    expect(entriesLine(entry as any)).toBe('4 rebuys · 1 re-entry');
    expect(entriesLine({ totalRebuys: 1, totalReEntries: 2, totalAddons: 1 })).toBe('1 rebuy · 2 re-entries · 1 add-on');
    expect(entriesLine({})).toBe('');
  });

  it('shows the totals on the card and each player\'s when it is opened', () => {
    render(<TournamentHistoryDialog />);
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    expect(screen.getByText('4 rebuys · 1 re-entry')).toBeTruthy();
    fireEvent.click(screen.getByText('Friday'));
    expect(screen.getByText('2 rebuys')).toBeTruthy();
    expect(screen.getByText('1 re-entry')).toBeTruthy();
  });
});
