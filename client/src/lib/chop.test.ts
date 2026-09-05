import { describe, it, expect } from 'vitest';
import { payingPlaces, chopBase, icmEquity, proportionalChop } from './chop';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('payingPlaces', () => {
  it('leaves a structure with no padding alone', () => {
    expect(payingPlaces([50, 30, 20])).toEqual([50, 30, 20]);
  });

  // The performance fix: ICM recurses once per payout, so padding to the player
  // count made nine players enumerate every ordering for nothing.
  it('trims the zeros a padded structure carries', () => {
    expect(payingPlaces([50, 30, 20, 0, 0, 0])).toEqual([50, 30, 20]);
  });

  it('keeps a zero that has real money after it', () => {
    expect(payingPlaces([50, 0, 20])).toEqual([50, 0, 20]);
  });

  it('is empty when nothing pays', () => {
    expect(payingPlaces([])).toEqual([]);
    expect(payingPlaces([0, 0])).toEqual([]);
  });
});

describe('chopBase', () => {
  const PAYS_SIX = [100, 60, 40, 30, 20, 10];

  // The reported bug. Places 4-6 belong to players who are already out and
  // paid; sharing that money among the survivors invents it.
  it('REGRESSION: three players left share the top three places, not the pool', () => {
    expect(chopBase(PAYS_SIX, 3)).toBe(200);
    expect(chopBase(PAYS_SIX, 3)).not.toBe(sum(PAYS_SIX));
  });

  it('is the whole structure when everyone is still in', () => {
    expect(chopBase(PAYS_SIX, 6)).toBe(sum(PAYS_SIX));
  });

  it('does not invent money when more players remain than places pay', () => {
    expect(chopBase([100, 60], 5)).toBe(160);
  });

  it('is 0 for nobody left', () => {
    expect(chopBase(PAYS_SIX, 0)).toBe(0);
    expect(chopBase(PAYS_SIX, -1)).toBe(0);
  });
});

describe('icmEquity', () => {
  it('gives equal stacks equal equity', () => {
    const eq = icmEquity([1000, 1000, 1000], [100, 60, 40]);
    near(eq[0], eq[1]);
    near(eq[1], eq[2]);
  });

  // The invariant that catches almost any error in the recursion.
  it('pays out exactly the money on the table', () => {
    const payouts = [100, 60, 40];
    near(sum(icmEquity([5000, 3000, 2000], payouts)), sum(payouts));
    near(sum(icmEquity([9000, 500, 500], payouts)), sum(payouts));
    near(sum(icmEquity([2500, 2500, 2500, 2500], payouts)), sum(payouts));
  });

  // What makes ICM worth having at all: a chip is worth less the more you hold.
  it('shades money from the chip leader to the short stacks', () => {
    const chips = [7000, 2000, 1000];
    const payouts = [100, 60, 40];
    const pot = sum(payouts);
    const eq = icmEquity(chips, payouts);
    const totalChips = sum(chips);

    expect(eq[0]).toBeLessThan((chips[0] / totalChips) * pot);
    expect(eq[2]).toBeGreaterThan((chips[2] / totalChips) * pot);
  });

  it('ranks equity in the same order as chips', () => {
    const eq = icmEquity([6000, 3000, 1000], [100, 60, 40]);
    expect(eq[0]).toBeGreaterThan(eq[1]);
    expect(eq[1]).toBeGreaterThan(eq[2]);
  });

  it('gives the only player with chips first place', () => {
    // Degenerate input: a player on zero chips is really already out, so the
    // places below first cannot be allocated and that money is left unassigned.
    // The dialog never asks this — it requires every stack to be filled in
    // before it calculates — but the function must not invent an answer.
    const eq = icmEquity([5000, 0, 0], [100, 60, 40]);
    near(eq[0], 100);
    near(eq[1], 0);
    near(eq[2], 0);
  });

  it('is all zeroes when nobody has chips', () => {
    expect(icmEquity([0, 0], [100, 60])).toEqual([0, 0]);
  });

  it('is all zeroes when nothing pays', () => {
    expect(icmEquity([1000, 500], [])).toEqual([0, 0]);
  });

  it('handles a winner-take-all structure', () => {
    const eq = icmEquity([7500, 2500], [100]);
    near(eq[0], 75);
    near(eq[1], 25);
  });

  it('stays affordable for a full final table', () => {
    // Nine players but three paid places: depth is the paying places, not the
    // player count, so this is cheap rather than 9! orderings.
    const chips = [9000, 8000, 7000, 6000, 5000, 4000, 3000, 2000, 1000];
    const started = Date.now();
    const eq = icmEquity(chips, [100, 60, 40]);
    expect(Date.now() - started).toBeLessThan(500);
    near(sum(eq), 200);
  });
});

describe('proportionalChop', () => {
  it('splits the base by chip share', () => {
    const shares = proportionalChop([5000, 3000, 2000], 200);
    near(shares[0], 100);
    near(shares[1], 60);
    near(shares[2], 40);
  });

  it('pays out exactly the base', () => {
    near(sum(proportionalChop([7000, 2000, 1000], 200)), 200);
  });

  it('is all zeroes rather than NaN when nobody has chips', () => {
    const shares = proportionalChop([0, 0], 200);
    expect(shares).toEqual([0, 0]);
    expect(shares.some(Number.isNaN)).toBe(false);
  });

  // Both tabs must divide the same pot, however differently.
  it('splits the same total as ICM does', () => {
    const chips = [7000, 2000, 1000];
    const payouts = [100, 60, 40];
    const base = chopBase(payouts, chips.length);
    near(sum(proportionalChop(chips, base)), sum(icmEquity(chips, payouts)));
  });
});
