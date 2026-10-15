import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
const capture = vi.hoisted(() => ({ calls: [] as any[] }));
vi.mock('@/components/export/captureSheet', () => ({
  captureSheet: async (node: any, opts: any) => { capture.calls.push({ node, opts }); },
  sheetFilename: () => 'results.png',
}));
vi.mock('@/hooks/useLeagueSettings', () => ({ useLeagueSettings: () => ({ calculatePoints: () => 0 }) }));
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
    loadGame={async () => ({ players: [] })}
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

  /**
   * Reported from a live season: with the finished game 2 still open on the
   * console, only game 1 could be pressed. Game 2 was drawn as tonight's outline,
   * which is not a control. A game with results is a button, open or not.
   */
  /**
   * Reported from a live season: game 1 opened with game 2 — tonight's game,
   * the console's own table — underneath, and game 2 opened showed it twice.
   * Tonight's box is teal, opens nothing (its results are the table below) and
   * closes any past game; the page is told when a past game is open so it can
   * step tonight's table aside.
   */
  it('tonight is teal, opens no second copy, and closes a past game', () => {
    const changes: boolean[] = [];
    const { container } = bar({ currentGameId: 'g2', onSelectedChange: (o: boolean) => changes.push(o) });
    const tonight = container.querySelector('[data-slot="tonight-played"]')!;
    expect(tonight.tagName).toBe('BUTTON');
    expect(tonight.className).toContain('ring-teal-400');
    expect(screen.getByRole('button', { name: /^Game 1/ }).className).not.toContain('teal');
    // Tonight opens nothing.
    fireEvent.click(tonight);
    expect(screen.queryByText('Bob')).toBeNull();
    // A past game opens, and the page hears about it.
    fireEvent.click(screen.getByRole('button', { name: /^Game 1/ }));
    expect(screen.getByText('1 KO')).toBeTruthy();
    expect(changes[changes.length - 1]).toBe(true);
    // Tonight's box takes us back.
    fireEvent.click(tonight);
    expect(screen.queryByText('1 KO')).toBeNull();
    expect(changes[changes.length - 1]).toBe(false);
  });

  it('tonight before its first result is teal too', () => {
    const { container } = bar();
    expect(container.querySelector('[data-slot="current"]')!.className).toContain('teal');
  });

  it('a played game opens its results, Summary and Reopen — and Reopen asks first', async () => {
    const onReopen = vi.fn();
    bar({ onReopen });
    fireEvent.click(screen.getByRole('button', { name: /^Game 2/ }));
    expect(screen.getByText('Bob')).toBeTruthy();
    // The Summary is folded away under the results until asked for.
    expect(screen.queryByText('Amy rebought (1st)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show summary \(1\)/ }));
    expect(screen.getByText('Amy rebought (1st)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Hide summary/ }));
    expect(screen.queryByText('Amy rebought (1st)')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Reopen to correct/ }));
    expect(onReopen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(onReopen).toHaveBeenCalledWith('g2');
  });

  it('a game with no History record shows the league\'s own results', () => {
    bar();
    fireEvent.click(screen.getByRole('button', { name: /^Game 1/ }));
    expect(screen.getByText('1 KO')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Show summary/ }));
    expect(screen.getByText(/No summary was kept/)).toBeTruthy();
  });

  it('tapping the open game again closes it', () => {
    bar();
    const g1 = screen.getByRole('button', { name: /^Game 1/ });
    fireEvent.click(g1);
    expect(screen.getByText('1 KO')).toBeTruthy();
    fireEvent.click(g1);
    expect(screen.queryByText('1 KO')).toBeNull();
  });

  it('a played night with its live record shows the console\'s results table and exports it the same way', async () => {
    const live = {
      players: [
        { id: 'a', name: 'Amy', position: 2, isActive: false, knockouts: 0 },
        { id: 'b', name: 'Bob', position: 1, isActive: false, knockouts: 1 },
      ],
      prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] },
      settings: { branding: { eventName: 'Friday League' } },
      createdAt: '2026-10-08T19:00:00Z',
    };
    bar({ loadGame: async () => live });
    fireEvent.click(screen.getByRole('button', { name: /^Game 2/ }));
    const exportButton = await screen.findByRole('button', { name: /Export Results/ });
    expect(screen.getByRole('button', { name: /CSV/ })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
    fireEvent.click(exportButton);
    await waitFor(() => expect(capture.calls).toHaveLength(1));
    expect(capture.calls[0].node.props.title).toBe('Friday League');
    // Dated by the night it was played, not the day it was exported.
    expect(capture.calls[0].node.props.date).toBe('2026-10-08T19:00:00Z');
  });

  it('a past night draws with the console\'s CURRENT columns, on screen and in the export', async () => {
    capture.calls.length = 0;
    const live = {
      players: [
        { id: 'a', name: 'Amy', position: 2, isActive: false, knockouts: 0, rebuys: 1 },
        { id: 'b', name: 'Bob', position: 1, isActive: false, knockouts: 1 },
      ],
      prizeStructure: { buyIn: 10, allowRebuys: true, manualPayouts: [{ position: 1, percentage: 100 }] },
      // Last night's choice, stored on the night.
      settings: { resultColumns: ['knockouts'] },
    };
    bar({ loadGame: async () => live, resultColumns: ['rebuys'] });
    fireEvent.click(screen.getByRole('button', { name: /^Game 2/ }));
    const exportButton = await screen.findByRole('button', { name: /Export Results/ });
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('Rebuys');
    expect(headers).not.toContain('Hits');
    fireEvent.click(exportButton);
    await waitFor(() => expect(capture.calls).toHaveLength(1));
    expect(capture.calls[0].node.props.settings.resultColumns).toEqual(['rebuys']);
  });

  it('without a choice from the console, the night keeps its own columns', async () => {
    const live = {
      players: [
        { id: 'a', name: 'Amy', position: 2, isActive: false, knockouts: 0 },
        { id: 'b', name: 'Bob', position: 1, isActive: false, knockouts: 1 },
      ],
      prizeStructure: { buyIn: 10, allowRebuys: true },
      settings: { resultColumns: ['knockouts'] },
    };
    bar({ loadGame: async () => live });
    fireEvent.click(screen.getByRole('button', { name: /^Game 2/ }));
    await screen.findByRole('table');
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(headers).toContain('Hits');
    expect(headers).not.toContain('Rebuys');
  });

  it('segments carry their game numbers, so a phone can see what it is tapping', () => {
    bar();
    expect(screen.getByRole('button', { name: /^Game 1/ }).textContent).toBe('1');
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
