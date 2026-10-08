import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('@/hooks/useCompletedTournaments', () => ({
  useCompletedTournaments: () => ({ history: [], isLoading: false, deleteCompletedTournament: vi.fn() }),
}));

import SeasonGameBar from './SeasonGameBar';

/**
 * The season's games as a segmented bar: played games open that night, tonight
 * is marked, and games still to come are not controls at all.
 */
const res = (g: string, date: string, position: number, extra = {}) => ({ seasonId: 's1', tournamentId: g, date, position, ...extra });
const leaguePlayers = [
  { id: 'a', name: 'Amy', tournamentResults: [res('g1', '2026-10-01T20:00:00Z', 1), res('g2', '2026-10-08T20:00:00Z', 2)] },
  { id: 'b', name: 'Bob', tournamentResults: [res('g1', '2026-10-01T21:00:00Z', 2, { knockouts: 1 }), res('g2', '2026-10-08T21:00:00Z', 1)] },
];
const history = [{
  id: 'u_g2', ownerId: 'u', type: 'season', endTime: '2026-10-08T23:00:00Z', playerCount: 2, prizePool: 20,
  localGameId: 'g2',
  results: [
    { playerId: 'b', playerName: 'Bob', position: 1, prizeMoney: 20 },
    { playerId: 'a', playerName: 'Amy', position: 2, prizeMoney: 0, rebuys: 1 },
  ],
  summary: [{ id: 'c:0', at: Date.parse('2026-10-08T20:30:00Z'), level: 3, kind: 'rebuy', playerName: 'Amy', count: 1 }],
}] as any;

const bar = (over: Record<string, unknown> = {}) => render(
  <SeasonGameBar
    season={{ id: 's1', name: 'Autumn', numberOfGames: 6 }}
    leaguePlayers={leaguePlayers}
    currentGameId="tonight"
    history={history}
    checkGame={async () => true}
    {...over}
  />,
);

describe('the season game bar', () => {
  it('two played games are buttons; tonight and the future are not', () => {
    const { container } = bar();
    const group = screen.getByRole('group', { name: 'Games this season' });
    expect(group.children).toHaveLength(6);
    expect(screen.getAllByRole('button', { name: /^Game \d/ })).toHaveLength(2);
    expect(container.querySelectorAll('[data-slot="future"]')).toHaveLength(3);
    const current = container.querySelector('[data-slot="current"]')!;
    expect(current.tagName).toBe('DIV');
    expect(screen.getByText('Tonight is game 3 of 6')).toBeTruthy();
  });

  it('a played game opens its results, Summary and Reopen — and Reopen asks first', async () => {
    const onReopen = vi.fn();
    bar({ onReopen });
    fireEvent.click(screen.getByRole('button', { name: /^Game 2/ }));
    expect(screen.getByText('Bob')).toBeTruthy();
    expect(screen.getByText('Amy rebought (1st)')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Reopen to correct/ }));
    expect(onReopen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onReopen).toHaveBeenCalledWith('g2');
  });

  it('a game with no History record shows the league\'s own results', () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: /^Game 1/ }));
    expect(screen.getByText('1 KO')).toBeTruthy();
    expect(screen.getByText(/No summary was kept/)).toBeTruthy();
  });

  it('tapping the open game again closes it', () => {
    bar();
    const g1 = screen.getByRole('button', { name: /^Game 1/ });
    fireEvent.click(g1);
    expect(screen.getByText(/No summary was kept/)).toBeTruthy();
    fireEvent.click(g1);
    expect(screen.queryByText(/No summary was kept/)).toBeNull();
  });

  it('draws nothing without a real season', () => {
    const { container } = bar({ season: { id: 'default-season', numberOfGames: 6 } });
    expect(container.innerHTML).toBe('');
  });
});

import NightSummaryDialog from './NightSummary';

describe('the Summary dialog', () => {
  it('says a game older than the Summary has none, rather than that nothing has happened', () => {
    render(<NightSummaryDialog log={[]} hasPlayers />);
    fireEvent.click(screen.getByRole('button', { name: /Summary/ }));
    expect(screen.getByText(/started before the Summary existed/)).toBeTruthy();
    expect(screen.queryByText(/Nothing has happened yet/)).toBeNull();
  });

  it('a new game with nobody in it yet still says nothing has happened', () => {
    render(<NightSummaryDialog log={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Summary/ }));
    expect(screen.getByText(/Nothing has happened yet/)).toBeTruthy();
  });
});
