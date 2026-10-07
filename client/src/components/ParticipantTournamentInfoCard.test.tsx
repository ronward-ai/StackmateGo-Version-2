import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ParticipantTournamentInfoCard from './ParticipantTournamentInfoCard';

/**
 * October audit, M17: the prize-pool breakdown on a player's phone listed the
 * buy-ins, rebuys, add-ons and fee — and a total that included re-entries it
 * never listed, so the lines did not add up to the figure under them.
 */
describe('ParticipantTournamentInfoCard prize pool', () => {
  it('lists re-entries, so the breakdown adds up to its total', () => {
    render(<ParticipantTournamentInfoCard tournament={{
      players: [
        { id: 'a', name: 'Amy', isActive: true },
        { id: 'b', name: 'Bob', isActive: true },
        { id: 'c', name: 'Cat', isActive: true, reEntries: 2 },
      ],
      prizeStructure: { buyIn: 10, allowReEntry: true, manualPayouts: [{ position: 1, percentage: 100 }] },
      settings: { currency: '£' },
    }} />);
    expect(screen.getByText('Re-entries (2×)')).toBeTruthy();
    // Buy-ins 30 + re-entries 20 = 50, with nothing else in the pool.
    expect(screen.getAllByText('£20').length).toBeGreaterThan(0);
    expect(screen.getAllByText('£50').length).toBeGreaterThan(0);
  });
});

// October audit, M9: a season with no game count is not "of 12".
describe('ParticipantTournamentInfoCard season line', () => {
  const doc = (numberOfGames?: number) => ({
    players: [{ id: 'a', name: 'Amy', isActive: true }, { id: 'b', name: 'Bob', isActive: true }],
    prizeStructure: { buyIn: 10, manualPayouts: [] },
    settings: { isSeasonTournament: true, seasonName: 'Spring', gameNumber: 4, numberOfGames },
  });

  it('says only the game number when the season sets no count', () => {
    render(<ParticipantTournamentInfoCard tournament={doc()} />);
    expect(screen.getByText(/Spring · Game 4/)).toBeTruthy();
    expect(screen.queryByText(/of 12/)).toBeNull();
  });

  it('still says "of N" when the season has one', () => {
    render(<ParticipantTournamentInfoCard tournament={doc(13)} />);
    expect(screen.getByText(/Game 4 of 13/)).toBeTruthy();
  });
});
