import { describe, it, expect } from 'vitest';
import { seasonGameSlots, leagueResultsForGame, resultTime } from './seasonGames';

const r = (tournamentId: string, date: string | null, extra: Record<string, unknown> = {}) =>
  ({ seasonId: 'spring', tournamentId, date, ...extra });

const players = [
  { id: 'a', name: 'Amy', tournamentResults: [r('g2', '2026-10-08T20:00:00Z', { position: 1, points: 30 }), r('g1', '2026-10-01T20:00:00Z', { position: 2 })] },
  { id: 'b', name: 'Bob', tournamentResults: [r('g2', '2026-10-08T21:00:00Z', { position: 2, knockouts: 1 }), r('gx', null, { position: 1 })] },
  { id: 'c', name: 'Cat', tournamentResults: [{ seasonId: 'autumn', tournamentId: 'other', date: '2026-09-01' }] },
];

const shape = (slots: ReturnType<typeof seasonGameSlots>) => slots.map(s => `${s.number}:${s.gameId ?? '-'}:${s.state}${s.beyond ? '!' : ''}`);

describe('seasonGameSlots', () => {
  it('orders played games by when they were played, undated last, then pads the schedule', () => {
    expect(shape(seasonGameSlots({ seasonId: 'spring', numberOfGames: 5, leaguePlayers: players })))
      .toEqual(['1:g1:played', '2:g2:played', '3:gx:played', '4:-:future', '5:-:future']);
  });

  it('marks tonight\'s game where it is, or as the next slot before its first result', () => {
    expect(shape(seasonGameSlots({ seasonId: 'spring', numberOfGames: 5, leaguePlayers: players, currentGameId: 'g2' })))
      .toEqual(['1:g1:played', '2:g2:current', '3:gx:played', '4:-:future', '5:-:future']);
    expect(shape(seasonGameSlots({ seasonId: 'spring', numberOfGames: 5, leaguePlayers: players, currentGameId: 'new' })))
      .toEqual(['1:g1:played', '2:g2:played', '3:gx:played', '4:new:current', '5:-:future']);
  });

  it('shows games past the schedule, flagged', () => {
    expect(shape(seasonGameSlots({ seasonId: 'spring', numberOfGames: 2, leaguePlayers: players, currentGameId: 'new' })))
      .toEqual(['1:g1:played', '2:g2:played', '3:gx:played!', '4:new:current!']);
  });

  it('a season with no game count shows only what was played', () => {
    expect(shape(seasonGameSlots({ seasonId: 'spring', leaguePlayers: players }))).toEqual(['1:g1:played', '2:g2:played', '3:gx:played']);
  });

  it('other seasons and fake ids give nothing', () => {
    expect(seasonGameSlots({ seasonId: 'autumn', numberOfGames: 1, leaguePlayers: players }).map(s => s.gameId)).toEqual(['other']);
    expect(seasonGameSlots({ seasonId: 'default-season', numberOfGames: 4, leaguePlayers: players })).toEqual([]);
    expect(seasonGameSlots({ seasonId: null, numberOfGames: 4, leaguePlayers: players })).toEqual([]);
  });

  it('numeric season ids match string ones', () => {
    const p = [{ name: 'A', tournamentResults: [{ seasonId: 7, tournamentId: 'g', date: '2026-01-01' }] }];
    expect(seasonGameSlots({ seasonId: '7', leaguePlayers: p }).map(s => s.gameId)).toEqual(['g']);
  });
});

describe('resultTime', () => {
  it('reads every stored shape of a date', () => {
    expect(resultTime({ tournamentDate: { seconds: 10 } })).toBe(10000);
    expect(resultTime({ tournamentDate: 5 })).toBe(5);
    expect(resultTime({ date: '1970-01-01T00:00:01Z' })).toBe(1000);
    expect(resultTime({ tournamentDate: { toDate: () => new Date(2000) } })).toBe(2000);
    expect(resultTime({ date: 'nonsense' })).toBeNull();
  });
});

describe('leagueResultsForGame', () => {
  it('lists one game best place first', () => {
    expect(leagueResultsForGame(players, 'g2').map(x => `${x.position}:${x.name}:${x.knockouts}`)).toEqual(['1:Amy:0', '2:Bob:1']);
  });
});

import { countGamesPlayed, gameKeyOf } from './seasonProgress';
import { barSeasonFor } from './seasonGames';

/**
 * Reported from a test account: the season bar and the table's game counts
 * could not be made to agree. Results recorded before `tournamentId` existed
 * were each counted as a game of their own by `countGamesPlayed`, and skipped
 * entirely by the bar. One key now, `gameKeyOf`: the game id, else the NIGHT.
 */
describe('one game key for every count', () => {
  const legacy = (name: string, date: string) => ({ seasonId: 's', id: `${name}-${date}`, date });
  const legacyPlayers = [
    { id: 'a', name: 'Amy', tournamentResults: [legacy('a', '2026-03-04T20:00:00'), legacy('a', '2026-03-11T21:00:00')] },
    { id: 'b', name: 'Bob', tournamentResults: [legacy('b', '2026-03-04T22:30:00'), legacy('b', '2026-03-12T00:40:00')] },
    { id: 'c', name: 'Cat', tournamentResults: [legacy('c', '2026-03-04T23:10:00'), { seasonId: 's', tournamentId: 'g3', date: '2026-03-18T20:00:00' }] },
  ];

  it('legacy results group by night — a game past midnight stays one game', () => {
    expect(countGamesPlayed('s', legacyPlayers)).toBe(3);
    const slots = seasonGameSlots({ seasonId: 's', numberOfGames: 6, leaguePlayers: legacyPlayers });
    expect(slots.filter(x => x.state === 'played')).toHaveLength(3);
  });

  it('the bar and the season count agree', () => {
    const played = seasonGameSlots({ seasonId: 's', leaguePlayers: legacyPlayers }).length;
    expect(played).toBe(countGamesPlayed('s', legacyPlayers));
  });

  it('a legacy night opens its own rows', () => {
    const night = gameKeyOf(legacy('a', '2026-03-04T20:00:00'))!;
    expect(leagueResultsForGame(legacyPlayers, night).map(r => r.name)).toEqual(['Amy', 'Bob', 'Cat']);
  });

  it('prefers the game id, and falls back to the result id only with no date', () => {
    expect(gameKeyOf({ tournamentId: 'g1', date: '2026-03-04T20:00:00' })).toBe('g1');
    expect(gameKeyOf({ id: 'r9' })).toBe('result:r9');
    expect(gameKeyOf({})).toBeNull();
  });
});

describe('barSeasonFor', () => {
  const current = { id: 'summer' };
  const seasons = [{ id: 'spring' }, current];

  it('follows the league\'s current season, not the open game\'s', () => {
    const r = barSeasonFor({ viewedSeasonId: null, currentSeason: current, seasons, gameSeasonId: 'spring', gameId: 'g9' });
    expect(r.season).toBe(current);
    expect(r.currentGameId).toBeNull();
  });

  it('follows a past season picked in Viewing', () => {
    const r = barSeasonFor({ viewedSeasonId: 'spring', currentSeason: current, seasons, gameSeasonId: 'spring', gameId: 'g9' });
    expect(r.season).toEqual({ id: 'spring' });
    expect(r.currentGameId).toBe('g9');
  });

  it('a viewed season that became current is just current', () => {
    const r = barSeasonFor({ viewedSeasonId: 'summer', currentSeason: current, seasons, gameSeasonId: 'summer', gameId: 'g9' });
    expect(r.viewedPast).toBeNull();
    expect(r.currentGameId).toBe('g9');
  });
});
