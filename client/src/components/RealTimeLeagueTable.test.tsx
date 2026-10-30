import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

/**
 * Reported from a test night: start a new season and the standings listed
 * every player from earlier seasons at the bottom on 0 games. A player belongs
 * to the LEAGUE; a row belongs to the SEASON — lib/playerSeason.ts's seasonRoster.
 */
const results = (season: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `${season}-${i}`, tournamentId: `${season}-g${i}`, seasonId: season,
    position: 1, totalPlayers: 4, points: 10, date: '2026-10-01T20:00:00Z',
  }));

let league: any = {};
const settings = { settings: { statsToDisplay: {}, displaySettings: {} }, calculatePoints: () => 0 };
const auth = { isLoading: false, user: { id: 'o' }, isAnonymous: false };
const seasonsFor = (current: string) => ({
  currentSeason: { id: current, name: current, numberOfGames: 12 },
  seasons: [{ id: 'spring', name: 'spring' }, { id: 'summer', name: 'summer' }],
});
let seasons: any = seasonsFor('summer');

vi.mock('@/hooks/useLeague', () => ({ useLeague: () => league }));
vi.mock('@/hooks/useLeagueSettings', () => ({ useLeagueSettings: () => settings }));
vi.mock('@/hooks/useSeasons', () => ({ useSeasons: () => seasons }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
let gamePrices: any = {};
vi.mock('@/hooks/useGamePrices', () => ({ useGamePrices: () => gamePrices }));
vi.mock('@/components/export/captureSheet', () => ({ captureSheet: vi.fn(), sheetFilename: () => 'x.png' }));

import RealTimeLeagueTable from './RealTimeLeagueTable';

const tournament = { ownerId: 'o', settings: { isSeasonTournament: true, leagueId: 'L1' } };
const players = [
  { id: 'a', name: 'Amy', tournamentResults: results('spring', 3) },
  { id: 'b', name: 'Bob', tournamentResults: [...results('spring', 2), ...results('summer', 1)] },
];

describe('RealTimeLeagueTable on a new season', () => {
  it('lists only the players who have played THIS season', () => {
    league = { league: { id: 'L1', name: 'Test League' }, leaguePlayers: players, isLoading: false };
    seasons = seasonsFor('summer');
    render(<RealTimeLeagueTable tournament={tournament} />);
    expect(screen.getAllByText('Bob').length).toBeGreaterThan(0);
    expect(screen.queryByText('Amy')).toBeNull();
  });

  it('shows the "starts tonight" state, not a list of zeroes, before the first result', () => {
    league = { league: { id: 'L1', name: 'Test League' }, leaguePlayers: players, isLoading: false };
    seasons = seasonsFor('autumn');
    render(<RealTimeLeagueTable tournament={tournament} />);
    expect(screen.queryByText('Amy')).toBeNull();
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.getByText(/starts tonight/)).toBeTruthy();
  });
});

describe('Games counts games, not results', () => {
  it('a player recorded twice in one game has played one game', () => {
    const twice = [
      { id: 'x1', tournamentId: 'g1', seasonId: 'summer', position: 2, points: 5, date: '2026-10-01T20:00:00Z' },
      { id: 'x2', tournamentId: 'g1', seasonId: 'summer', position: 2, points: 5, date: '2026-10-01T20:00:00Z' },
    ];
    league = { league: { id: 'L1', name: 'Test League' }, leaguePlayers: [{ id: 'd', name: 'Dan', tournamentResults: twice }], isLoading: false };
    seasons = seasonsFor('summer');
    settings.settings.statsToDisplay = { games: true } as any;
    render(<RealTimeLeagueTable tournament={tournament} />);
    settings.settings.statsToDisplay = {};
    const headers = screen.getAllByRole('columnheader').map(h => h.textContent?.trim());
    const gamesCol = headers.findIndex(h => h === 'Games');
    expect(gamesCol).toBeGreaterThan(-1);
    const row = screen.getAllByText('Dan')[0].closest('tr')!;
    expect(row.querySelectorAll('td')[gamesCol].textContent?.trim()).toBe('1');
  });
});

describe('the standings title on a phone', () => {
  it('names the league and the season on separate lines, not as one sentence', () => {
    league = { league: { id: 'L1', name: 'Fish & Chips League' }, leaguePlayers: players, isLoading: false };
    seasons = seasonsFor('summer');
    render(<RealTimeLeagueTable tournament={tournament} />);
    const title = screen.getByTestId('standings-title');
    expect(title.textContent).toContain('Fish & Chips League · Standings');
    expect(screen.getByRole('heading', { name: 'summer' })).toBeTruthy();
    expect(title.textContent).not.toMatch(/Standings - /);
    expect(screen.getByText('1 player')).toBeTruthy();
  });
});

describe('Profit counts everything a player paid', () => {
  it('a rebuy with its own rake and bounty is charged in full', async () => {
    const { entryPricesOf } = await import('@/lib/resultStats');
    gamePrices = { g1: entryPricesOf({
      buyIn: 10, rakeType: 'fixed', rakeAmount: 2, enableBounties: true, bountyAmount: 3,
      rebuyRake: true, rebuyBounty: true,
    } as any) };
    settings.settings.statsToDisplay = { profit: true } as any;
    league = { league: { id: 'L1', name: 'Test League' }, isLoading: false, leaguePlayers: [
      { id: 'd', name: 'Dave', tournamentResults: [{
        id: 'r', tournamentId: 'g1', seasonId: 'summer', position: 7, totalPlayers: 9, points: 3,
        buyIn: 10, rebuys: 1, rebuyAmount: 10, prizeMoney: 0, date: '2026-10-29T20:00:00Z',
      }] },
    ] };
    seasons = seasonsFor('summer');
    render(<RealTimeLeagueTable tournament={tournament} />);
    expect(screen.getAllByText(/-£30/).length).toBeGreaterThan(0);
    gamePrices = {};
    settings.settings.statsToDisplay = {} as any;
  });
});

describe('Rename is offered on the director console only', () => {
  const withDave = () => {
    league = { league: { id: 'L1', name: 'Test League' }, isLoading: false, renameLeaguePlayer: async () => {},
      leaguePlayers: [{ id: 'd', name: 'Dave', tournamentResults: results('summer', 1) }] };
    seasons = seasonsFor('summer');
  };
  const openDave = () => fireEvent.click(screen.getByTitle("See Dave's season game by game"));

  it('on a console that holds control', () => {
    withDave();
    render(<RealTimeLeagueTable tournament={tournament} allowRename />);
    openDave();
    expect(screen.getByLabelText('Rename Dave')).toBeTruthy();
  });

  it('not on a read-only console', () => {
    withDave();
    render(<RealTimeLeagueTable tournament={tournament} />);
    openDave();
    expect(screen.queryByLabelText('Rename Dave')).toBeNull();
  });

  it("not on a player's phone, whatever is passed", () => {
    withDave();
    render(<RealTimeLeagueTable tournament={tournament} isParticipantView allowRename />);
    openDave();
    expect(screen.queryByLabelText('Rename Dave')).toBeNull();
  });
});
