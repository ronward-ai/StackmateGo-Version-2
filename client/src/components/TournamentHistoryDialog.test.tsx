import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  localGameId: 'game_1',
  results: [
    { playerId: 'a', playerName: 'Amy', position: 1, prizeMoney: 60, knockouts: 3, rebuys: 2, addons: 0 },
    { playerId: 'b', playerName: 'Bob', position: 2, prizeMoney: 40, knockouts: 1, rebuys: 1, reEntries: 1, addons: 0 },
  ],
  summary: [
    { id: 'c:0', at: new Date(2026, 9, 7, 20, 5).getTime(), level: 2, kind: 'bust', playerId: 'b', playerName: 'Bob', byName: 'Amy', position: 2 },
    { id: 'c:1', at: new Date(2026, 9, 7, 20, 6).getTime(), level: 2, kind: 'rebuyRefused', playerId: 'b', playerName: 'Bob', detail: 'the rebuy period has ended' },
  ],
};
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('@/hooks/useCompletedTournaments', () => ({
  useCompletedTournaments: () => ({ history: [entry], isLoading: false, deleteCompletedTournament: vi.fn() }),
}));

import TournamentHistoryDialog, { entriesLine, liveGameIdOf } from './TournamentHistoryDialog';

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

describe('History reopens a game to correct it', () => {
  const openRow = () => {
    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(screen.getByText('Friday'));
  };

  it('offers Reopen when the live record exists, confirms, then opens THAT game', async () => {
    const onReopen = vi.fn();
    const loadGame = vi.fn(async () => ({ players: [] }));
    render(<TournamentHistoryDialog onReopen={onReopen} loadGame={loadGame} currentGameInPlay />);
    openRow();
    const button = await screen.findByRole('button', { name: /Reopen to correct/ });
    expect(loadGame).toHaveBeenCalledWith('game_1');
    fireEvent.click(button);
    expect(screen.getByText(/Undo a bust-out to correct the result/)).toBeTruthy();
    expect(screen.getByText(/Your current game stays saved/)).toBeTruthy();
    expect(onReopen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onReopen).toHaveBeenCalledWith('game_1');
  });

  it('says why, and offers nothing, when the live record is gone', async () => {
    render(<TournamentHistoryDialog onReopen={vi.fn()} loadGame={async () => null} />);
    openRow();
    await waitFor(() => expect(screen.getByText(/live record no longer exists/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Reopen to correct/ })).toBeNull();
  });

  it('prefers the explicit tournamentId over the localGameId', () => {
    expect(liveGameIdOf({ tournamentId: 'doc', localGameId: 'game_1' })).toBe('doc');
    expect(liveGameIdOf({ localGameId: 'game_1' })).toBe('game_1');
    expect(liveGameIdOf({})).toBeNull();
  });

  it('shows the Summary kept with the record', () => {
    render(<TournamentHistoryDialog />);
    openRow();
    expect(screen.getByText('Bob busted by Amy — 2nd')).toBeTruthy();
    expect(screen.getByText('Rebuy refused for Bob: the rebuy period has ended')).toBeTruthy();
    expect(screen.getByText('20:06')).toBeTruthy();
  });
});
