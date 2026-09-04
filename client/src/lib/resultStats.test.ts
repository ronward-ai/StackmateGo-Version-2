import { describe, it, expect } from 'vitest';
import {
  buyInOf,
  investedIn,
  bountyWinningsIn,
  totalsAcross,
  type ResultCosts,
} from './resultStats';

describe('buyInOf', () => {
  it('reads the recorded buy-in', () => {
    expect(buyInOf({ buyIn: 25 })).toBe(25);
  });

  it('accepts the legacy buyInAmount spelling', () => {
    expect(buyInOf({ buyInAmount: 15 })).toBe(15);
  });

  // Results predate the buy-in being stored. Dropping to 0 would rewrite the
  // financial history of every old league.
  it('falls back to 10 when nothing is recorded', () => {
    expect(buyInOf({})).toBe(10);
  });
});

describe('investedIn', () => {
  it('is the buy-in for a player who never bought in again', () => {
    expect(investedIn({ buyIn: 20 })).toBe(20);
  });

  it('adds rebuys at their own price', () => {
    expect(investedIn({ buyIn: 20, rebuys: 3, rebuyAmount: 10 })).toBe(50);
  });

  it('adds add-ons at their own price', () => {
    expect(investedIn({ buyIn: 20, addons: 1, addonAmount: 5 })).toBe(25);
  });

  it('adds both together', () => {
    expect(investedIn({ buyIn: 20, rebuys: 2, rebuyAmount: 10, addons: 1, addonAmount: 5 }))
      .toBe(45);
  });

  it('charges a rebuy or add-on with no recorded price at the buy-in', () => {
    expect(investedIn({ buyIn: 20, rebuys: 2 })).toBe(60);
    expect(investedIn({ buyIn: 20, addons: 1 })).toBe(40);
  });

  // The reported bug: with rebuys absent, a player who rebought three times
  // showed their buy-in alone, and Profit and ROI moved with it.
  it('REGRESSION: a rebuying player is not charged their buy-in alone', () => {
    const withData: ResultCosts = { buyIn: 10, rebuys: 3, rebuyAmount: 10 };
    expect(investedIn(withData)).toBe(40);
    expect(investedIn(withData)).toBeGreaterThan(investedIn({ buyIn: 10 }));
  });

  it('ignores a re-entry, which is recorded as its own result', () => {
    expect(investedIn({ buyIn: 20, reEntries: 2 })).toBe(20);
  });
});

describe('bountyWinningsIn', () => {
  it('reads bountyWinnings', () => {
    expect(bountyWinningsIn({ bountyWinnings: 15 })).toBe(15);
  });

  it('accepts the older spellings', () => {
    expect(bountyWinningsIn({ bountyWon: 5 })).toBe(5);
    expect(bountyWinningsIn({ bountiesWon: 7 })).toBe(7);
  });

  it('is 0 when a game had no bounties', () => {
    expect(bountyWinningsIn({})).toBe(0);
  });
});

describe('totalsAcross', () => {
  const season: ResultCosts[] = [
    { buyIn: 10, rebuys: 2, rebuyAmount: 10, bountyWinnings: 5 },
    { buyIn: 10, addons: 1, addonAmount: 5, reEntries: 1 },
    { buyIn: 10 },
  ];

  it('is all zeroes for a player with no results', () => {
    expect(totalsAcross([])).toEqual({
      rebuys: 0, reEntries: 0, addons: 0, bountyWinnings: 0, invested: 0,
    });
  });

  it('sums each figure over the season', () => {
    expect(totalsAcross(season)).toEqual({
      rebuys: 2,
      reEntries: 1,
      addons: 1,
      bountyWinnings: 5,
      invested: 30 + 15 + 10,
    });
  });

  it('agrees with investedIn result by result', () => {
    const summed = season.reduce((sum, r) => sum + investedIn(r), 0);
    expect(totalsAcross(season).invested).toBe(summed);
  });

  // Historical results carry none of these fields, and must stay at 0 rather
  // than turning into NaN and blanking the whole column.
  it('treats a result with no data at all as zero, never NaN', () => {
    const totals = totalsAcross([{}, {}]);
    expect(totals.rebuys).toBe(0);
    expect(totals.bountyWinnings).toBe(0);
    expect(Number.isNaN(totals.invested)).toBe(false);
    expect(totals.invested).toBe(20); // two games at the fallback buy-in
  });

  it('does not mutate the results it is given', () => {
    const results: ResultCosts[] = [{ buyIn: 10, rebuys: 1 }];
    totalsAcross(results);
    expect(results).toEqual([{ buyIn: 10, rebuys: 1 }]);
  });
});
