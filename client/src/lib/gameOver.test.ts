import { describe, it, expect } from 'vitest';
import { gameIsOver, winnerOf } from './gameOver';

describe('gameIsOver', () => {
  /**
   * THE REGRESSION GUARD. This is the state a real finished game is in: every
   * player inactive, including the winner, who is the one holding position 1.
   *
   * Any predicate written as "exactly one player is still active" returns false
   * here — which is precisely what hid the Tournament Over banner, the
   * participant's copy of it and the Tournament Winner card. If this test ever
   * goes red, that shape has come back.
   */
  it('is over when EVERY player is inactive, including the winner', () => {
    const players = [
      { name: 'Dave', isActive: false, position: 1 },
      { name: 'Sam', isActive: false, position: 2 },
      { name: 'Ali', isActive: false, position: 3 },
    ];
    expect(gameIsOver(players)).toBe(true);
    expect(winnerOf(players)?.name).toBe('Dave');
  });

  it('is not over while anyone is still playing', () => {
    const players = [
      { name: 'Dave', isActive: true },
      { name: 'Sam', isActive: false, position: 2 },
    ];
    expect(gameIsOver(players)).toBe(false);
    expect(winnerOf(players)).toBeNull();
  });

  it('is not over when everyone is out but nobody won', () => {
    // A wiped or half-built roster. Somebody has to have actually finished
    // first, or this is not a completed tournament.
    expect(gameIsOver([
      { isActive: false, position: 2 },
      { isActive: false, position: 3 },
    ])).toBe(false);
  });

  // An older saved game, or a document read back from Firestore, can carry a
  // finishing position with no isActive flag at all. The position is what makes
  // the predicate survive that.
  it('reads a finishing position as out even with no isActive flag', () => {
    expect(gameIsOver([{ position: 1 }, { position: 2 }])).toBe(true);
  });

  it('still treats an absent flag on a player with no position as active', () => {
    expect(gameIsOver([{ name: 'Dave' }, { isActive: false, position: 2 }])).toBe(false);
  });

  it('a one-player game is never over', () => {
    expect(gameIsOver([{ isActive: false, position: 1 }])).toBe(false);
  });

  it('handles an empty, null or undefined roster', () => {
    expect(gameIsOver([])).toBe(false);
    expect(gameIsOver(null)).toBe(false);
    expect(gameIsOver(undefined)).toBe(false);
  });
});

describe('winnerOf', () => {
  it('ignores position 0 and absent positions', () => {
    expect(winnerOf([{ position: 0 }, { name: 'Sam' }])).toBeNull();
    expect(winnerOf(null)).toBeNull();
  });

  it('finds the winner regardless of order', () => {
    expect(winnerOf([
      { name: 'Sam', position: 3 },
      { name: 'Dave', position: 1 },
    ])?.name).toBe('Dave');
  });
});
