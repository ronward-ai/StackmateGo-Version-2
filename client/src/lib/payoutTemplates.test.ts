import { describe, it, expect } from 'vitest';
import { topPercentPayouts, paidPlacesFor, payoutsOf, withNormalisedPayouts } from './payoutTemplates';

describe('paidPlacesFor', () => {
  it('pays roughly the top 10%', () => {
    expect(paidPlacesFor(20)).toBe(2);
    expect(paidPlacesFor(30)).toBe(3);
    expect(paidPlacesFor(100)).toBe(10);
  });

  it('always pays at least one place', () => {
    expect(paidPlacesFor(1)).toBe(1);
    expect(paidPlacesFor(5)).toBe(1);
  });

  it('never pays more places than there are players', () => {
    expect(paidPlacesFor(2)).toBeLessThanOrEqual(2);
  });

  it('falls back to a sane default for nonsense input', () => {
    expect(paidPlacesFor(0)).toBe(1);
    expect(paidPlacesFor(-5)).toBe(1);
    expect(paidPlacesFor(NaN)).toBe(1);
  });
});

describe('topPercentPayouts', () => {
  // The three invariants. Checked across every realistic field size, because
  // the bug this replaces was correct at small sizes and wrong at larger ones —
  // testing one field size would have missed it.
  describe('invariants hold for every field size from 2 to 200', () => {
    const sizes = Array.from({ length: 199 }, (_, i) => i + 2);

    it('always totals exactly 100', () => {
      for (const n of sizes) {
        const total = topPercentPayouts(n).reduce((sum, p) => sum + p.percentage, 0);
        expect(total, `field of ${n}`).toBe(100);
      }
    });

    it('never pays a later place more than an earlier one', () => {
      for (const n of sizes) {
        const pcts = topPercentPayouts(n).map(p => p.percentage);
        for (let i = 1; i < pcts.length; i++) {
          expect(pcts[i], `field of ${n}, position ${i + 1}`).toBeLessThanOrEqual(pcts[i - 1]);
        }
      }
    });

    it('never pays a place less than 1%', () => {
      for (const n of sizes) {
        for (const slot of topPercentPayouts(n)) {
          expect(slot.percentage, `field of ${n}, position ${slot.position}`).toBeGreaterThanOrEqual(1);
        }
      }
    });

    it('numbers positions from 1 with no gaps', () => {
      for (const n of sizes) {
        const positions = topPercentPayouts(n).map(p => p.position);
        expect(positions, `field of ${n}`).toEqual(positions.map((_, i) => i + 1));
      }
    });
  });

  // The specific cases the old implementation got wrong.
  describe('the field sizes the previous implementation broke on', () => {
    it('20 players: second place no longer beats first (was 40/60)', () => {
      const pcts = topPercentPayouts(20).map(p => p.percentage);
      expect(pcts).toHaveLength(2);
      expect(pcts[0]).toBeGreaterThan(pcts[1]);
    });

    it('30 players: third place no longer beats second (was 40/25/35)', () => {
      const pcts = topPercentPayouts(30).map(p => p.percentage);
      expect(pcts).toHaveLength(3);
      expect(pcts[1]).toBeGreaterThanOrEqual(pcts[2]);
    });

    it('80 players: last place is no longer negative (was -20)', () => {
      const pcts = topPercentPayouts(80).map(p => p.percentage);
      expect(pcts).toHaveLength(8);
      expect(Math.min(...pcts)).toBeGreaterThan(0);
    });
  });

  it('gives the whole pool to the winner when only one place pays', () => {
    expect(topPercentPayouts(10)).toEqual([{ position: 1, percentage: 100 }]);
  });

  it('keeps a recognisable poker shape — the winner takes the largest share', () => {
    const pcts = topPercentPayouts(100).map(p => p.percentage);
    expect(pcts[0]).toBeGreaterThan(25);
    expect(pcts[0]).toBeGreaterThan(pcts[1]);
  });
});

describe('payoutsOf', () => {
  const PAYOUTS = [
    { position: 1, percentage: 60 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 10 },
  ];

  it('reads manualPayouts, which is what the app pays from', () => {
    expect(payoutsOf({ manualPayouts: PAYOUTS })).toEqual(PAYOUTS);
  });

  // The regression. The default prize structure wrote its 60/30/10 into
  // `structure`, which nothing in the app reads, so a game run straight from
  // the defaults paid nobody and showed no money chip or Payouts panel.
  it('REGRESSION: falls back to a structure saved under the legacy field', () => {
    expect(payoutsOf({ structure: PAYOUTS })).toEqual(PAYOUTS);
  });

  it('prefers manualPayouts and does not merge the two', () => {
    const legacy = [{ position: 1, percentage: 100 }];
    expect(payoutsOf({ manualPayouts: PAYOUTS, structure: legacy })).toEqual(PAYOUTS);
  });

  it('is empty for a structure with neither, or none at all', () => {
    expect(payoutsOf({})).toEqual([]);
    expect(payoutsOf(undefined)).toEqual([]);
    expect(payoutsOf(null)).toEqual([]);
    expect(payoutsOf({ manualPayouts: [] })).toEqual([]);
  });

  it('treats an empty manualPayouts as absent, so the legacy field still counts', () => {
    expect(payoutsOf({ manualPayouts: [], structure: PAYOUTS })).toEqual(PAYOUTS);
  });
});

describe('withNormalisedPayouts', () => {
  const PAYOUTS = [{ position: 1, percentage: 100 }];

  /** The shape a stored prize structure actually has: either field, or neither. */
  type Stored = {
    buyIn?: number;
    enableBounties?: boolean;
    manualPayouts?: { position: number; percentage: number }[];
    structure?: { position: number; percentage: number }[];
  };

  it('moves legacy payouts into the field the app reads', () => {
    const stored: Stored = { buyIn: 10, structure: PAYOUTS };
    expect(withNormalisedPayouts(stored).manualPayouts).toEqual(PAYOUTS);
  });

  it('keeps every other field of the prize structure', () => {
    const stored: Stored = { buyIn: 25, enableBounties: true, structure: PAYOUTS };
    const normalised = withNormalisedPayouts(stored);
    expect(normalised.buyIn).toBe(25);
    expect(normalised.enableBounties).toBe(true);
  });

  it('leaves a structure with no payouts at all alone', () => {
    const bare: Stored = { buyIn: 10 };
    expect(withNormalisedPayouts(bare)).toBe(bare);
  });
});
