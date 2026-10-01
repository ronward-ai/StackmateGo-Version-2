import { describe, it, expect } from 'vitest';
import {
  RESULT_COLUMNS, DEFAULT_RESULT_COLUMNS, visibleResultColumns, offerableResultColumns,
  moveColumn, toggleColumn, type ResultColumnKey,
} from './resultColumns';
import { resultRowsFor, type ResultPlayerLike } from './resultRows';

const row = (over: Partial<ResultPlayerLike> = {}) => resultRowsFor(
  [
    { id: '1', name: 'Dan', isActive: false, position: 1, knockouts: 3, rebuys: 1, ...over },
    { id: '2', name: 'Amy', isActive: false, position: 2 },
  ],
  {
    prizeStructure: {
      buyIn: 20, rebuyAmount: 20, enableBounties: true, bountyAmount: 5,
      manualPayouts: [{ position: 1, percentage: 100 }],
    },
    isLeagueMode: true,
    calculatePoints: () => 42,
  },
)[0];

const cell = (key: ResultColumnKey, r = row(), sym = '£') =>
  RESULT_COLUMNS.find(c => c.key === key)!.value(r as any, sym);

describe('the cells', () => {
  it('counts the facts, and blanks a zero rather than printing it', () => {
    expect(cell('knockouts')).toBe('3');
    expect(cell('rebuys')).toBe('1');
    // Amy has none of either. A column of zeros is noise; a column of dashes
    // keeps the figures that ARE there legible.
    const amy = resultRowsFor(
      [{ id: '2', name: 'Amy', isActive: false, position: 2 }],
      { prizeStructure: { buyIn: 20 } },
    )[0];
    expect(RESULT_COLUMNS.find(c => c.key === 'knockouts')!.value(amy as any, '£')).toBe('–');
  });

  it('gives the winner their own bounty back, and the money that matches it', () => {
    expect(cell('bounties')).toBe('4');
    expect(cell('bountyMoney')).toBe('£20');
  });

  it('spells money with the game currency, not a hard-coded pound', () => {
    expect(cell('bountyMoney', row(), '$')).toBe('$20');
  });

  // Won is prize + bounty, added in ONE place so two columns cannot disagree —
  // the same reason the money chip was a single total.
  it('adds the prize and the bounty into one Won figure', () => {
    // Two buy-ins of 20 plus a priced rebuy of 20 = 60 pool, 100% to first.
    expect(cell('prize')).toBe('£60');
    expect(cell('won')).toBe('£80');
  });

  it('charges the rebuy into Invested and nets it off in Profit', () => {
    expect(cell('invested')).toBe('£40');
    expect(cell('profit')).toBe('+£40');
  });

  /**
   * AN ASYMMETRY THAT PRE-DATES THIS AND IS NOW VISIBLE, pinned rather than
   * quietly fixed.
   *
   * With no `rebuyAmount` stored, `lib/prizePool.ts` adds NOTHING to the pool
   * for that rebuy, while `lib/resultStats.ts`'s `investedIn` charges it at the
   * buy-in — its own comment says so, and calls it "much closer than charging
   * nothing" for a result written before prices were stored. Both are defensible
   * on their own; they simply answer different questions.
   *
   * It never showed while these were chips, because a row carried one money
   * figure. In a table, Invested and Prize sit in adjacent columns, so the same
   * rebuy is counted in one and not the other. Changing `prizePool` is a real
   * money change and does not belong in a display commit — this test exists so
   * the next person meets the fact rather than rediscovering it.
   */
  it('prices an unrecorded rebuy into Invested but not into the pool', () => {
    const r = resultRowsFor(
      [
        { id: '1', name: 'Dan', isActive: false, position: 1, rebuys: 1 },
        { id: '2', name: 'Amy', isActive: false, position: 2 },
      ],
      { prizeStructure: { buyIn: 20, manualPayouts: [{ position: 1, percentage: 100 }] } },
    )[0];
    const at = (k: ResultColumnKey) => RESULT_COLUMNS.find(c => c.key === k)!.value(r as any, '£');
    expect(at('invested')).toBe('£40');
    expect(at('prize')).toBe('£40');
  });

  it('signs a loss as well as a win, the way the standings do', () => {
    const loser = resultRowsFor(
      [
        { id: '1', name: 'Dan', isActive: false, position: 1 },
        { id: '2', name: 'Amy', isActive: false, position: 2, rebuys: 2 },
      ],
      { prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] } },
    )[1];
    expect(RESULT_COLUMNS.find(c => c.key === 'profit')!.value(loser as any, '£')).toBe('-£30');
  });

  it('names who did it, and leaves a dash where nobody did', () => {
    const rows = resultRowsFor(
      [
        { id: '1', name: 'Dan', isActive: true },
        { id: '2', name: 'Amy', isActive: false, position: 2, eliminatedBy: '1' },
      ],
      { prizeStructure: { buyIn: 10 } },
    );
    const col = RESULT_COLUMNS.find(c => c.key === 'eliminatedBy')!;
    expect(col.value(rows[1] as any, '£')).toBe('out to Dan'.replace('out to ', ''));
    expect(col.value(rows[0] as any, '£')).toBe('–');
  });

  it('shows a seat while the game runs and drops it once it is over', () => {
    const seat = { tableIndex: 1, seatIndex: 4 };
    const live = resultRowsFor(
      [
        { id: '1', name: 'Dan', isActive: true, seated: true, tableAssignment: seat },
        { id: '2', name: 'Amy', isActive: false, position: 2 },
      ],
      { prizeStructure: { buyIn: 10 } },
    )[0];
    const col = RESULT_COLUMNS.find(c => c.key === 'seat')!;
    expect(col.value(live as any, '£')).toBe('T2·S5');
    expect(col.value(row() as any, '£')).toBe('–');
  });

  it('sets every figure column in the mono face and right-aligns it', () => {
    for (const c of RESULT_COLUMNS) {
      if (c.key === 'eliminatedBy') {
        expect(c.align).toBe('left');
        expect(c.numeric).toBe(false);
      } else {
        expect(c.align).toBe('right');
        expect(c.numeric).toBe(true);
      }
    }
  });
});

describe('visibleResultColumns', () => {
  const all = { enableBounties: true, allowRebuys: true, allowReEntry: true, allowAddons: true };

  it('falls back to a short default rather than an empty table', () => {
    const cols = visibleResultColumns(null, { prizeStructure: all, isLeagueMode: true });
    expect(cols.map(c => c.key)).toEqual(DEFAULT_RESULT_COLUMNS);
    expect(visibleResultColumns([], { prizeStructure: all, isLeagueMode: true }))
      .toHaveLength(DEFAULT_RESULT_COLUMNS.length);
  });

  it('keeps the director order rather than the canonical one', () => {
    const cols = visibleResultColumns(['won', 'knockouts'], { prizeStructure: all });
    expect(cols.map(c => c.key)).toEqual(['won', 'knockouts']);
  });

  // THE MUTANT: drop the feature gate. A game with bounties switched off would
  // print two columns of dashes against every player — the shape the Busted
  // strip's own rule exists to prevent.
  it('does not draw a column for a feature this game has switched off', () => {
    const chosen: string[] = ['knockouts', 'bounties', 'bountyMoney', 'rebuys', 'reEntries', 'addons'];
    const cols = visibleResultColumns(chosen, { prizeStructure: { allowRebuys: true } });
    expect(cols.map(c => c.key)).toEqual(['knockouts', 'rebuys']);
  });

  it('draws them once the feature is on', () => {
    const cols = visibleResultColumns(['bounties', 'addons', 'reEntries'], { prizeStructure: all });
    expect(cols.map(c => c.key)).toEqual(['bounties', 'addons', 'reEntries']);
  });

  // Points is a league fact. A standalone night has no scheme to score with, and
  // a column of zeros would be a figure the app invented.
  it('keeps Points for a league game and drops it for a standalone one', () => {
    expect(visibleResultColumns(['points'], { isLeagueMode: true }).map(c => c.key)).toEqual(['points']);
    expect(visibleResultColumns(['points'], { isLeagueMode: false })).toEqual([]);
  });

  // THE MUTANT THAT TRAVELS. Settings sync to the account, ride into the
  // tournament document and reach a participant's phone, so a key written by a
  // newer build WILL arrive at an older one. An unresolvable column must be
  // absent, never a header with nothing under it.
  it('drops a key it does not recognise instead of rendering a blank column', () => {
    const cols = visibleResultColumns(['knockouts', 'finalChipStack', 'won'], { prizeStructure: all });
    expect(cols.map(c => c.key)).toEqual(['knockouts', 'won']);
  });

  it('cannot draw the same column twice', () => {
    const cols = visibleResultColumns(['won', 'won', 'knockouts'], { prizeStructure: all });
    expect(cols.map(c => c.key)).toEqual(['won', 'knockouts']);
  });
});

describe('the picker', () => {
  it('offers only what this game can show', () => {
    const keys = offerableResultColumns({ prizeStructure: { allowRebuys: true } }).map(c => c.key);
    expect(keys).toContain('rebuys');
    expect(keys).not.toContain('bounties');
    expect(keys).not.toContain('points');
  });

  it('moves a column one place and stops at the ends', () => {
    expect(moveColumn(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveColumn(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveColumn(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveColumn(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveColumn(['a', 'b'], 'zzz', 1)).toEqual(['a', 'b']);
  });

  it('switches a column off and back on', () => {
    expect(toggleColumn(['knockouts', 'won'], 'knockouts', false)).toEqual(['won']);
    expect(toggleColumn(['won'], 'won', true)).toEqual(['won']);
  });

  // THE MUTANT THAT UNDOES THE CONTROL BESIDE IT: re-sorting the whole array on
  // enable. A director who has arranged their columns and then ticks one more
  // box must not have the arrangement thrown away.
  it('keeps a hand-made order when a new column is switched on', () => {
    const arranged = ['won', 'knockouts'];
    const next = toggleColumn(arranged, 'invested', true);
    expect(next.indexOf('won')).toBeLessThan(next.indexOf('knockouts'));
    expect(next).toContain('invested');
  });

  it('puts a new column at its canonical place among the ones already shown', () => {
    // knockouts precedes won canonically, so enabling it lands it first.
    expect(toggleColumn(['won'], 'knockouts', true)).toEqual(['knockouts', 'won']);
    // profit comes after knockouts and before points.
    expect(toggleColumn(['knockouts', 'points'], 'profit', true))
      .toEqual(['knockouts', 'profit', 'points']);
  });
});
