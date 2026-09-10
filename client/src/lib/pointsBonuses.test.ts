import { describe, it, expect } from 'vitest';
import { withBonuses, hasBonuses } from './pointsBonuses';

describe('withBonuses', () => {
  it('leaves the score alone when a league sets neither', () => {
    expect(withBonuses(40, 3, {})).toBe(40);
    expect(withBonuses(40, 3, { knockoutPoints: 0, participationPoints: 0 })).toBe(40);
    expect(withBonuses(40, 3, { knockoutPoints: null, participationPoints: null })).toBe(40);
  });

  it('pays per knockout', () => {
    expect(withBonuses(40, 3, { knockoutPoints: 5 })).toBe(55);
    expect(withBonuses(40, 0, { knockoutPoints: 5 })).toBe(40);
  });

  it('pays for turning up, whatever happened', () => {
    // The point of it: busting out first still beats not coming.
    expect(withBonuses(0, 0, { participationPoints: 2 })).toBe(2);
  });

  it('adds both', () => {
    expect(withBonuses(40, 2, { knockoutPoints: 5, participationPoints: 3 })).toBe(53);
  });

  it('stays whole and never negative', () => {
    expect(withBonuses(10.7, 0, {})).toBe(10);
    expect(withBonuses(-50, 1, { knockoutPoints: 5 })).toBe(0);
  });

  it('ignores a nonsense knockout count rather than scoring NaN', () => {
    expect(withBonuses(40, NaN, { knockoutPoints: 5 })).toBe(40);
    expect(withBonuses(40, -3, { knockoutPoints: 5 })).toBe(40);
  });
});

describe('hasBonuses', () => {
  it('is true only when something is actually set', () => {
    expect(hasBonuses({})).toBe(false);
    expect(hasBonuses({ knockoutPoints: 0, participationPoints: 0 })).toBe(false);
    expect(hasBonuses({ knockoutPoints: 5 })).toBe(true);
    expect(hasBonuses({ participationPoints: 1 })).toBe(true);
  });
});
