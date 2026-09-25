import { describe, it, expect } from 'vitest';
import {
  activeCount, outgrowsFinalTable, promptDismissedFor, restoreSeating,
  shouldPromptForFinalTable, snapshotSeating, type SeatablePlayer,
} from './finalTable';

const seated = (id: string, tableIndex: number, seatIndex: number): SeatablePlayer =>
  ({ id, isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

const busted = (id: string): SeatablePlayer => ({ id, isActive: false, seated: false });

/** The reported game: nine players across two eight-seat tables. */
const nineAcrossTwoTables = (): SeatablePlayer[] => [
  ...Array.from({ length: 8 }, (_, i) => seated(`t1-${i}`, 0, i)),
  seated('t2-0', 1, 0),
];

describe('shouldPromptForFinalTable', () => {
  it('asks once a bust-out leaves exactly one table', () => {
    const players = [...nineAcrossTwoTables().slice(0, 8), busted('t2-0')];
    expect(shouldPromptForFinalTable(players, 8, false)).toBe(true);
  });

  it('stays quiet while more than one table is needed', () => {
    expect(shouldPromptForFinalTable(nineAcrossTwoTables(), 8, false)).toBe(false);
  });

  it('never fires on the opening seating, before anyone has busted', () => {
    const eight = Array.from({ length: 8 }, (_, i) => seated(`p${i}`, 0, i));
    expect(shouldPromptForFinalTable(eight, 8, false)).toBe(false);
  });

  it('does not ask twice', () => {
    const players = [...nineAcrossTwoTables().slice(0, 8), busted('t2-0')];
    expect(shouldPromptForFinalTable(players, 8, true)).toBe(false);
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
