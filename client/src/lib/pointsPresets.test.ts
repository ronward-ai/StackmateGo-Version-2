import { describe, it, expect } from 'vitest';
import { POINTS_PRESETS, presetFor } from './pointsPresets';

/**
 * The presets are evaluated the way the app evaluates them — see
 * useLeagueSettings' calculatePoints — so a preset that would score 0 in a real
 * league fails here instead.
 */
const evaluate = (
  formula: string,
  f: number,
  p: number,
  { buyIn = 25, invested = 25 }: { buyIn?: number; invested?: number } = {},
): number => {
  const fn = new Function('f', 'p', 'k', 'b', 'c', 'z', 'Math', `"use strict"; return (${formula})`);
  const result = Number(fn(f, p, 0, buyIn, invested, buyIn * p, Math));
  // isFinite, not isNaN: a formula dividing by zero yields Infinity, which the
  // engine also has to reject. See useLeagueSettings.
  return Number.isFinite(result) ? Math.max(0, Math.floor(result)) : 0;
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

describe('Scales with the field', () => {
  const formula = POINTS_PRESETS.find(p => p.id === 'field-bands')!.formula;

  it('pays each band exactly, position by position', () => {
    // 36× the field for the win, then 24, 20, 16, 12, 10, 8, 6 — with 9th to
    // 15th on 2× and 16th to 20th on 1×. Nothing past twentieth.
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

describe('Rewards the bigger night', () => {
  const formula = POINTS_PRESETS.find(p => p.id === 'sqrt-field')!.formula;

  it('always scores last place exactly 1', () => {
    // The -9 in round(10*sqrt(p)/sqrt(f)) - 9 exists for this: at f === p the
    // bracket is 10 whatever the field size.
    for (let players = 2; players <= 40; players++) {
      expect(evaluate(formula, players, players)).toBe(1);
    }
  });

  it('pays more for the same finish in a bigger field', () => {
    expect(evaluate(formula, 1, 20)).toBeGreaterThan(evaluate(formula, 1, 10));
    expect(evaluate(formula, 3, 30)).toBeGreaterThan(evaluate(formula, 3, 12));
  });

  it('drops steeply from first to second', () => {
    expect(evaluate(formula, 1, 12)).toBe(26);
    expect(evaluate(formula, 2, 12)).toBe(15);
  });
});

describe('Rebuys cost you', () => {
  const formula = POINTS_PRESETS.find(p => p.id === 'cost-weighted')!.formula;

  it('takes points off for a rebuy, from the same finishing position', () => {
    // The whole point of the scheme, and the reason the scoring had to be given
    // the player's total cost before it could be offered.
    const clean = evaluate(formula, 3, 12, { buyIn: 25, invested: 25 });
    const rebought = evaluate(formula, 3, 12, { buyIn: 25, invested: 50 });
    expect(rebought).toBeLessThan(clean);
  });

  it('scores 0 rather than Infinity when nothing was invested', () => {
    // What the app did before the costs were wired through: c was 0 for every
    // result ever recorded, so this divided by zero.
    expect(evaluate(formula, 1, 12, { buyIn: 25, invested: 0 })).toBe(0);
  });

  it('pays more for a bigger field and a bigger buy-in', () => {
    expect(evaluate(formula, 1, 20)).toBeGreaterThan(evaluate(formula, 1, 10));
    expect(evaluate(formula, 1, 12, { buyIn: 50, invested: 50 }))
      .toBeGreaterThan(evaluate(formula, 1, 12, { buyIn: 25, invested: 25 }));
  });
});

describe('presetFor', () => {
  const preset = POINTS_PRESETS[0];

  it('recognises a formula it handed out', () => {
    expect(presetFor(preset.formula)?.id).toBe(preset.id);
  });

  it('does not claim an edited formula is still that scheme', () => {
    expect(presetFor(preset.formula.replace('36', '40'))).toBeNull();
  });

  it('is exact — whitespace makes it a different formula, because it is', () => {
    expect(presetFor(` ${preset.formula} `)).toBeNull();
  });

  it('has nothing to say about an empty box', () => {
    expect(presetFor('')).toBeNull();
    expect(presetFor('   ')).toBeNull();
    expect(presetFor(null)).toBeNull();
    expect(presetFor(undefined)).toBeNull();
  });

  it('recognises every preset it holds', () => {
    for (const p of POINTS_PRESETS) {
      expect(presetFor(p.formula)?.id).toBe(p.id);
    }
  });
});
