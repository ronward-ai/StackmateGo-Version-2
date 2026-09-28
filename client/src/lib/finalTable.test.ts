import { describe, it, expect } from 'vitest';
import {
  activeCount, alreadyAtOneTable, dismissalIsStale, finalTableAfterReturn, outgrowsFinalTable, promptDismissedFor,
  restoreSeating, shouldPromptForFinalTable, snapshotSeating, type SeatablePlayer,
} from './finalTable';

const seated = (id: string, tableIndex: number, seatIndex: number): SeatablePlayer =>
  ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

const busted = (id: string): SeatablePlayer => ({ id, isActive: false, seated: false });

/**
 * Nine players across two eight-seat tables, seated 5 and 4 — which is how a
 * real nine-player game on 8-max tables sits, and the fixture this file used to
 * get wrong.
 *
 * It was 8 + 1. That is not a seating anybody would make, and it quietly broke
 * what the tests below meant: busting the lone player on table two left the
 * other EIGHT already sitting together, so "the field now fits one table" and
 * "the field is already AT one table" were the same state, and the file asserted
 * the prompt fires in a game that needed no consolidating. See
 * `alreadyAtOneTable`.
 */
const nineAcrossTwoTables = (): SeatablePlayer[] => [
  ...Array.from({ length: 5 }, (_, i) => seated(`t1-${i}`, 0, i)),
  ...Array.from({ length: 4 }, (_, i) => seated(`t2-${i}`, 1, i)),
];

/** Nine down to eight, still spread across both tables: consolidation is due. */
const eightAcrossTwoTables = (): SeatablePlayer[] => [
  ...nineAcrossTwoTables().slice(0, 8),
  busted('t2-3'),
];

describe('shouldPromptForFinalTable', () => {
  it('asks once a bust-out leaves exactly one table', () => {
    expect(shouldPromptForFinalTable(eightAcrossTwoTables(), 8, false)).toBe(true);
  });

  it('stays quiet while more than one table is needed', () => {
    expect(shouldPromptForFinalTable(nineAcrossTwoTables(), 8, false)).toBe(false);
  });

  it('never fires on the opening seating, before anyone has busted', () => {
    const eight = Array.from({ length: 8 }, (_, i) => seated(`p${i}`, 0, i));
    expect(shouldPromptForFinalTable(eight, 8, false)).toBe(false);
  });

  it('does not ask twice', () => {
    expect(shouldPromptForFinalTable(eightAcrossTwoTables(), 8, true)).toBe(false);
  });

  it('does not fire heads-up down to one player', () => {
    expect(shouldPromptForFinalTable([seated('a', 0, 0), busted('b')], 1, false)).toBe(false);
  });
});

describe('promptDismissedFor', () => {
  it('stays dismissed while the field is the same size', () => {
    // "Not yet" used to last until the next roster change of any kind — a chip
    // edit reopened it.
    const players = [...nineAcrossTwoTables().slice(0, 8), busted('t2-0')];
    expect(promptDismissedFor(8, players)).toBe(true);
  });

  it('re-arms when the field changes size again', () => {
    const players = [...nineAcrossTwoTables().slice(0, 7), busted('x'), busted('y')];
    expect(promptDismissedFor(8, players)).toBe(false);
  });

  it('is not dismissed when it never was', () => {
    expect(promptDismissedFor(null, nineAcrossTwoTables())).toBe(false);
  });
});

describe('dismissalIsStale', () => {
  it('is spent once the field grows back past one table', () => {
    // The rebuy put the ninth player back. The collapse is not due at all now,
    // so the answer given about the last bust-out has nothing left to apply to.
    expect(dismissalIsStale(8, nineAcrossTwoTables(), 8)).toBe(true);
  });

  it('still holds while the field fits one table', () => {
    const players = [...nineAcrossTwoTables().slice(0, 8), busted('t2-0')];
    expect(dismissalIsStale(8, players, 8)).toBe(false);
  });

  it('is nothing to clear when no answer was given', () => {
    expect(dismissalIsStale(null, nineAcrossTwoTables(), 8)).toBe(false);
  });
});

/**
 * THE NIGHT AS IT WAS REPORTED, step by step.
 *
 * Nine players, eight-seat tables. Bust one, take the prompt, rebuy them from
 * the dialog, bust the same player again — and the prompt did not come back,
 * because the latch held the number 8 and the field had returned to 8. The
 * last assertion here is the bug; it fails without the staleness rule.
 */
describe('bust, rebuy, bust again', () => {
  const seatsPerTable = 8;

  it('asks again after the field has been and gone', () => {
    // Nine at the table: nothing due.
    let players = nineAcrossTwoTables();
    let dismissedAt: number | null = null;
    expect(shouldPromptForFinalTable(players, seatsPerTable, false)).toBe(false);

    // One busts. Eight left, one table's worth, still spread: the prompt is due.
    players = eightAcrossTwoTables();
    expect(shouldPromptForFinalTable(players, seatsPerTable, false)).toBe(true);
    expect(promptDismissedFor(dismissedAt, players)).toBe(false);

    // The director takes the rebuy. onClose latches the count from the render
    // it was opened in — pre-rebuy, so 8. That is why the value itself cannot
    // be trusted to mean anything later.
    dismissedAt = activeCount(players);
    expect(dismissedAt).toBe(8);
    expect(promptDismissedFor(dismissedAt, players)).toBe(true);

    // The rebuy lands: nine again, and the answer is spent.
    players = nineAcrossTwoTables();
    expect(dismissalIsStale(dismissedAt, players, seatsPerTable)).toBe(true);
    dismissedAt = null;

    // Same player busts again. A NEW question, and it must be asked.
    players = eightAcrossTwoTables();
    expect(shouldPromptForFinalTable(players, seatsPerTable, false)).toBe(true);
    expect(promptDismissedFor(dismissedAt, players)).toBe(false);
  });

  it('does not reopen while the field simply sits there', () => {
    // The regression the latch exists for, and which the staleness rule must
    // not trade away: no rebuy, so nothing is stale and "Not yet" holds.
    const players = eightAcrossTwoTables();
    expect(dismissalIsStale(8, players, seatsPerTable)).toBe(false);
    expect(promptDismissedFor(8, players)).toBe(true);
  });
});

describe('snapshotSeating and restoreSeating', () => {
  it('round-trips every seat through a random redraw', () => {
    const before = nineAcrossTwoTables().slice(0, 8);
    const snapshot = snapshotSeating(before);

    // What goToFinalTable does: everyone onto table 0, seats redrawn.
    const collapsed = before.map((p, i) => ({
      ...p, seated: true, tableAssignment: { tableIndex: 0, seatIndex: (i + 3) % 8 },
    }));

    expect(restoreSeating(collapsed, snapshot)).toEqual(before);
  });

  it('only snapshots players still in the tournament', () => {
    const snapshot = snapshotSeating([seated('a', 0, 0), busted('b')]);
    expect(snapshot.map(s => s.playerId)).toEqual(['a']);
  });

  it('leaves a player the snapshot has never heard of exactly as they are', () => {
    // A rebuy after the collapse: seatToReclaim has just given them a chair and
    // the snapshot has no opinion about them. Guessing would take it away.
    const snapshot = snapshotSeating([seated('a', 0, 0)]);
    const now = [seated('a', 0, 5), seated('returned', 1, 2)];
    expect(restoreSeating(now, snapshot)[1]).toEqual(seated('returned', 1, 2));
  });

  it('is a no-op with no snapshot, rather than unseating the table', () => {
    const players = nineAcrossTwoTables();
    expect(restoreSeating(players, null)).toBe(players);
    expect(restoreSeating(players, [])).toBe(players);
  });

  it('restores an unseated player as unseated', () => {
    const snapshot = snapshotSeating([{ id: 'a', isActive: true, seated: false }]);
    const restored = restoreSeating([seated('a', 0, 4)], snapshot);
    expect(restored[0].seated).toBe(false);
    expect(restored[0].tableAssignment).toBeUndefined();
  });
});

describe('outgrowsFinalTable', () => {
  it('is true when a returning player no longer fits', () => {
    expect(outgrowsFinalTable(9, 8)).toBe(true);
  });

  it('is false at exactly one table', () => {
    expect(outgrowsFinalTable(8, 8)).toBe(false);
  });
});

describe('activeCount', () => {
  it('counts players still in, treating an absent flag as in', () => {
    expect(activeCount([{ id: 'a' }, seated('b', 0, 0), busted('c')])).toBe(2);
  });
});

describe('shouldPromptForFinalTable below the threshold', () => {
  const field = (active: number, busted: number) => [
    ...Array.from({ length: active }, (_, i) => ({ id: `a${i}` })),
    ...Array.from({ length: busted }, (_, i) => ({ id: `b${i}`, isActive: false })),
  ];

  it('keeps asking on every bust-out once the field fits one table', () => {
    // The bug: this used to be an equality, so with 8 seats the question was
    // asked at 8 and never again. A director answered "Not yet" once and was
    // left collapsing the table by hand for the rest of the night.
    for (let active = 8; active >= 2; active--) {
      expect(shouldPromptForFinalTable(field(active, 9 - active), 8, false)).toBe(true);
    }
  });

  it('does not ask while the field still needs more than one table', () => {
    expect(shouldPromptForFinalTable(field(9, 1), 8, false)).toBe(false);
  });

  it('does not ask before anyone has gone out', () => {
    // The opening seating of a tournament that starts with one table's worth.
    expect(shouldPromptForFinalTable(field(8, 0), 8, false)).toBe(false);
    expect(shouldPromptForFinalTable(field(6, 0), 8, false)).toBe(false);
  });

  it('does not ask once it is already the final table', () => {
    expect(shouldPromptForFinalTable(field(6, 3), 8, true)).toBe(false);
  });

  it('does not ask when one player is left, because the game is over', () => {
    expect(shouldPromptForFinalTable(field(1, 8), 8, false)).toBe(false);
  });
});

/**
 * THE REPORTED BUG, twice over: "still getting a 'final table?' message when
 * taking control on either device, there's 4 players remaining on an already
 * established final table of 8 seats."
 *
 * Persisting `isFinalTable` was not enough and could not have been. The flag had
 * only ever lived in a per-device localStorage mirror, which is deliberately
 * never auto-restored for a live game — so once both devices reload onto a build
 * that reads it, NEITHER holds `true`, nothing is left to write it, and the
 * document stays empty for good. Every other clause is satisfied by definition at
 * a final table, so the prompt fires forever.
 *
 * Deriving it from the seating is what fixes a game already under way.
 */
describe('alreadyAtOneTable', () => {
  it('is true for the reported game — four left on an eight-seat final table', () => {
    const players = [
      ...Array.from({ length: 4 }, (_, i) => seated(`a${i}`, 0, i)),
      ...Array.from({ length: 5 }, (_, i) => busted(`b${i}`)),
    ];
    expect(alreadyAtOneTable(players)).toBe(true);
    // The point of the whole change: no stored flag, and still not asked.
    expect(shouldPromptForFinalTable(players, 8, false)).toBe(false);
    expect(shouldPromptForFinalTable(players, 8, undefined)).toBe(false);
  });

  it('is false while the field is spread across two tables', () => {
    expect(alreadyAtOneTable(eightAcrossTwoTables())).toBe(false);
    expect(shouldPromptForFinalTable(eightAcrossTwoTables(), 8, false)).toBe(true);
  });

  it('ignores where the BUSTED players used to sit', () => {
    // eliminatePlayer clears seated/tableAssignment, but an older document can
    // carry a busted player still holding a chair. Only the living field counts.
    const players = [
      seated('a', 0, 0), seated('b', 0, 1),
      { id: 'z', isActive: false, seated: true, tableAssignment: { tableIndex: 1, seatIndex: 0 } },
    ];
    expect(alreadyAtOneTable(players)).toBe(true);
  });

  it('does not care WHICH table, only that it is one of them', () => {
    expect(alreadyAtOneTable([seated('a', 3, 0), seated('b', 3, 1)])).toBe(true);
  });

  /**
   * Conservative on purpose. A director who never uses the seating chart must
   * still be asked — claiming "you are already at the final table" about a game
   * whose seats nobody has filled would suppress a question that IS due.
   */
  it('is false when the field is not seated at all', () => {
    expect(alreadyAtOneTable([{ id: 'a' }, { id: 'b' }])).toBe(false);
    expect(shouldPromptForFinalTable([{ id: 'a' }, { id: 'b' }, busted('c')], 8, false)).toBe(true);
  });

  it('is false when one active player is left standing', () => {
    expect(alreadyAtOneTable([seated('a', 0, 0), { id: 'b', isActive: true, seated: false }])).toBe(false);
  });

  it('is false when a seated player has no table', () => {
    expect(alreadyAtOneTable([seated('a', 0, 0), { id: 'b', isActive: true, seated: true }])).toBe(false);
  });

  it('is false with nobody left, rather than vacuously true', () => {
    expect(alreadyAtOneTable([])).toBe(false);
    expect(alreadyAtOneTable([busted('a'), busted('b')])).toBe(false);
  });

  /**
   * A tournament that has only EVER used one table has no final table to go to,
   * and used to be asked on every bust-out anyway.
   */
  it('never asks a single-table tournament to go to the final table', () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => seated(`a${i}`, 0, i)),
      busted('out'),
    ];
    expect(shouldPromptForFinalTable(players, 8, false)).toBe(false);
  });
});

/**
 * THE REPORTED GAME: nine players, bust one out, collapse to the final table via
 * the prompt, then press the failsafe Rebuy — and he was seated **on table 2 on
 * his own**, with the tournament still flagged as its own final table.
 *
 * Two faults met here. `processRebuy` never mentioned the final table at all,
 * while `undoBustOut` had unwound it since the day it was written; and
 * `seatToReclaim` handed back a pre-collapse chair that reads as "free" PRECISELY
 * because the collapse emptied that table. One rule, three doors.
 */
describe('finalTableAfterReturn', () => {
  const seat = (id: string, tableIndex: number, seatIndex: number): SeatablePlayer =>
    ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

  /** Eight survivors collapsed onto table 1, plus the player who just rebought. */
  const collapsedPlusOne = (): SeatablePlayer[] => [
    ...Array.from({ length: 8 }, (_, i) => seat(`a${i}`, 0, i)),
    seat('back', 1, 0), // seatToReclaim gave him his pre-collapse chair
  ];

  const snapshot = [
    ...Array.from({ length: 5 }, (_, i) => ({ playerId: `a${i}`, seated: true, tableIndex: 0, seatIndex: i })),
    ...Array.from({ length: 3 }, (_, i) => ({ playerId: `a${i + 5}`, seated: true, tableIndex: 1, seatIndex: i })),
  ];

  it('unwinds when the returning player no longer fits — the reported game', () => {
    const out = finalTableAfterReturn(collapsedPlusOne(), {
      isFinalTable: true,
      preFinalTableSeating: snapshot,
      seatsPerTable: 8,
    });

    expect(out.isFinalTable).toBe(false);
    expect(out.preFinalTableSeating).toBeUndefined();
    // The eight go back across BOTH tables, so nobody is left sitting alone.
    const tables = new Set(out.players.map(p => p.tableAssignment?.tableIndex));
    expect([...tables].sort()).toEqual([0, 1]);
  });

  /**
   * The composition the whole thing rests on: the returning player is NOT in the
   * snapshot (it keeps only actives, and he was busted at the collapse), so
   * restoreSeating leaves him on the chair seatToReclaim gave him — which is his
   * real pre-collapse seat.
   */
  it('leaves the returning player on the chair he reclaimed', () => {
    const out = finalTableAfterReturn(collapsedPlusOne(), {
      isFinalTable: true, preFinalTableSeating: snapshot, seatsPerTable: 8,
    });
    expect(out.players.find(p => p.id === 'back')?.tableAssignment).toEqual({ tableIndex: 1, seatIndex: 0 });
  });

  it('keeps the final table and seats him AT it when the field still fits', () => {
    // Six on an eight-seat final table; one more still fits.
    const players: SeatablePlayer[] = [
      ...Array.from({ length: 6 }, (_, i) => seat(`a${i}`, 0, i)),
      seat('back', 1, 0),
    ];
    const out = finalTableAfterReturn(players, {
      isFinalTable: true, preFinalTableSeating: snapshot, seatsPerTable: 8, returningId: 'back',
    });

    expect(out.isFinalTable).toBe(true);
    expect(out.preFinalTableSeating).toBe(snapshot);
    // Not his old table-2 chair — a free seat at the table being played on.
    expect(out.seatForReturner).toEqual({ tableIndex: 0, seatIndex: 6 });
  });

  it('changes nothing at all when there is no final table', () => {
    const players = collapsedPlusOne();
    const out = finalTableAfterReturn(players, { isFinalTable: false, seatsPerTable: 8 });
    expect(out.players).toBe(players);
    expect(out.isFinalTable).toBe(false);
    expect(out.seatForReturner).toBeNull();
  });

  it('still clears the flag when there is no snapshot to restore', () => {
    // Matches undoFinalTable: the flag goes even when no seats can move.
    const out = finalTableAfterReturn(collapsedPlusOne(), {
      isFinalTable: true, preFinalTableSeating: undefined, seatsPerTable: 8,
    });
    expect(out.isFinalTable).toBe(false);
  });

  it('offers no seat when the field is not seated, rather than inventing one', () => {
    const out = finalTableAfterReturn([{ id: 'a' }, { id: 'b' }], {
      isFinalTable: true, seatsPerTable: 8,
    });
    expect(out.seatForReturner).toBeNull();
  });
});

/**
 * The residue the first fix left, caught by driving the real game rather than by
 * reading: the collapse unwound correctly, but the returning player came back
 * UNSEATED. `seatToReclaim` runs before the unwind, so it asks its question
 * against the collapsed roster — where the redraw has handed his old chair to
 * somebody else — and returns null. The unwind then vacates that very seat.
 */
describe('finalTableAfterReturn — the chair back after an unwind', () => {
  const seat = (id: string, tableIndex: number, seatIndex: number): SeatablePlayer =>
    ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

  const collapsed = (): SeatablePlayer[] => [
    ...Array.from({ length: 8 }, (_, i) => seat(`a${i}`, 0, i)),
    { id: 'back', isActive: true, seated: false },
  ];
  const snapshot = [
    ...Array.from({ length: 4 }, (_, i) => ({ playerId: `a${i}`, seated: true, tableIndex: 0, seatIndex: i })),
    ...Array.from({ length: 4 }, (_, i) => ({ playerId: `a${i + 4}`, seated: true, tableIndex: 1, seatIndex: i })),
  ];

  it('gives the returning player their own chair back once the restore vacates it', () => {
    const out = finalTableAfterReturn(collapsed(), {
      isFinalTable: true,
      preFinalTableSeating: snapshot,
      seatsPerTable: 8,
      returningId: 'back',
      reclaimSeat: { tableIndex: 0, seatIndex: 4 }, // taken pre-unwind, free after
    });
    expect(out.isFinalTable).toBe(false);
    expect(out.seatForReturner).toEqual({ tableIndex: 0, seatIndex: 4 });
  });

  it('leaves them unseated when somebody really is in that chair', () => {
    const out = finalTableAfterReturn(collapsed(), {
      isFinalTable: true,
      preFinalTableSeating: snapshot,
      seatsPerTable: 8,
      returningId: 'back',
      reclaimSeat: { tableIndex: 1, seatIndex: 0 }, // a4 sits here after the restore
    });
    expect(out.seatForReturner).toBeNull();
  });

  it('leaves them unseated when they had no recorded chair', () => {
    const out = finalTableAfterReturn(collapsed(), {
      isFinalTable: true, preFinalTableSeating: snapshot, seatsPerTable: 8, returningId: 'back',
    });
    expect(out.seatForReturner).toBeNull();
  });
});
