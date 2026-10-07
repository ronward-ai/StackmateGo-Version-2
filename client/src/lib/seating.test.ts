import { describe, it, expect } from 'vitest';
import { seatToReclaim, seatablePlayers, allSeated, planSeating, freeSeatAt, assignSeats, occupiedChairs, tablesNeededFor, tableNamesFor } from './seating';
import type { Player } from '@/types';

const player = (over: Partial<Player> = {}): Player => ({
  id: 'p1',
  name: 'Dave',
  knockouts: 0,
  isActive: true,
  ...over,
} as Player);

const at = (tableIndex: number, seatIndex: number) => ({ tableIndex, seatIndex });

describe('seatToReclaim', () => {
  it('gives the seat back when nobody has taken it', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    expect(seatToReclaim(dave, [dave])).toEqual(at(0, 3));
  });

  it('refuses when an active player is sitting there', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const sam = player({ id: 'p2', name: 'Sam', seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, sam])).toBeNull();
  });

  it('does not count an ELIMINATED player as holding the seat', () => {
    // They may still carry a stale assignment; they are not at the table.
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const out = player({ id: 'p2', name: 'Sam', isActive: false, seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, out])).toEqual(at(0, 3));
  });

  it('does not count an unseated player as holding the seat', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 3), totalSeatedPlayers: 7 } });
    const waiting = player({ id: 'p2', name: 'Sam', seated: false, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, waiting])).toEqual(at(0, 3));
  });

  it('is not confused by the same seat number on another table', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(1, 3), totalSeatedPlayers: 7 } });
    const sam = player({ id: 'p2', name: 'Sam', seated: true, tableAssignment: at(0, 3) });
    expect(seatToReclaim(dave, [dave, sam])).toEqual(at(1, 3));
  });

  it('has nothing to give back without a recorded seat', () => {
    expect(seatToReclaim(player({ isActive: false }), [])).toBeNull();
  });

  it('handles seat zero, which is falsy', () => {
    const dave = player({ isActive: false, seatInfo: { ...at(0, 0), totalSeatedPlayers: 7 } });
    expect(seatToReclaim(dave, [dave])).toEqual(at(0, 0));
  });
});

describe('seatablePlayers', () => {
  it('refuses a chair to anyone who is out', () => {
    const players = [
      { id: 'a', name: 'Active' },
      { id: 'b', name: 'Busted', isActive: false },
      { id: 'c', name: 'Explicitly active', isActive: true },
    ] as any[];
    expect(seatablePlayers(players).map(p => p.id)).toEqual(['a', 'c']);
  });

  it('treats absent isActive as still in, the way the rest of the app does', () => {
    expect(seatablePlayers([{ id: 'a' }] as any[])).toHaveLength(1);
  });

  it('is empty rather than throwing when nobody is left', () => {
    expect(seatablePlayers([])).toEqual([]);
    expect(seatablePlayers([{ id: 'a', isActive: false }] as any[])).toEqual([]);
  });
});

describe('allSeated', () => {
  it('is true when every player still in has a chair', () => {
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'b', seated: true },
    ] as any[])).toBe(true);
  });

  it('is false while anyone still in is waiting for a chair', () => {
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'b', seated: false },
    ] as any[])).toBe(false);
    expect(allSeated([{ id: 'a', seated: true }, { id: 'b' }] as any[])).toBe(false);
  });

  it('ignores busted players, who hold no chair', () => {
    // Otherwise one knockout would keep the button saying "Seat" all night.
    expect(allSeated([
      { id: 'a', seated: true },
      { id: 'out', isActive: false, seated: false },
    ] as any[])).toBe(true);
  });

  it('is false for an empty field, where "Randomize" would mean nothing', () => {
    expect(allSeated([])).toBe(false);
    expect(allSeated([{ id: 'out', isActive: false }] as any[])).toBe(false);
  });
});

describe('planSeating', () => {
  it('puts everyone on ONE table when they fit on one', () => {
    // The final table. This is the case the dialog is opened for, and the one
    // its hard-coded arithmetic got wrong.
    expect(planSeating(8, { numberOfTables: 4, seatsPerTable: 8 })).toEqual({ perTable: [8], overflow: 0 });
    expect(planSeating(2, { numberOfTables: 3, seatsPerTable: 6 })).toEqual({ perTable: [2], overflow: 0 });
  });

  it('splits evenly when it divides', () => {
    expect(planSeating(12, { numberOfTables: 3, seatsPerTable: 6 })).toEqual({ perTable: [4, 4, 4], overflow: 0 });
  });

  it('gives the remainder to the first tables', () => {
    expect(planSeating(10, { numberOfTables: 3, seatsPerTable: 6 })).toEqual({ perTable: [4, 3, 3], overflow: 0 });
  });

  it('reports who will not fit', () => {
    // 2 tables of 6 seats 12; the other 8 have nowhere to go.
    expect(planSeating(20, { numberOfTables: 2, seatsPerTable: 6 })).toEqual({ perTable: [6, 6], overflow: 8 });
  });

  it('handles nobody, and nonsense configuration, without throwing', () => {
    expect(planSeating(0, { numberOfTables: 3, seatsPerTable: 6 })).toEqual({ perTable: [], overflow: 0 });
    expect(planSeating(4, { numberOfTables: 0, seatsPerTable: 0 })).toEqual({ perTable: [1], overflow: 3 });
  });
});

/**
 * `seatToReclaim` cannot answer "is this chair part of the game", only "is
 * anybody sitting in it" — and after a final-table collapse those differ. A
 * pre-collapse chair on table 2 reads as free PRECISELY because the collapse
 * emptied that table, which is how a rebought player ended up sitting alone
 * there while the game carried on at table 1.
 */
describe('freeSeatAt', () => {
  const at = (id: string, tableIndex: number, seatIndex: number) =>
    ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } }) as any;

  it('finds the lowest free seat at the table', () => {
    expect(freeSeatAt([at('a', 0, 0), at('b', 0, 1)], 0, 8)).toEqual({ tableIndex: 0, seatIndex: 2 });
  });

  it('fills a gap rather than always appending', () => {
    expect(freeSeatAt([at('a', 0, 0), at('b', 0, 2)], 0, 8)).toEqual({ tableIndex: 0, seatIndex: 1 });
  });

  /** Seat 0 is a real seat, and it is falsy. This shape gets that wrong. */
  it('offers seat zero when the table is empty', () => {
    expect(freeSeatAt([], 0, 8)).toEqual({ tableIndex: 0, seatIndex: 0 });
    expect(freeSeatAt([at('a', 1, 0)], 0, 8)).toEqual({ tableIndex: 0, seatIndex: 0 });
  });

  it('is null when the table is full, rather than inventing a chair', () => {
    const full = Array.from({ length: 4 }, (_, i) => at(`p${i}`, 0, i));
    expect(freeSeatAt(full, 0, 4)).toBeNull();
  });

  it('ignores players at other tables', () => {
    expect(freeSeatAt([at('a', 1, 0), at('b', 1, 1)], 0, 8)).toEqual({ tableIndex: 0, seatIndex: 0 });
  });

  it('does not let an ELIMINATED player hold a seat', () => {
    const out = [{ id: 'z', isActive: false, seated: true, tableAssignment: { tableIndex: 0, seatIndex: 0 } }] as any;
    expect(freeSeatAt(out, 0, 8)).toEqual({ tableIndex: 0, seatIndex: 0 });
  });
});

/**
 * THE REPORTED BUG: 17 players, 2 tables of 8, press Seat Players — 16 seated and
 * Table 1 reading `9/8 seated · -1 empty`.
 *
 * The seater used `planSeating`'s `perTable` and threw `overflow` away, then fell
 * back to `{ tableIndex: 0, seatIndex: i }` for anyone left over — FABRICATING
 * seat 16 on a table with eight chairs. The player was `seated: true`, drawn
 * nowhere, and could not be knocked out or moved.
 *
 * This lived inline in a component and could not be tested. That is why it moved.
 */
describe('assignSeats', () => {
  const cfg = { numberOfTables: 2, seatsPerTable: 8 };
  const none = new Set<string>();

  it('hands out only seats that EXIST — the reported game', () => {
    const plan = planSeating(17, cfg);
    const seats = assignSeats(17, none, plan, cfg);

    expect(seats).toHaveLength(16);
    // The assertion the bug would fail: no chair beyond the table.
    expect(seats.every(s => s.seatIndex < cfg.seatsPerTable)).toBe(true);
    expect(seats.every(s => s.tableIndex < cfg.numberOfTables)).toBe(true);
  });

  it('never returns the same chair twice', () => {
    const plan = planSeating(16, cfg);
    const seats = assignSeats(16, none, plan, cfg);
    const keys = new Set(seats.map(s => `${s.tableIndex}-${s.seatIndex}`));
    expect(keys.size).toBe(16);
  });

  it('seats everybody when they fit', () => {
    const plan = planSeating(12, cfg);
    expect(assignSeats(12, none, plan, cfg)).toHaveLength(12);
  });

  it('skips chairs held by players outside the selection', () => {
    const taken = new Set(['0-0', '0-1', '1-0']);
    const plan = planSeating(4, cfg);
    const seats = assignSeats(4, taken, plan, cfg);
    expect(seats.some(s => `${s.tableIndex}-${s.seatIndex}` === '0-0')).toBe(false);
    expect(seats.some(s => `${s.tableIndex}-${s.seatIndex}` === '1-0')).toBe(false);
    expect(seats.every(s => s.seatIndex < cfg.seatsPerTable)).toBe(true);
  });

  /** The one-table branch planSeating's own test protects. */
  it('keeps everyone on one table when they fit on one', () => {
    const plan = planSeating(6, cfg);
    const seats = assignSeats(6, none, plan, cfg);
    expect(seats.every(s => s.tableIndex === 0)).toBe(true);
  });

  it('spills to the next table when table one is occupied by others', () => {
    const taken = new Set(Array.from({ length: 8 }, (_, i) => `0-${i}`));
    const plan = planSeating(3, cfg);
    const seats = assignSeats(3, taken, plan, cfg);
    expect(seats).toHaveLength(3);
    expect(seats.every(s => s.tableIndex === 1)).toBe(true);
  });

  /**
   * The plan itself must not be trusted to bound the table.
   *
   * In the shipped code `plan.perTable[t]` happens to bound the inner loop, so a
   * mutant widening `s < seatsEach` is invisible to every case above. That is a
   * coincidence of how planSeating fills, not a guarantee — and the bug this
   * function exists to end WAS a caller trusting a count it had not checked. A
   * hostile plan asking for more than the table holds must still hand out only
   * chairs that exist.
   */
  it('never exceeds the table even when the plan asks for more', () => {
    const plan = { perTable: [20, 20], overflow: 0 };
    const seats = assignSeats(40, none, plan, cfg);
    expect(seats.every(s => s.seatIndex < cfg.seatsPerTable)).toBe(true);
    expect(seats).toHaveLength(16);
  });

  it('gives out nothing for nobody, and survives nonsense configuration', () => {
    expect(assignSeats(0, none, planSeating(0, cfg), cfg)).toEqual([]);
    const silly = { numberOfTables: 0, seatsPerTable: 0 };
    expect(assignSeats(4, none, planSeating(4, silly), silly).every(s => s.seatIndex < 1)).toBe(true);
  });
});

/** For the "Add a table" offer, so the director does no arithmetic. */
describe('tableNamesFor', () => {
  it('grows, numbering from where the existing names stop', () => {
    expect(tableNamesFor(['Table 1', 'The Kitchen'], 4)).toEqual(['Table 1', 'The Kitchen', 'Table 3', 'Table 4']);
  });

  it('trims without renaming what stays', () => {
    expect(tableNamesFor(['The Kitchen', 'Table 2', 'Table 3'], 1)).toEqual(['The Kitchen']);
  });

  it('builds from nothing, and never returns none', () => {
    expect(tableNamesFor(undefined, 3)).toEqual(['Table 1', 'Table 2', 'Table 3']);
    expect(tableNamesFor([], 0)).toEqual(['Table 1']);
  });
});

describe('tablesNeededFor', () => {
  it('works out the reported case', () => {
    expect(tablesNeededFor(17, 8)).toBe(3);
  });

  it('does not round up an exact fit', () => {
    expect(tablesNeededFor(16, 8)).toBe(2);
    expect(tablesNeededFor(8, 8)).toBe(1);
  });

  it('never offers fewer than one table, or more than the field accepts', () => {
    expect(tablesNeededFor(0, 8)).toBe(1);
    expect(tablesNeededFor(1, 8)).toBe(1);
    // The Tables input caps at 20; offering a number it would refuse is worse
    // than offering none.
    expect(tablesNeededFor(500, 2)).toBe(20);
  });

  it('survives nonsense seats per table', () => {
    expect(tablesNeededFor(10, 0)).toBe(10);
  });
});

// October audit, M15: a remembered chair on a table no longer in play.
describe('seatToReclaim against the current tables', () => {
  const busted = { id: 'x', name: 'X', isActive: false, seatInfo: { tableIndex: 2, seatIndex: 3 } } as Player;

  it('refuses a chair on a table that has been broken away', () => {
    expect(seatToReclaim(busted, [busted], { numberOfTables: 2, seatsPerTable: 8 })).toBeNull();
  });

  it('refuses a chair past the end of a table', () => {
    const p = { ...busted, seatInfo: { tableIndex: 0, seatIndex: 8 } } as Player;
    expect(seatToReclaim(p, [p], { numberOfTables: 2, seatsPerTable: 8 })).toBeNull();
  });

  it('still returns a real, free chair', () => {
    expect(seatToReclaim(busted, [busted], { numberOfTables: 3, seatsPerTable: 8 }))
      .toEqual({ tableIndex: 2, seatIndex: 3 });
  });
});

describe('Seat Selected around chairs already held (Oct Low)', () => {
  const cfg = { numberOfTables: 3, seatsPerTable: 8 };
  // Table 1 full with eight players outside the selection.
  const table1Full = new Set(Array.from({ length: 8 }, (_, s) => `0-${s}`));

  it('plans against the chairs that are free, not every chair in the room', () => {
    expect(planSeating(10, cfg, table1Full).overflow).toBe(0);
    expect(planSeating(20, cfg, table1Full).overflow).toBe(4);
  });

  it('seats all ten when ten chairs are free, none of them taken', () => {
    const plan = planSeating(10, cfg, table1Full);
    const seats = assignSeats(10, table1Full, plan, cfg);
    expect(seats).toHaveLength(10);
    const keys = seats.map(x => `${x.tableIndex}-${x.seatIndex}`);
    expect(new Set(keys).size).toBe(10);
    expect(keys.some(k => table1Full.has(k))).toBe(false);
    expect(seats.every(x => x.seatIndex < 8)).toBe(true);
  });

  it('occupiedChairs ignores the selection, the unseated and a ghost chair', () => {
    const players = [
      { id: 'a', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 0 } },
      { id: 'b', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 1 } },
      { id: 'c', seated: false },
      { id: 'g', seated: true, tableAssignment: { tableIndex: 0, seatIndex: 8 } },
    ];
    expect([...occupiedChairs(players, new Set(['b']), 8)]).toEqual(['0-0']);
  });
});
