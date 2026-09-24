import { describe, it, expect } from 'vitest';
import { cashIn, hitsIn, seasonGames, seasonSummary, type SeasonGame } from './playerSeason';

const game = (over: Partial<SeasonGame> = {}): SeasonGame => ({
  position: 4, totalPlayers: 10, points: 20, playersEliminatedCount: 1,
  cashWon: 0, buyIn: 10, date: '2026-09-01T20:00:00Z', ...over,
});

describe('hitsIn', () => {
  it('reads either name knockouts are stored under', () => {
    // The read whitelist renames knockouts to playersEliminatedCount, so both
    // shapes are in real documents.
    expect(hitsIn({ playersEliminatedCount: 3 })).toBe(3);
    expect(hitsIn({ knockouts: 2 })).toBe(2);
    expect(hitsIn({})).toBe(0);
  });

  it('prefers the whitelisted name when a document carries both', () => {
    expect(hitsIn({ playersEliminatedCount: 3, knockouts: 99 })).toBe(3);
  });
});

describe('cashIn', () => {
  it('reads either name prize money is stored under', () => {
    expect(cashIn({ cashWon: 50 })).toBe(50);
    expect(cashIn({ prizeMoney: 40 })).toBe(40);
    expect(cashIn({})).toBe(0);
  });
});

describe('seasonGames', () => {
  it('puts the most recent game first', () => {
    // The question is nearly always about a recent night.
    const rows = seasonGames([
      game({ id: 'old', date: '2026-08-01T20:00:00Z' }),
      game({ id: 'new', date: '2026-09-10T20:00:00Z' }),
      game({ id: 'mid', date: '2026-09-01T20:00:00Z' }),
    ]);
    expect(rows.map(r => r.id)).toEqual(['new', 'mid', 'old']);
  });

  it('keeps a game with no usable date rather than dropping it', () => {
    // Dropping it would make the list quietly disagree with the totals.
    const rows = seasonGames([game({ id: 'dated' }), game({ id: 'undated', date: null })]);
    expect(rows.map(r => r.id)).toEqual(['dated', 'undated']);
    expect(rows).toHaveLength(2);
  });

  it('counts a bounty as cash the player took home', () => {
    const [row] = seasonGames([game({ cashWon: 30, bountyWinnings: 15 })]);
    expect(row.cash).toBe(45);
  });

  it('nets a game off against what it cost to play it', () => {
    const [row] = seasonGames([game({ buyIn: 10, rebuys: 1, rebuyAmount: 10, cashWon: 25 })]);
    expect(row.invested).toBe(20);
    expect(row.net).toBe(5);
  });

  it('is empty for a player who has not played', () => {
    expect(seasonGames([])).toEqual([]);
    expect(seasonGames(null)).toEqual([]);
    expect(seasonGames(undefined)).toEqual([]);
  });
});

describe('seasonSummary', () => {
  it('adds the season up', () => {
    const summary = seasonSummary([
      game({ position: 1, points: 40, playersEliminatedCount: 3, cashWon: 100, buyIn: 10 }),
      game({ position: 5, points: 12, playersEliminatedCount: 0, cashWon: 0, buyIn: 10 }),
    ]);
    expect(summary.games).toBe(2);
    expect(summary.points).toBe(52);
    expect(summary.hits).toBe(3);
    expect(summary.cash).toBe(100);
    expect(summary.invested).toBe(20);
    expect(summary.net).toBe(80);
    expect(summary.wins).toBe(1);
    expect(summary.bestFinish).toBe(1);
    expect(summary.averagePosition).toBe(3);
  });

  it('has no average or best finish for a player who has not played', () => {
    // Null, not 0 — "average position 0" would be a lie on a fresh player.
    const summary = seasonSummary([]);
    expect(summary.averagePosition).toBeNull();
    expect(summary.bestFinish).toBeNull();
    expect(summary.games).toBe(0);
  });

  it('ignores an unplaced result when averaging, rather than counting it as 0', () => {
    const summary = seasonSummary([game({ position: 2 }), game({ position: undefined })]);
    expect(summary.averagePosition).toBe(2);
    expect(summary.games).toBe(2);
  });

  it('agrees with the rows it is summarising', () => {
    // The totals and the list must not drift — that is the whole reason this
    // lives in one module.
    const games = [
      game({ points: 10, playersEliminatedCount: 1, cashWon: 5, buyIn: 10 }),
      game({ points: 30, playersEliminatedCount: 2, cashWon: 50, buyIn: 10, rebuys: 1, rebuyAmount: 10 }),
    ];
    const rows = seasonGames(games);
    const summary = seasonSummary(games);
    expect(summary.points).toBe(rows.reduce((s, r) => s + r.points, 0));
    expect(summary.hits).toBe(rows.reduce((s, r) => s + r.hits, 0));
    expect(summary.cash).toBe(rows.reduce((s, r) => s + r.cash, 0));
    expect(summary.invested).toBe(rows.reduce((s, r) => s + r.invested, 0));
  });
});
