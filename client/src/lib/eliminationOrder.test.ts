import { describe, it, expect } from 'vitest';
import {
  mostRecentlyBusted,
  isBustOut,
  bustedPlayers,
  nextEliminationPosition,
  positionsAfterReEntry,
  rostersMatchForUndo,
  type PositionedPlayer,
} from './eliminationOrder';

/** A roster of `n` players, all still in. */
function roster(n: number): PositionedPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, isActive: true }));
}

/** A finished game: everyone busted in turn, the last one holding 1st.
 *  Built through `bust`, so it is exactly the state `eliminatePlayer` leaves —
 *  every player inactive, the champion at position 1. */
function finished(n: number): PositionedPlayer[] {
  let players = roster(n);
  for (let i = 1; i <= n; i++) players = bust(players, `p${i}`);
  return players;
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

describe('mostRecentlyBusted', () => {
  // Driven through `bust`, which awards positions exactly as the app does, so
  // this asserts the two functions AGREE rather than asserting a number someone
  // wrote down. The version of this test that hard-coded the numbers argued the
  // direction correctly and then asserted the opposite, and the implementation
  // matched the assertion: `mostRecentlyBusted` returned the FIRST player out.
  it('is the player eliminated last, derived from how positions are awarded', () => {
    let players = roster(9);
    players = bust(players, 'p1');
    expect(mostRecentlyBusted(players)?.id).toBe('p1');
    players = bust(players, 'p2');
    expect(mostRecentlyBusted(players)?.id).toBe('p2');
    players = bust(players, 'p3');
    expect(mostRecentlyBusted(players)?.id).toBe('p3');
  });

  // The direction, stated once so a reader does not have to re-derive it.
  it('prefers the SMALLER finishing position, because positions count down', () => {
    const players: PositionedPlayer[] = [
      { id: 'first-out', isActive: false, position: 9 },
      { id: 'just-out', isActive: false, position: 8 },
    ];
    expect(mostRecentlyBusted(players)?.id).toBe('just-out');
  });

  // Part of the fix, not tidying: under a minimum, a busted player carrying no
  // position would read as 0 and win every time.
  it('ignores a busted player who holds no finishing position', () => {
    const players: PositionedPlayer[] = [
      { id: 'no-position', isActive: false },
      { id: 'real', isActive: false, position: 8 },
    ];
    expect(mostRecentlyBusted(players)?.id).toBe('real');
  });

  it('ignores players still in the game', () => {
    expect(mostRecentlyBusted([{ id: 'a', isActive: true }, { id: 'b' }])).toBeNull();
  });

  it('is null for an empty roster', () => {
    expect(mostRecentlyBusted([])).toBeNull();
  });

  it('skips a player who rebought, since they are active again', () => {
    // The rebuy path clears isActive back to true; whoever busted before them
    // is the one a prompt should now be offering to buy back in.
    const players: PositionedPlayer[] = [
      { id: 'rebought', isActive: true, position: undefined },
      { id: 'still-out', isActive: false, position: 7 },
    ];
    expect(mostRecentlyBusted(players)?.id).toBe('still-out');
  });
});

describe('the winner is not a bust-out', () => {
  // THE BUG: eliminatePlayer awards the last player standing position 1 AND
  // isActive: false in one update, so the champion satisfies `isFinished` — and
  // 1 is the smallest number there is, so a minimum over finishing positions
  // returned the WINNER at the end of every game. The rebuy dialog opened on
  // them. No fixture in this file used position 1 before, which is why 900
  // passing tests said nothing about it.
  it('names the runner-up at the end of a game, never the champion', () => {
    const players = finished(3);
    expect(players.find(p => p.id === 'p3')?.position).toBe(1);   // the champion
    expect(mostRecentlyBusted(players)?.id).toBe('p2');
  });

  // THE GATE THAT LOOKS RIGHT AND IS NOT. Excluding the winner only when
  // `gameIsOver(players)` hands them straight back, because a roster really can
  // hold a champion at position 1 with somebody active: adding a player to a
  // finished game, or undoing the RUNNER-UP's bust-out, which leaves the winner
  // stranded since undoBustOut only clears a false winner at two or more
  // actives. This fixture is that state.
  it('excludes position 1 even while another player is still in', () => {
    const players: PositionedPlayer[] = [
      { id: 'busted', isActive: false, position: 3 },
      { id: 'champion', isActive: false, position: 1 },
      { id: 'late-arrival', isActive: true },
    ];
    expect(mostRecentlyBusted(players)?.id).toBe('busted');
    expect(bustedPlayers(players).map(p => p.id)).toEqual(['busted']);
  });

  it('lists every bust-out and no winner, in roster order', () => {
    expect(bustedPlayers(finished(4)).map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('hands back the same objects, so a caller can key on them', () => {
    const players = finished(3);
    expect(bustedPlayers(players)[0]).toBe(players[0]);
  });

  it('drops actives and positionless inactives, and survives nothing at all', () => {
    expect(bustedPlayers([{ id: 'a', isActive: true }, { id: 'b', isActive: false }])).toEqual([]);
    expect(bustedPlayers([])).toEqual([]);
    expect(bustedPlayers(null)).toEqual([]);
  });

  it('is a fact about one player, needing no roster', () => {
    expect(isBustOut({ id: 'w', isActive: false, position: 1 })).toBe(false);
    expect(isBustOut({ id: 'r', isActive: false, position: 2 })).toBe(true);
    expect(isBustOut({ id: 'a', isActive: true })).toBe(false);
  });

  // The trade taken deliberately with the flat rule, pinned so it is a decision
  // rather than a surprise: busting the only player awards position 1, and
  // gameOver.ts already refuses to call a one-player roster a finished game.
  it('leaves a one-player game with no bust-outs at all', () => {
    expect(mostRecentlyBusted([{ id: 'solo', isActive: false, position: 1 }])).toBeNull();
  });

  // THE TRAP IN THE OTHER DIRECTION. nextEliminationPosition and
  // positionsAfterReEntry are asking who already holds a NUMBER, which the
  // winner does. Routing them through bustedPlayers would hand the next bust a
  // position somebody already has — the collision this module exists to fix.
  it('still COUNTS the winner where a finishing number is what matters', () => {
    // A late player added to a finished game — the same roster that makes the
    // gameIsOver gate wrong above, used here because it is the shape that
    // DISCRIMINATES: with the champion counted, the next bust takes 1st; with
    // them dropped from the count it takes 2nd, which p3 already holds.
    // `finished(3)` alone cannot catch this, because Math.max(1, …) clamps both
    // answers to 1.
    const late = [...finished(3), { id: 'late', isActive: true }];
    expect(nextEliminationPosition(late)).toBe(1);

    const players = finished(3);
    expect(nextEliminationPosition(players)).toBe(1);
    const after = positionsAfterReEntry(players, 'p2');
    expect(after.find(p => p.id === 'p3')?.position).toBe(2);   // champion shifts down
    expect(after.find(p => p.id === 'p2')?.position).toBeUndefined();
    const taken = after.filter(p => typeof p.position === 'number').map(p => p.position);
    expect(new Set(taken).size).toBe(taken.length);             // no duplicate finish
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
