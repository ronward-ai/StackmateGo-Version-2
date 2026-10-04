import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NewSeasonDialog from './NewSeasonDialog';

/**
 * Start Next Season used to create the next season on the press of a button —
 * the following dates and the SAME number of games — which is wrong for a league
 * whose seasons follow the calendar. It now leads here: the director is asked how
 * the season runs, from a draft of the one that ended, and nothing is created
 * until they say so.
 */
function open(previousSeason: any, onCreate = vi.fn().mockResolvedValue('s2')) {
  const onOpenChange = vi.fn();
  render(
    <NewSeasonDialog open onOpenChange={onOpenChange} previousSeason={previousSeason} onCreate={onCreate} />,
  );
  return { onCreate, onOpenChange };
}

const dateInputs = () => Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
const create = () => screen.getByText('Create season').closest('button') as HTMLButtonElement;

describe('NewSeasonDialog', () => {
  it('starts a dateless season from the same count and the next name, as a set number of games', async () => {
    const { onCreate, onOpenChange } = open({ id: 's1', name: 'Season 3', numberOfGames: 10 });

    expect(screen.getByRole('radio', { name: /A set number of games/ }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Season Name') as HTMLInputElement).value).toBe('Season 4');
    expect((screen.getByLabelText('Number of Games') as HTMLInputElement).value).toBe('10');
    expect(dateInputs()).toHaveLength(0);

    fireEvent.click(create());
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ kind: 'games', name: 'Season 4', numberOfGames: 10 });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('starts a dated season on the next period, between two dates', () => {
    open({ id: 's1', name: 'Q1 2026', startDate: '2026-01-01', endDate: '2026-03-31', numberOfGames: 12 });
    expect(screen.getByRole('radio', { name: /Between two dates/ }).getAttribute('aria-checked')).toBe('true');
    expect(dateInputs().map(i => i.value)).toEqual(['2026-04-01', '2026-06-30']);
  });

  /** The calendar case the report is about: Apr–Jun is not Jan–Mar. Picking
   *  the night the league plays counts the games for the new range. */
  it('counts the games from the dates once the play nights are picked', () => {
    open({ id: 's1', name: 'Q1 2026', startDate: '2026-01-01', endDate: '2026-03-31', numberOfGames: 12 });
    fireEvent.click(screen.getByLabelText('Wednesday'));
    // 1 April to 30 June 2026 holds 13 Wednesdays.
    expect((screen.getByLabelText('Number of Games') as HTMLInputElement).value).toBe('13');
  });

  it('will not create a calendar season until both dates are set', () => {
    open({ id: 's1', name: 'Season 3', numberOfGames: 10 });
    fireEvent.click(screen.getByRole('radio', { name: /Between two dates/ }));
    expect(create().disabled).toBe(true);

    const [from, to] = dateInputs();
    fireEvent.change(from, { target: { value: '2026-04-01' } });
    expect(create().disabled).toBe(true);
    fireEvent.change(to, { target: { value: '2026-06-30' } });
    expect(create().disabled).toBe(false);
  });

  // The answers survive a failure, so a retry is one press.
  it('stays open when the season could not be created', async () => {
    const { onCreate, onOpenChange } = open({ id: 's1', name: 'Season 3', numberOfGames: 10 }, vi.fn().mockResolvedValue(null));
    fireEvent.click(create());
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
