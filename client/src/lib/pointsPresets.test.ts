import { describe, it, expect } from 'vitest';
import { POINTS_PRESETS } from './pointsPresets';

/**
 * The presets are evaluated the way the app evaluates them — see
 * useLeagueSettings' calculatePoints — so a preset that would score 0 in a real
 * league fails here instead.
 */
const evaluate = (formula: string, f: number, p: number): number => {
  const fn = new Function('f', 'p', 'k', 'b', 'c', 'z', 'Math', `"use strict"; return (${formula})`);
  const result = Number(fn(f, p, 0, 25, 25, 250, Math));
  return Number.isNaN(result) ? 0 : Math.max(0, Math.floor(result));
};

describe('every preset', () => {
  it('evaluates to a number rather than throwing', () => {
    for (const preset of POINTS_PRESETS) {
      for (let p = 2; p <= 30; p++) {
        for (let f = 1; f <= p; f++) {
          expect(Number.isFinite(evaluate(preset.formula, f, p))).toBe(true);
        }
      }
    }
  });

  it('never scores a later finish above an earlier one', () => {
    for (const preset of POINTS_PRESETS) {
      for (let p = 2; p <= 30; p++) {
        for (let f = 2; f <= p; f++) {
          expect(evaluate(preset.formula, f, p)).toBeLessThanOrEqual(evaluate(preset.formula, f - 1, p));
        }
      }
    }
  });
});

describe('Tournament Director (classic)', () => {
  const formula = POINTS_PRESETS.find(p => p.id === 'td-classic')!.formula;

  it('matches the original switch, band for band', () => {
    // switch(r, 1, n*36, 2, n*24, 3, n*20, 4, n*16, 5, n*12, 6, n*10,
    //           7, n*8, 8, n*6, 9…15, n*2, 16…20, n, 0)
    const multiplier = (position: number): number => {
      const table: Record<number, number> = { 1: 36, 2: 24, 3: 20, 4: 16, 5: 12, 6: 10, 7: 8, 8: 6 };
      if (table[position]) return table[position];
      if (position <= 15) return 2;
      if (position <= 20) return 1;
      return 0;
    };

    for (let players = 2; players <= 40; players++) {
      for (let position = 1; position <= 25; position++) {
        expect(evaluate(formula, position, players)).toBe(players * multiplier(position));
      }
    }
  });

  it('pays nothing past twentieth', () => {
    expect(evaluate(formula, 20, 30)).toBe(30);
    expect(evaluate(formula, 21, 30)).toBe(0);
    expect(evaluate(formula, 99, 30)).toBe(0);
  });

  it('scales with the field, which is the point of it', () => {
    expect(evaluate(formula, 1, 10)).toBe(360);
    expect(evaluate(formula, 1, 20)).toBe(720);
  });
});
