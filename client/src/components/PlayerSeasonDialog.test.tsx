import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlayerSeasonDialog from './PlayerSeasonDialog';
import { entryPricesOf } from '@/lib/resultStats';
import { renameRefusal } from '@/lib/leaguePlayerRename';

/**
 * Reported: a player's card read Net −£10 after one game in which they had
 * rebought, paying a second rake and bounty. Net counts everything paid now,
 * and the director can rename the player from the same card.
 */
const results = [{
  id: 'r1', tournamentId: 'g1', position: 7, totalPlayers: 9, points: 3,
  buyIn: 10, rebuys: 1, rebuyAmount: 10, prizeMoney: 0, date: '2026-10-29T20:00:00Z',
}];
const prices = {
  g1: entryPricesOf({
    buyIn: 10, rakeType: 'fixed', rakeAmount: 2, enableBounties: true, bountyAmount: 3,
    rebuyRake: true, rebuyRakeAmount: 2, rebuyBounty: true,
  } as any),
};

function open(extra: Record<string, unknown> = {}) {
  return render(
    <PlayerSeasonDialog isOpen onClose={() => {}} playerName="Dave" results={results as any}
      currencySymbol="£" prices={prices} {...extra} />,
  );
}

describe('PlayerSeasonDialog', () => {
  it("Net counts the rake and bounty of every entry", () => {
    open();
    // £10 buy-in + £10 rebuy, a £2 rake and £3 bounty on each: £30 paid, nothing back.
    expect(screen.getAllByText('−£30')).toHaveLength(2); // the total, and the game's own row
    expect(screen.getByText('£30')).toBeTruthy(); // Paid in
  });

  it('offers no rename when none is passed — a phone or a read-only console', () => {
    open();
    expect(screen.queryByLabelText('Rename Dave')).toBeNull();
  });

  it('saves the trimmed name', async () => {
    const onRename = vi.fn().mockResolvedValue(undefined);
    open({ onRename, renameRefusal: (n: string) => renameRefusal('Dave', n, ['Dave', 'Amy'], []) });
    fireEvent.click(screen.getByLabelText('Rename Dave'));
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: '  David ' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(onRename).toHaveBeenCalledWith('David'));
  });

  it('shows the refusal and does not rename', () => {
    const onRename = vi.fn();
    open({ onRename, renameRefusal: (n: string) => renameRefusal('Dave', n, ['Dave', 'Amy'], []) });
    fireEvent.click(screen.getByLabelText('Rename Dave'));
    fireEvent.change(screen.getByLabelText('Player name'), { target: { value: 'amy' } });
    fireEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('alert').textContent).toMatch(/already called/);
    expect(onRename).not.toHaveBeenCalled();
  });
});
