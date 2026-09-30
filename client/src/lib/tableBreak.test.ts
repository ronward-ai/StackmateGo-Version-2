import { describe, it, expect } from 'vitest';
import {
  tableOccupancy, tableToBreak, alreadyAtTables, consolidationDue,
  reindexAfterBreak, breakTable, type BreakablePlayer,
} from './tableBreak';

const seat = (id: string, tableIndex: number, seatIndex: number): BreakablePlayer =>
  ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

const busted = (id: string): BreakablePlayer => ({ id, isActive: false, seated: false });

/** n players across `per` tables, filling each table in turn. */
const across = (per: number[]): BreakablePlayer[] =>
  per.flatMap((count, t) => Array.from({ length: count }, (_, s) => seat(`t${t}s${s}`, t, s)));

const cfg = { numberOfTables: 3, seatsPerTable: 8 };

describe('tableOccupancy', () => {
  it('counts the active, seated players at each table', () => {
    expect(tableOccupancy(across([5, 6, 5]), 3)).toEqual([5, 6, 5]);
  });

  it('gives an empty table a zero rather than leaving a hole', () => {
    expect(tableOccupancy(across([8, 0, 3]), 3)).toEqual([8, 0, 3]);
  });

  it('does not count busted or unseated players, who hold no chair', () => {
    const players = [...across([2, 1, 0]), busted('gone'), { id: 'waiting', isActive: true }];
    expect(tableOccupancy(players, 3)).toEqual([2, 1, 0]);
  });

  // Typing the Tables field down by hand really does leave players on an index
  // that no longer exists. Counting them would make a table that IS in play look
  // occupied, and could send the break at the wrong one.
  it('ignores a player orphaned on a table that no longer exists', () => {
    expect(tableOccupancy([...across([2, 1]), seat('orphan', 2, 0)], 2)).toEqual([2, 1]);
  });

  it('survives an empty or absent roster', () => {
    expect(tableOccupancy([], 2)).toEqual([0, 0]);
    expect(tableOccupancy(null, 2)).toEqual([0, 0]);
  });
});

describe('tableToBreak', () => {
  it('breaks the emptiest table, so the fewest people move', () => {
    expect(tableToBreak(across([7, 3, 6]), 3)).toBe(1);
  });

  // The mutant to catch: `<` instead of `<=` picks the LOWEST index on a tie,
  // which is table 1 — the one a director is least likely to want broken.
  it('gives a tie to the highest-numbered table', () => {
    expect(tableToBreak(across([4, 4, 4]), 3)).toBe(2);
    expect(tableToBreak(across([6, 4, 4]), 3)).toBe(2);
  });

  it('takes an empty table first, which moves nobody at all', () => {
    expect(tableToBreak(across([6, 0, 5]), 3)).toBe(1);
  });

  it('has nothing to break when there is only one table', () => {
    expect(tableToBreak(across([5]), 1)).toBeNull();
  });
});

describe('alreadyAtTables', () => {
  it('is true when the field already sits on that many', () => {
    expect(alreadyAtTables(across([5, 4]), 2)).toBe(true);
    expect(alreadyAtTables(across([5]), 2)).toBe(true);
  });

  it('is false while the field is spread wider', () => {
    expect(alreadyAtTables(across([3, 3, 3]), 2)).toBe(false);
  });

  it('ignores where BUSTED players used to sit', () => {
    const players = [...across([4, 3]), { ...busted('old'), seated: true, tableAssignment: { tableIndex: 2, seatIndex: 0 } }];
    expect(alreadyAtTables(players, 2)).toBe(true);
  });

  // The conservatism lib/finalTable.ts's alreadyAtOneTable is built on: a
  // director who is not using the seating chart must still be asked.
  it('is false when an active player has no chair', () => {
    expect(alreadyAtTables([...across([4, 3]), { id: 'x', isActive: true }], 2)).toBe(false);
  });

  it('is false with nobody left, rather than vacuously true', () => {
    expect(alreadyAtTables([busted('a')], 2)).toBe(false);
  });
});

describe('consolidationDue', () => {
  // THE REPORTED GAME: three tables of eight, sixteen left.
  it('asks for two tables once sixteen are left on three-by-eight', () => {
    const players = [...across([6, 5, 5]), busted('out')];
    expect(consolidationDue(players, cfg)).toBe(2);
  });

  // The final table is a DIFFERENT predicate's question — shouldPromptForFinalTable
  // carries the stored isFinalTable flag and the `<=` a real bug turned on. Two
  // predicates answering at overlapping sizes is how one bust-out gets two dialogs.
  it('says nothing about the final table, which is asked for elsewhere', () => {
    const players = [...across([4, 4]), busted('out')];
    expect(consolidationDue(players, { numberOfTables: 3, seatsPerTable: 8 })).toBeNull();
  });

  it('stays quiet while the field still needs every table', () => {
    const players = [...across([7, 7, 7]), busted('out')];
    expect(consolidationDue(players, cfg)).toBeNull();
  });

  // Same guard shouldPromptForFinalTable uses, and for the same reason: a game
  // that simply starts with more tables than it needs must not be asked to break
  // one before a hand is dealt.
  // The `>=` that looks like it could be `>`. With `needed === tables` the
  // mutant returns the count the game ALREADY has — "break down to three
  // tables" on three tables, forever. The fixture has to keep an active player
  // unseated, or the already-consolidated guard catches it first and the mutant
  // survives.
  it('never offers to break down to the count the game already has', () => {
    const players = [...across([7, 7, 7]), { id: 'waiting', isActive: true }, busted('out')];
    expect(consolidationDue(players, cfg)).toBeNull();
  });

  it('never fires on the opening seating, before anyone has busted', () => {
    expect(consolidationDue(across([6, 5, 5]), cfg)).toBeNull();
  });

  it('says nothing when nobody has to move', () => {
    // Sixteen already sitting on two of the three tables.
    const players = [...across([8, 8, 0]), busted('out')];
    expect(consolidationDue(players, cfg)).toBeNull();
  });

  it('keeps asking on every bust-out while the break is still due', () => {
    for (const left of [16, 15, 14, 13, 12, 11, 10, 9]) {
      const a = Math.ceil(left / 3), b = Math.ceil((left - a) / 2);
      const players = [...across([a, b, left - a - b]), busted('out')];
      expect(consolidationDue(players, cfg)).toBe(2);
    }
  });

  it('is nothing to ask at the end of a game', () => {
    expect(consolidationDue([busted('a'), busted('b')], cfg)).toBeNull();
  });
});

describe('reindexAfterBreak', () => {
  it('drops the broken table entry so the rest move with their tables', () => {
    expect(reindexAfterBreak(['Table 1', 'The Kitchen', 'Table 3'], 1)).toEqual(['Table 1', 'Table 3']);
  });

  it('survives nothing at all', () => {
    expect(reindexAfterBreak(undefined, 0)).toEqual([]);
  });
});

describe('breakTable', () => {
  it('moves only the broken table, leaving everyone else in their chair', () => {
    const players = across([6, 5, 5]);
    const before = players.filter(p => p.tableAssignment!.tableIndex === 0);
    const { players: after, tables } = breakTable(players, { ...cfg, broken: 2 });

    expect(tables).toBe(2);
    for (const p of before) {
      const now = after.find(a => a.id === p.id)!;
      expect(now.tableAssignment).toEqual(p.tableAssignment);
    }
  });

  it('seats everyone it moves, and never beyond the table', () => {
    const { players: after } = breakTable(across([6, 5, 5]), { ...cfg, broken: 2 });
    expect(after.every(p => p.seated)).toBe(true);
    expect(after.every(p => p.tableAssignment!.seatIndex < 8)).toBe(true);
    expect(after.every(p => p.tableAssignment!.tableIndex < 2)).toBe(true);
  });

  it('never hands out the same chair twice', () => {
    const { players: after } = breakTable(across([6, 5, 5]), { ...cfg, broken: 1 });
    const keys = after.filter(p => p.seated).map(p => `${p.tableAssignment!.tableIndex}-${p.tableAssignment!.seatIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('spreads the movers rather than filling one table first', () => {
    const { players: after } = breakTable(across([4, 4, 6]), { ...cfg, broken: 2 });
    const counts = tableOccupancy(after, 2);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  // THE RENUMBER. settings.tables stores a COUNT and every render walks
  // 0..numberOfTables-1, so "tables 1 and 3" cannot be expressed — players left
  // on index 2 of a two-table game are drawn nowhere, with no KO button and out
  // of reach of Move mode. That is the ghost, by another route.
  it('renumbers the survivors when the broken table is in the middle', () => {
    const players = across([3, 3, 3]);
    const wasOnTableThree = players.filter(p => p.tableAssignment!.tableIndex === 2).map(p => p.id);
    const { players: after } = breakTable(players, { ...cfg, broken: 1 });

    expect(after.every(p => p.tableAssignment!.tableIndex < 2)).toBe(true);
    // Table 3's players kept their chairs and simply became table 2.
    for (const id of wasOnTableThree) {
      expect(after.find(p => p.id === id)!.tableAssignment).toEqual({ tableIndex: 1, seatIndex: players.find(p => p.id === id)!.tableAssignment!.seatIndex });
    }
  });

  it('names and felts move with their tables', () => {
    const { broken } = breakTable(across([3, 3, 3]), { ...cfg, broken: 1 });
    expect(reindexAfterBreak(['Table 1', 'The Kitchen', 'Table 3'], broken)).toEqual(['Table 1', 'Table 3']);
  });

  // Never a chair that does not exist — the rule the 17-player ghost established.
  it('leaves anyone it cannot place unseated rather than inventing a seat', () => {
    // Two tables of 2: table 1 full, table 0 full, break table 1 with nowhere to go.
    const tight = { numberOfTables: 2, seatsPerTable: 2 };
    const { players: after } = breakTable(across([2, 2]), { ...tight, broken: 1 });
    const unseated = after.filter(p => !p.seated);
    expect(unseated).toHaveLength(2);
    expect(unseated.every(p => p.tableAssignment === undefined)).toBe(true);
  });

  it('unseats a busted player holding a stale chair at the broken table', () => {
    const ghost = { ...busted('ghost'), seated: true, tableAssignment: { tableIndex: 2, seatIndex: 0 } };
    const { players: after } = breakTable([...across([3, 3]), ghost], { ...cfg, broken: 2 });
    const now = after.find(p => p.id === 'ghost')!;
    expect(now.seated).toBe(false);
    expect(now.tableAssignment).toBeUndefined();
  });

  it('breaking an empty table moves nobody', () => {
    const players = across([4, 0, 4]);
    const { players: after, tables } = breakTable(players, { ...cfg, broken: 1 });
    expect(tables).toBe(2);
    expect(tableOccupancy(after, 2)).toEqual([4, 4]);
  });
});
