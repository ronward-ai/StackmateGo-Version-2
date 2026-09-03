import { describe, it, expect } from 'vitest';
import {
  nextEliminationPosition,
  positionsAfterReEntry,
  playersShiftedByReEntry,
  rostersMatchForUndo,
  type PositionedPlayer,
} from './eliminationOrder';

/** A roster of `n` players, all still in. */
function roster(n: number): PositionedPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, isActive: true }));
}

/** Eliminate a player, awarding the next position — what the app does. */
function bust(players: PositionedPlayer[], id: string): PositionedPlayer[] {
  const position = nextEliminationPosition(players);
  return players.map(p => (p.id === id ? { ...p, isActive: false, position } : p));
}

describe('nextEliminationPosition', () => {
  it('awards last place to the first player out', () => {
    expect(nextEliminationPosition(roster(10))).toBe(10);
  });

  it('counts down as players bust', () => {
    let players = roster(10);
    players = bust(players, 'p1');
    expect(nextEliminationPosition(players)).toBe(9);
    players = bust(players, 'p2');
    expect(nextEliminationPosition(players)).toBe(8);
  });

  it('awards first place to the last player standing', () => {
    let players = roster(3);
    players = bust(players, 'p1');
    players = bust(players, 'p2');
    expect(nextEliminationPosition(players)).toBe(1);
  });

  it('never returns a position below 1', () => {
    let players = roster(2);
    players = bust(players, 'p1');
    players = bust(players, 'p2');
    expect(nextEliminationPosition(players)).toBeGreaterThanOrEqual(1);
  });

  it('ignores inactive players who hold no position', () => {
    // A player sat out without being given a finishing position should not
    // consume one.
    const players: PositionedPlayer[] = [
      { id: 'p1', isActive: false },
      { id: 'p2', isActive: true },
      { id: 'p3', isActive: true },
    ];
    expect(nextEliminationPosition(players)).toBe(3);
  });
});

describe('positionsAfterReEntry', () => {
  it('clears the returning player position', () => {
    let players = roster(10);
    players = bust(players, 'p1'); // 10th
    const after = positionsAfterReEntry(players, 'p1');
    expect(after.find(p => p.id === 'p1')?.position).toBeUndefined();
  });

  it('shifts everyone who finished after the returning player one place worse', () => {
    let players = roster(10);
    players = bust(players, 'p1'); // 10th
    players = bust(players, 'p2'); // 9th
    players = bust(players, 'p3'); // 8th

    const after = positionsAfterReEntry(players, 'p1');

    // p1 vacated 10th, so those who busted after them move down.
    expect(after.find(p => p.id === 'p2')?.position).toBe(10);
    expect(after.find(p => p.id === 'p3')?.position).toBe(9);
  });

  it('leaves players who finished BEFORE the returning player alone', () => {
    let players = roster(10);
    players = bust(players, 'p1'); // 10th
    players = bust(players, 'p2'); // 9th
    players = bust(players, 'p3'); // 8th

    // p3 (8th) re-enters: p1 and p2 finished earlier, so they do not move.
    const after = positionsAfterReEntry(players, 'p3');
    expect(after.find(p => p.id === 'p1')?.position).toBe(10);
    expect(after.find(p => p.id === 'p2')?.position).toBe(9);
  });

  it('is a no-op for a player who holds no finishing position', () => {
    const players = roster(6);
    expect(positionsAfterReEntry(players, 'p1')).toBe(players);
  });

  it('is a no-op for an unknown player id', () => {
    const players = roster(6);
    expect(positionsAfterReEntry(players, 'nobody')).toBe(players);
  });

  // The regression itself. Against the old implementation the final assertion
  // fails: the fourth bust was handed 8, which p3 already held.
  it('REGRESSION: no two players share a position after a re-entry', () => {
    let players = roster(10);
    players = bust(players, 'p1'); // 10th
    players = bust(players, 'p2'); // 9th
    players = bust(players, 'p3'); // 8th

    players = positionsAfterReEntry(players, 'p1'); // p1 buys back in
    players = bust(players, 'p4'); // must not collide with p3

    const positions = players
      .filter(p => typeof p.position === 'number')
      .map(p => p.position as number);

    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it('survives several re-entries in a row', () => {
    let players = roster(6);
    players = bust(players, 'p1'); // 6th
    players = bust(players, 'p2'); // 5th
    players = positionsAfterReEntry(players, 'p1');
    players = bust(players, 'p3'); // 5th (p2 shifted to 6th)
    players = positionsAfterReEntry(players, 'p2');
    players = bust(players, 'p4');

    const positions = players
      .filter(p => typeof p.position === 'number')
      .map(p => p.position as number);

    expect(new Set(positions).size).toBe(positions.length);
  });

  it('keeps the eventual winner on position 1', () => {
    let players = roster(4);
    players = bust(players, 'p1'); // 4th
    players = positionsAfterReEntry(players, 'p1');
    players = bust(players, 'p1'); // out again, 4th
    players = bust(players, 'p2'); // 3rd
    players = bust(players, 'p3'); // 2nd
    players = bust(players, 'p4'); // 1st

    expect(players.find(p => p.id === 'p4')?.position).toBe(1);
  });
});

describe('playersShiftedByReEntry', () => {
  it('names exactly the players whose position changes', () => {
    let players = roster(10);
    players = bust(players, 'p1'); // 10th
    players = bust(players, 'p2'); // 9th
    players = bust(players, 'p3'); // 8th

    expect(playersShiftedByReEntry(players, 'p1').sort()).toEqual(['p2', 'p3']);
  });

  it('excludes the returning player', () => {
    let players = roster(4);
    players = bust(players, 'p1');
    expect(playersShiftedByReEntry(players, 'p1')).not.toContain('p1');
  });

  it('is empty when nobody finished after the returning player', () => {
    let players = roster(4);
    players = bust(players, 'p1'); // 4th, nobody after them yet
    expect(playersShiftedByReEntry(players, 'p1')).toEqual([]);
  });

  it('agrees with what positionsAfterReEntry actually changes', () => {
    let players = roster(8);
    players = bust(players, 'p1');
    players = bust(players, 'p2');
    players = bust(players, 'p3');

    const named = playersShiftedByReEntry(players, 'p1').sort();
    const after = positionsAfterReEntry(players, 'p1');
    const actuallyChanged = players
      .filter(p => p.id !== 'p1')
      .filter(p => after.find(a => a.id === p.id)?.position !== p.position)
      .map(p => p.id)
      .sort();

    expect(named).toEqual(actuallyChanged);
  });
});

describe('rostersMatchForUndo', () => {
  const base: PositionedPlayer[] = [
    { id: 'p1', isActive: false, position: 3, rebuys: 1 },
    { id: 'p2', isActive: true },
    { id: 'p3', isActive: true, knockouts: 2 },
  ];
  const clone = (ps: PositionedPlayer[]) => ps.map(p => ({ ...p }));

  it('accepts the same array', () => {
    expect(rostersMatchForUndo(base, base)).toBe(true);
  });

  // The Firestore echo case: a new array, identical content. Reference equality
  // would refuse a perfectly valid undo here.
  it('accepts a structurally identical copy', () => {
    expect(rostersMatchForUndo(base, clone(base))).toBe(true);
  });

  it('treats a missing count as zero', () => {
    const withZeros = clone(base).map(p => ({ rebuys: 0, reEntries: 0, knockouts: 0, ...p }));
    expect(rostersMatchForUndo(base, withZeros)).toBe(true);
  });

  it('rejects a later elimination', () => {
    const after = clone(base);
    after[1] = { ...after[1], isActive: false, position: 2 };
    expect(rostersMatchForUndo(base, after)).toBe(false);
  });

  it('rejects a later knockout', () => {
    const after = clone(base);
    after[2] = { ...after[2], knockouts: 3 };
    expect(rostersMatchForUndo(base, after)).toBe(false);
  });

  it('rejects a later rebuy or re-entry', () => {
    const rebought = clone(base);
    rebought[0] = { ...rebought[0], rebuys: 2 };
    expect(rostersMatchForUndo(base, rebought)).toBe(false);

    const reentered = clone(base);
    reentered[0] = { ...reentered[0], reEntries: 1 };
    expect(rostersMatchForUndo(base, reentered)).toBe(false);
  });

  it('rejects a renumbered position', () => {
    const after = clone(base);
    after[0] = { ...after[0], position: 4 };
    expect(rostersMatchForUndo(base, after)).toBe(false);
  });

  it('rejects a player being added or removed', () => {
    expect(rostersMatchForUndo(base, [...clone(base), { id: 'p4', isActive: true }])).toBe(false);
    expect(rostersMatchForUndo(base, clone(base).slice(0, 2))).toBe(false);
  });

  it('rejects a reordered roster, since positions are read by index', () => {
    const swapped = clone(base);
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(rostersMatchForUndo(base, swapped)).toBe(false);
  });
});
