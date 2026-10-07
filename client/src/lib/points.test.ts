import { describe, it, expect, vi } from 'vitest';
import { pointsFor } from './points';

/**
 * The league scoring engine, extracted from useLeagueSettings so it can be
 * tested at all (October audit, coverage). Each scheme's figures are pinned so
 * an edit cannot quietly change what a league scores.
 */
describe('pointsFor', () => {
  it('scores nothing with no formula, or a type it does not know', () => {
    expect(pointsFor(undefined, 1, 10)).toBe(0);
    expect(pointsFor({ type: 'mystery' } as any, 1, 10)).toBe(0);
  });

  it('logarithmic, with its winner multiplier and floor', () => {
    expect(pointsFor({ type: 'logarithmic', baseMultiplier: 10, winnerMultiplier: 1.5 }, 2, 12)).toBe(Math.floor(10 * Math.log(12)));
    expect(pointsFor({ type: 'logarithmic', baseMultiplier: 10, winnerMultiplier: 1.5 }, 1, 12)).toBe(Math.floor(10 * Math.log(13) * 1.5));
  });

  it('square root and linear', () => {
    expect(pointsFor({ type: 'squareRoot', baseMultiplier: 10, winnerMultiplier: 1 }, 1, 9)).toBe(30);
    expect(pointsFor({ type: 'linear', baseMultiplier: 10, winnerMultiplier: 1 }, 3, 10)).toBe(80);
  });

  it('fixed: bands first, then the old per-place array, then the defaults', () => {
    expect(pointsFor({ type: 'fixed', positionBands: [{ from: 1, to: 1, points: 100 }, { from: 2, to: null, points: 5 }] }, 4, 10)).toBe(5);
    expect(pointsFor({ type: 'fixed', positionPoints: [50, 30, 20] }, 2, 10)).toBe(30);
    // `fixedPoints` is never consulted — bandsOf supplies defaults first.
    expect(pointsFor({ type: 'fixed', fixedPoints: 7 }, 1, 10)).toBe(pointsFor({ type: 'fixed' }, 1, 10));
  });

  it('adds both bonuses to every scheme', () => {
    const f = { type: 'linear' as const, baseMultiplier: 1, winnerMultiplier: 1, knockoutPoints: 5, participationPoints: 2 };
    expect(pointsFor(f, 10, 10, 3)).toBe(1 + 15 + 2);
  });

  it('custom: binds all six variables', () => {
    expect(pointsFor({ type: 'custom', customFormula: 'p - f + k + b + c + z' }, 2, 10, 1, 20, 30, 200)).toBe(8 + 1 + 20 + 30 + 200);
  });

  // The failure path the extraction exposed: it used to return a bare 0.
  it('custom: a formula that fails for a place keeps the bonuses', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(pointsFor({ type: 'custom', customFormula: '100 / (p - f)', participationPoints: 2 }, 10, 10)).toBe(2);
    expect(pointsFor({ type: 'custom', customFormula: '', participationPoints: 2 }, 1, 10)).toBe(2);
    spy.mockRestore();
  });
});
