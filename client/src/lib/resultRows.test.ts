import { describe, it, expect } from 'vitest';
import {
  rankLabel, rankTone, sortForResults, resultRowsFor, type ResultPlayerLike,
} from './resultRows';

/**
 * These tests exist for three bugs that four passing screens did not notice, so
 * each has a comment naming the mutant it catches. Every fixture here uses a
 * position past twentieth somewhere, because EVERY fixture in the codebase used
 * 2 through 9 and that is precisely why "21th" survived on screen.
 */

const player = (over: Partial<ResultPlayerLike> & { id: string; name: string }): ResultPlayerLike => ({
  isActive: false,
  ...over,
});

describe('rankLabel', () => {
  it('names the top three the way anybody would', () => {
    expect(rankLabel(1)).toBe('1st');
    expect(rankLabel(2)).toBe('2nd');
    expect(rankLabel(3)).toBe('3rd');
  });

  // THE MUTANT: `pos > 3 ? `${pos}th` : …`, which is what the director's own row
  // actually shipped. A 21-player home game is completely ordinary, so this was
  // on screen every week while the exported picture of the same game said 21st.
  it('does not say 21th', () => {
    expect(rankLabel(21)).toBe('21st');
    expect(rankLabel(22)).toBe('22nd');
    expect(rankLabel(23)).toBe('23rd');
    expect(rankLabel(24)).toBe('24th');
  });

  // The other half of the same trap: 11-13 really are "th", and an implementation
  // that fixes 21 by reading n % 10 alone breaks these.
  it('keeps the teens on th', () => {
    expect(rankLabel(11)).toBe('11th');
    expect(rankLabel(12)).toBe('12th');
    expect(rankLabel(13)).toBe('13th');
  });

  it('calls somebody still in Active rather than 0th', () => {
    expect(rankLabel(0)).toBe('Active');
    expect(rankLabel(null)).toBe('Active');
    expect(rankLabel(undefined)).toBe('Active');
  });
});

describe('rankTone', () => {
  it('gives the medals to the top three and nobody else', () => {
    expect(rankTone(1)).toBe('gold');
    expect(rankTone(2)).toBe('silver');
    expect(rankTone(3)).toBe('bronze');
    expect(rankTone(4)).toBe('out');
    expect(rankTone(21)).toBe('out');
  });

  // THE MUTANT THAT SHIPPED, in the export's `rankFg = pos <= 2 ? '#000' : '#fff'`:
  // an active player's position is 0, which IS <= 2, so the picture drew black
  // text on the green badge while the screen drew white. A tone that is a NAME
  // cannot be reached by arithmetic over the position, which is the whole reason
  // this returns one.
  it('does not let position 0 fall in with the medals', () => {
    expect(rankTone(0)).toBe('active');
    expect(rankTone(null)).toBe('active');
    expect(rankTone(undefined)).toBe('active');
  });
});

describe('sortForResults', () => {
  it('puts those still in first, by name, then the finishers by place', () => {
    const rows = sortForResults([
      player({ id: '3', name: 'Cass', position: 2 }),
      player({ id: '1', name: 'Zoe', isActive: true }),
      player({ id: '4', name: 'Dan', position: 1 }),
      player({ id: '2', name: 'Amy', isActive: true }),
    ]);
    expect(rows.map(p => p.name)).toEqual(['Amy', 'Zoe', 'Dan', 'Cass']);
  });

  // An absent flag means ACTIVE everywhere in this app. The row this replaced
  // sorted off `filter(p => p.isActive)` — truthy — so a player restored from a
  // Firestore round-trip with no flag was treated as eliminated.
  it('treats an absent flag as still in, not as out', () => {
    const rows = sortForResults([
      player({ id: '1', name: 'Dan', position: 1 }),
      { id: '2', name: 'Amy' } as ResultPlayerLike,
    ]);
    expect(rows.map(p => p.name)).toEqual(['Amy', 'Dan']);
  });

  it('parks a finisher with no number last rather than ahead of first', () => {
    const rows = sortForResults([
      player({ id: '1', name: 'Nobody' }),
      player({ id: '2', name: 'Winner', position: 1 }),
    ]);
    expect(rows.map(p => p.name)).toEqual(['Winner', 'Nobody']);
  });
});

describe('resultRowsFor', () => {
  const finished = [
    player({ id: '1', name: 'Dan', position: 1, knockouts: 3 }),
    player({ id: '2', name: 'Amy', position: 2 }),
    player({ id: '3', name: 'Cass', position: 21 }),
  ];

  it('labels every row through the ordinal, including past twentieth', () => {
    const rows = resultRowsFor(finished);
    expect(rows.map(r => r.rankLabel)).toEqual(['1st', '2nd', '21st']);
    expect(rows.map(r => r.rankTone)).toEqual(['gold', 'silver', 'out']);
  });

  it('pays the places out of the prize pool once', () => {
    const rows = resultRowsFor(finished, {
      prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] },
    });
    expect(rows[0].stats.prize).toBe(30);
    expect(rows[0].stats.won).toBe(30);
    expect(rows[1].stats.prize).toBe(0);
  });

  // A payout row sitting at 0% is not a payout. The export dropped this guard
  // and the screen kept it, so one of the two could show a £0 money chip.
  it('does not pay out a zero-percent place', () => {
    const rows = resultRowsFor(finished, {
      prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 0 }] },
    });
    expect(rows[0].stats.prize).toBe(0);
  });

  it('gives the winner their own bounty back, so the count matches the money', () => {
    const rows = resultRowsFor(finished, {
      prizeStructure: { buyIn: 10, enableBounties: true, bountyAmount: 5 },
    });
    // Three knockouts plus their own bounty back.
    expect(rows[0].stats.bountiesCollected).toBe(4);
    expect(rows[0].stats.bountyMoney).toBe(20);
    expect(rows[0].stats.won).toBe(20);
  });

  // THE DIVERGENCE NOBODY COULD SEE. The screen passed `buyInOf(...)`, which
  // falls back to 10 for a game that never recorded a price; the export passed a
  // raw `buyIn || 0`. So a formula weighted on what a player spent scored one
  // figure on the console and a different one in the picture of the same game.
  it('scores points on the full six, with the buy-in fallback the standings use', () => {
    const seen: number[][] = [];
    resultRowsFor(finished, {
      isLeagueMode: true,
      prizeStructure: {},
      calculatePoints: (pos, total, kos, buyIn, cost, pool) => {
        seen.push([pos, total, kos ?? 0, buyIn ?? 0, cost ?? 0, pool ?? 0]);
        return 10;
      },
    });
    // buyIn falls back to 10, invested is that one buy-in, pool is 10 x 3.
    expect(seen[0]).toEqual([1, 3, 3, 10, 10, 30]);
    expect(seen).toHaveLength(3);
  });

  it('charges rebuys into what a player invested', () => {
    const seen: number[] = [];
    resultRowsFor([player({ id: '1', name: 'Dan', position: 1, rebuys: 2 })], {
      isLeagueMode: true,
      prizeStructure: { buyIn: 20 },
      calculatePoints: (_p, _t, _k, _b, cost) => { seen.push(cost ?? 0); return 1; },
    });
    expect(seen[0]).toBe(60);
  });

  it('scores nothing for a standalone game, or with no scorer to ask', () => {
    const scored = resultRowsFor(finished, { isLeagueMode: false, calculatePoints: () => 99 });
    expect(scored[0].stats.points).toBe(0);
    const unscored = resultRowsFor(finished, { isLeagueMode: true });
    expect(unscored[0].stats.points).toBe(0);
  });

  // A seat stops being interesting once the game is over, and THAT is the
  // only thing the finished flag decides here — but it used to be spelled twice,
  // differently, so one row could carry a seat in the picture and not on screen.
  it('drops the seat once the game is over, and keeps it while it runs', () => {
    const seat = { tableIndex: 0, seatIndex: 2 };
    const over = resultRowsFor([
      player({ id: '1', name: 'Dan', position: 1, seated: true, tableAssignment: seat }),
      player({ id: '2', name: 'Amy', position: 2, seated: true, tableAssignment: seat }),
    ]);
    expect(over[0].stats.seat).toBeNull();

    const running = resultRowsFor([
      player({ id: '1', name: 'Dan', isActive: true, seated: true, tableAssignment: seat }),
      player({ id: '2', name: 'Amy', position: 2 }),
    ]);
    expect(running[0].stats.seat).toEqual(seat);
  });

  it('names who knocked a player out, and only for the ones who are out', () => {
    const rows = resultRowsFor([
      player({ id: '1', name: 'Dan', isActive: true }),
      player({ id: '2', name: 'Amy', position: 4, eliminatedBy: '1' }),
    ]);
    expect(rows[0].stats.eliminatedByName).toBeNull();
    expect(rows[1].stats.eliminatedByName).toBe('Dan');
  });

  it('survives an empty or absent roster', () => {
    expect(resultRowsFor([])).toEqual([]);
    expect(resultRowsFor(null)).toEqual([]);
    expect(resultRowsFor(undefined)).toEqual([]);
  });
});
