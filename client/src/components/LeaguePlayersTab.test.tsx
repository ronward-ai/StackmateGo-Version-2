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
const setLeaguePlayerHidden = vi.fn().mockResolvedValue(undefined);
const removeLeaguePlayer = vi.fn().mockResolvedValue(undefined);

const roster = [
  { id: '1', name: 'Amy Fletcher', archived: false, resultCount: 2 },
  { id: '2', name: 'Jonh Smith', archived: false, resultCount: 1 },
  { id: '3', name: 'Ghost', archived: false, resultCount: 0 },
  { id: '4', name: 'Dave Mercer', archived: true, resultCount: 9 },
];

vi.mock('@/hooks/useLeague', () => ({
  useLeague: () => ({
    leaguePlayerDocs: roster,
    renameLeaguePlayer,
    setLeaguePlayerHidden,
    removeLeaguePlayer,
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('LeaguePlayersTab', () => {
  beforeEach(() => {
    renameLeaguePlayer.mockClear();
    setLeaguePlayerHidden.mockClear();
    removeLeaguePlayer.mockClear();
  });

  it('lists the roster with how many games each has played', () => {
    render(<LeaguePlayersTab />);
    expect(screen.getByText('Amy Fletcher')).toBeTruthy();
    expect(screen.getByText('2 games')).toBeTruthy();
    // Singular, because "1 games" beside a real player's name is the kind of
    // detail a director reads as the app being sloppy.
    expect(screen.getByText('1 game')).toBeTruthy();
  });

  it('groups the hidden players under their own heading', () => {
    render(<LeaguePlayersTab />);
    expect(screen.getByText(/Hidden \(1\)/)).toBeTruthy();
    expect(screen.getByText('Hidden')).toBeTruthy();
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

  /** A hidden namesake is still a namesake — being hidden takes a name out of
   *  the pickers, it does not release the name. */
  it('refuses a name a HIDDEN player holds', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Rename Jonh Smith'));
    fireEvent.change(screen.getByLabelText('New name for Jonh Smith'), { target: { value: 'Dave Mercer' } });
    expect(screen.getByText(/already in this league/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Save name'));
    await waitFor(() => expect(renameLeaguePlayer).not.toHaveBeenCalled());
  });

  /**
   * THE ACTION THAT REPLACED THE DESTRUCTIVE ONE. No confirmation on purpose:
   * nothing is lost, every result stays in the standings, and Show is on the
   * row next to it.
   */
  it('hides a player immediately, with nothing to confirm', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Hide Amy Fletcher'));
    await waitFor(() => expect(setLeaguePlayerHidden).toHaveBeenCalledWith('1', true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows a hidden player again', async () => {
    render(<LeaguePlayersTab />);
    fireEvent.click(screen.getByLabelText('Show Dave Mercer'));
    await waitFor(() => expect(setLeaguePlayerHidden).toHaveBeenCalledWith('4', false));
  });

  /**
   * THE REPORTED BUG, now asserted from the call site. Deleting a player with
   * history either loses real results or orphans them past a roster-outer join
   * that can never reach them again. The control is present and disabled so the
   * director is told what to do instead — a greyed button with no reason is the
   * dead control that produced `rebuyUnavailableReason`.
   */
  it('refuses to delete a player who has results, and says what to do instead', () => {
    render(<LeaguePlayersTab />);
    const button = screen.getByLabelText('Delete Amy Fletcher') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('title')).toMatch(/2 recorded results/);
    expect(button.getAttribute('title')).toMatch(/hide/i);
    expect(button.getAttribute('title')).toMatch(/rename/i);
    fireEvent.click(button);
    expect(removeLeaguePlayer).not.toHaveBeenCalled();
  });

  it('refuses to delete a hidden player who has results', () => {
    render(<LeaguePlayersTab />);
    expect((screen.getByLabelText('Delete Dave Mercer') as HTMLButtonElement).disabled).toBe(true);
  });

  /**
   * A phantom is reachable: `removeTournamentResultForPlayer` takes a result
   * back when a rebuy undoes a bust-out, so a document whose only night was
   * reverted has nothing behind it. That is the one case delete is for.
   */
  it('deletes a phantom with no results, after asking', async () => {
    render(<LeaguePlayersTab />);
    const button = screen.getByLabelText('Delete Ghost') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(screen.getByText(/no recorded results/i)).toBeTruthy();
    expect(removeLeaguePlayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeLeaguePlayer).toHaveBeenCalledWith('3'));
  });

  /**
   * The assertion this file used to carry — "names how many results a removal
   * deletes" — is GONE, and its reason goes with it: that action no longer
   * exists, because deleting a player's results to tidy a name was the bug.
   * An assertion that changes its mind needs its reason beside it.
   */
  it('never offers to delete anybody results', () => {
    render(<LeaguePlayersTab />);
    expect(screen.queryByText(/deletes their results/i)).toBeNull();
    expect(screen.getByText(/their results stay in the standings/i)).toBeTruthy();
  });
});
