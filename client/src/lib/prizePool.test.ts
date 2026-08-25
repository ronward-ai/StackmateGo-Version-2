import { describe, it, expect } from 'vitest';
import { calculatePrizePool } from './prizePool';

/**
 * Characterisation tests for the canonical prize pool calculation.
 *
 * Rake here is a house fee charged ON TOP of the buy-in, so it is never
 * deducted from the pool — `net` equals `gross` by design. Confirmed by the
 * entry breakdowns in TablesSection, which show players paying buyIn + rake.
 *
 * These lock in the behaviour the director's TournamentInfoCard, BuyInSection
 * and ParticipantTournamentInfoCard all rely on.
 */

describe('calculatePrizePool', () => {
  describe('gross pool', () => {
    it('sums buy-ins', () => {
      expect(calculatePrizePool({ buyIn: 20, playerCount: 8 }).gross).toBe(160);
    });

    it('includes rebuys, addons and re-entries', () => {
      const { gross } = calculatePrizePool({
        buyIn: 20,
        playerCount: 8,
        totalRebuys: 3, rebuyAmount: 20,
        totalAddons: 2, addonAmount: 10,
        totalReEntries: 1,
      });
      // 160 buy-ins + 60 rebuys + 20 addons + 20 re-entry
      expect(gross).toBe(260);
    });

    it('prices re-entries at the buy-in', () => {
      expect(calculatePrizePool({ buyIn: 25, playerCount: 2, totalReEntries: 2 }).gross).toBe(100);
    });
  });

  describe('rake is charged per entry, not on the pool', () => {
    it('multiplies a percentage rake by the player count', () => {
      // 10% of a 20 buy-in = 2 per player, 8 players = 16
      const { rake } = calculatePrizePool({
        buyIn: 20, playerCount: 8, rakeType: 'percentage', rakePercentage: 10,
      });
      expect(rake).toBe(16);
    });

    it('multiplies a fixed rake by the player count', () => {
      // The divergent implementation removed from useTournament charged this
      // once rather than per player — 5 instead of 50.
      const { rake } = calculatePrizePool({
        buyIn: 20, playerCount: 10, rakeType: 'fixed', rakeAmount: 5,
      });
      expect(rake).toBe(50);
    });

    it('does not rake rebuy or addon money by default', () => {
      const withExtras = calculatePrizePool({
        buyIn: 20, playerCount: 4, rakeType: 'percentage', rakePercentage: 10,
        totalRebuys: 10, rebuyAmount: 20, totalAddons: 10, addonAmount: 20,
      });
      const without = calculatePrizePool({
        buyIn: 20, playerCount: 4, rakeType: 'percentage', rakePercentage: 10,
      });
      expect(withExtras.rake).toBe(without.rake);
    });

    it('rakes rebuys only when rebuyRake is enabled', () => {
      const base = { buyIn: 20, playerCount: 4, rakeType: 'percentage' as const, rakePercentage: 10, totalRebuys: 5 };
      expect(calculatePrizePool(base).rake).toBe(8);
      // 8 base + 5 rebuys x 2 (falls back to the per-entry rake)
      expect(calculatePrizePool({ ...base, rebuyRake: true }).rake).toBe(18);
      // explicit rebuy rake overrides the per-entry fallback
      expect(calculatePrizePool({ ...base, rebuyRake: true, rebuyRakeAmount: 1 }).rake).toBe(13);
    });

    it('rakes re-entries only when reEntryRake is enabled', () => {
      const base = { buyIn: 20, playerCount: 4, rakeType: 'percentage' as const, rakePercentage: 10, totalReEntries: 3 };
      expect(calculatePrizePool(base).rake).toBe(8);
      expect(calculatePrizePool({ ...base, reEntryRake: true }).rake).toBe(14);
      expect(calculatePrizePool({ ...base, reEntryRake: true, reEntryRakeAmount: 5 }).rake).toBe(23);
    });

    it('defaults to percentage when no rakeType is given', () => {
      expect(calculatePrizePool({ buyIn: 100, playerCount: 2, rakePercentage: 5 }).rake).toBe(10);
    });

    it('is zero when no rake is configured', () => {
      expect(calculatePrizePool({ buyIn: 20, playerCount: 8 }).rake).toBe(0);
    });

    it('floors the per-entry rake before multiplying', () => {
      // 7% of 25 = 1.75 -> floors to 1 per entry, so 4 across 4 players.
      // Raking the pool instead would give floor(100 * 0.07) = 7.
      expect(calculatePrizePool({
        buyIn: 25, playerCount: 4, rakeType: 'percentage', rakePercentage: 7,
      }).rake).toBe(4);
    });
  });

  describe('net', () => {
    it('equals gross — rake sits on top of the buy-in and never reduces the pool', () => {
      const r = calculatePrizePool({
        buyIn: 20, playerCount: 8, rakeType: 'percentage', rakePercentage: 10,
      });
      expect(r.net).toBe(r.gross);
      expect(r.net).toBe(160);
    });
  });

  describe('edge cases', () => {
    it('handles an empty tournament', () => {
      expect(calculatePrizePool({ buyIn: 20, playerCount: 0 })).toEqual({ gross: 0, rake: 0, net: 0 });
    });

    it('handles a zero buy-in freeroll', () => {
      const r = calculatePrizePool({ buyIn: 0, playerCount: 10, rakeType: 'percentage', rakePercentage: 10 });
      expect(r.gross).toBe(0);
      expect(r.rake).toBe(0);
    });
  });
});
