import { describe, it, expect } from 'vitest';
import { calculatePrizePool, countEntries, entryCosts, prizePoolFor } from './prizePool';

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

describe('countEntries', () => {
  it('is all zeroes for an empty roster', () => {
    expect(countEntries([])).toEqual({
      playerCount: 0, totalRebuys: 0, totalAddons: 0, totalReEntries: 0,
    });
  });

  it('defaults a missing roster to empty', () => {
    expect(countEntries().playerCount).toBe(0);
  });

  it('counts players and sums what they put in again', () => {
    expect(countEntries([
      { rebuys: 2, addons: 1 },
      { reEntries: 1 },
      {},
    ])).toEqual({ playerCount: 3, totalRebuys: 2, totalAddons: 1, totalReEntries: 1 });
  });
});

describe('entryCosts', () => {
  it('takes a percentage of the buy-in, rounded down', () => {
    expect(entryCosts({ buyIn: 25, rakePercentage: 10 }).perEntryRake).toBe(2);
  });

  it('takes a fixed fee when configured', () => {
    expect(entryCosts({ buyIn: 25, rakeType: 'fixed', rakeAmount: 5 }).perEntryRake).toBe(5);
  });

  it('is 0 with no structure at all', () => {
    expect(entryCosts()).toEqual({
      perEntryRake: 0, rebuyRake: 0, reEntryRake: 0, rebuyBounty: 0, reEntryBounty: 0,
    });
  });

  // The asymmetry the copy-pasted sites kept re-spelling, and the reason to have
  // it in one place: a re-entry is a fresh entry and is raked by default; a rebuy
  // is not.
  it('rakes a re-entry by default and a rebuy not', () => {
    const costs = entryCosts({ buyIn: 10, rakePercentage: 10 });
    expect(costs.reEntryRake).toBe(1);
    expect(costs.rebuyRake).toBe(0);
  });

  it('honours an explicit choice either way', () => {
    expect(entryCosts({ buyIn: 10, rakePercentage: 10, reEntryRake: false }).reEntryRake).toBe(0);
    expect(entryCosts({ buyIn: 10, rakePercentage: 10, rebuyRake: true }).rebuyRake).toBe(1);
  });

  it('uses a specific rebuy or re-entry fee over the per-entry one', () => {
    const costs = entryCosts({
      buyIn: 10, rakePercentage: 10,
      rebuyRake: true, rebuyRakeAmount: 3,
      reEntryRake: true, reEntryRakeAmount: 4,
    });
    expect(costs.rebuyRake).toBe(3);
    expect(costs.reEntryRake).toBe(4);
  });

  it('adds no bounty unless bounties are enabled', () => {
    const off = entryCosts({ bountyAmount: 5, rebuyBounty: true });
    expect(off.rebuyBounty).toBe(0);
    expect(off.reEntryBounty).toBe(0);
  });

  it('gives a re-entry a bounty by default once bounties are on, a rebuy not', () => {
    const costs = entryCosts({ enableBounties: true, bountyAmount: 5 });
    expect(costs.reEntryBounty).toBe(5);
    expect(costs.rebuyBounty).toBe(0);
  });
});

describe('prizePoolFor', () => {
  const structure = {
    buyIn: 10, rebuyAmount: 10, addonAmount: 5,
    rakeType: 'percentage' as const, rakePercentage: 10,
  };

  it('is an empty pool for an empty roster', () => {
    expect(prizePoolFor([], structure)).toEqual({ gross: 0, rake: 0, net: 0 });
  });

  it('survives a game with no prize structure yet', () => {
    expect(prizePoolFor([{}, {}])).toEqual({ gross: 0, rake: 0, net: 0 });
  });

  it('adds buy-ins, rebuys, add-ons and re-entries', () => {
    const pool = prizePoolFor(
      [{ rebuys: 1 }, { addons: 1 }, { reEntries: 1 }],
      structure,
    );
    expect(pool.gross).toBe(30 + 10 + 5 + 10);
  });

  // Rake is charged ON TOP of the buy-in, so it must never come out of the pool.
  // completeTournament subtracted it, which is the disagreement this replaces.
  it('REGRESSION: rake never reduces the pool', () => {
    const pool = prizePoolFor([{}, {}, {}], structure);
    expect(pool.rake).toBe(3);
    expect(pool.net).toBe(pool.gross);
    expect(pool.net).toBe(30);
  });

  it('agrees with calculatePrizePool given the same game', () => {
    const players = [{ rebuys: 2 }, { reEntries: 1 }, { addons: 1 }];
    expect(prizePoolFor(players, { ...structure, rebuyRake: true })).toEqual(
      calculatePrizePool({
        buyIn: 10, playerCount: 3,
        totalRebuys: 2, rebuyAmount: 10,
        totalAddons: 1, addonAmount: 5,
        totalReEntries: 1,
        reEntryRake: true, reEntryRakeAmount: 1,
        rebuyRake: true, rebuyRakeAmount: 1,
        rakeType: 'percentage', rakePercentage: 10, rakeAmount: 0,
      }),
    );
  });

  it('charges a fixed rake per player, not once', () => {
    const pool = prizePoolFor([{}, {}, {}, {}, {}], {
      buyIn: 10, rakeType: 'fixed', rakeAmount: 5,
    });
    expect(pool.rake).toBe(25);
  });
});
