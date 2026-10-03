import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LeaguePlayersTab from './LeaguePlayersTab';

/**
 * The decisions live in `lib/leagueRoster.ts` and `useLeague`; what this pins is
 * the CALL SITE, which is where this codebase's defects keep living — the
 * results-column arrows were correct in isolation and wrong in twenty lines of
 * component.
 */
const renameLeaguePlayer = vi.fn().mockResolvedValue(undefined);
const removeLeaguePlayer = vi.fn().mockResolvedValue(undefined);

const roster = [
  { id: '1', name: 'Amy Fletcher', tournamentResults: [{ id: 'r1' }, { id: 'r2' }] },
  { id: '2', name: 'Jonh Smith', tournamentResults: [{ id: 'r3' }] },
  { id: '3', name: 'Ghost', tournamentResults: [] },
];

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({ leaguePlayers: roster, renameLeaguePlayer, removeLeaguePlayer }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('LeaguePlayersTab', () => {
  beforeEach(() => { renameLeaguePlayer.mockClear(); removeLeaguePlayer.mockClear(); });

  it('lists the roster with how many games each has played', () => {
    render(<LeaguePlayersTab />);
    expect(screen.getByText('Amy Fletcher')).toBeTruthy();
    expect(screen.getByText('2 games')).toBeTruthy();
    // Singular, because "1 games" beside a real player's name is the kind of
    // detail a director reads as the app being sloppy.
    expect(screen.getByText('1 game')).toBeTruthy();
  });

  // THE POINT OF THE FEATURE: a misspelling is corrected, keeping the history.
  it('renames a player', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Rename Jonh Smith'));
    fireEvent.change(screen.getByLabelText('New name for Jonh Smith'), { target: { value: 'John Smith' } });
    fireEvent.click(screen.getByLabelText('Save name'));
    await waitFor(() => expect(renameLeaguePlayer).toHaveBeenCalledWith('2', 'John Smith'));
  });

  /**
   * THE MUTANT: write the rename anyway. `recordResultByName` matches by NAME,
   * so two players sharing one would send future nights to whichever `find`
   * reaches first — and the League Roster picker de-dupes by name, so the clash
   * would be INVISIBLE while splitting the league's history.
   */
  it('refuses a name another player already holds, and says so', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Rename Jonh Smith'));
    fireEvent.change(screen.getByLabelText('New name for Jonh Smith'), { target: { value: 'amy fletcher' } });
    expect(screen.getByText(/already in this league/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Save name'));
    await waitFor(() => expect(renameLeaguePlayer).not.toHaveBeenCalled());
  });

  // THE MUTANT: a bare "Are you sure?". Removing is the one irreversible thing
  // on this screen, and what it costs is the number of nights it deletes.
  it('names how many results a removal deletes, and waits to be told', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Remove Amy Fletcher'));
    expect(screen.getByText(/2 recorded results/)).toBeTruthy();
    expect(removeLeaguePlayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeLeaguePlayer).toHaveBeenCalledWith('1'));
  });

  // A player with nothing behind them should not be warned about losing nothing.
  it('says plainly when there is no history to lose', () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Remove Ghost'));
    expect(screen.getByText(/no recorded results/i)).toBeTruthy();
  });
});
