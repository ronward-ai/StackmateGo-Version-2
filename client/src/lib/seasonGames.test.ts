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
