import { describe, it, expect } from 'vitest';
import {
  buyInOf,
  investedIn,
  bountyTakeFor,
  recordedStatsFor,
  bountyWinningsIn,
  totalsAcross,
  repricedForNewPlaces,
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

  // Reversed by the October audit (M5). This asserted a re-entry was "recorded
  // as its own result" — it is not; a re-entry reuses the same player and the
  // recorder writes one result per player per game, so this was excluding real
  // money from Invested, Profit and ROI.
  it('charges each re-entry at the buy-in', () => {
    expect(investedIn({ buyIn: 20, reEntries: 2 })).toBe(60);
  });

  it('charges a rebuy and an add-on at their own prices, not the buy-in', () => {
    expect(investedIn({ buyIn: 20, rebuys: 1, rebuyAmount: 10, addons: 1, addonAmount: 5 })).toBe(35);
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
      // The re-entry in the second game is a second buy-in (Oct M5).
      invested: 30 + (15 + 10) + 10,
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

/**
 * REPORTED FROM A REAL GAME, as the second half of the £3-bounty-showing-£6
 * round: the season standings' Bounties column read £0 for a night whose own
 * results table showed the bounty. `useTournament` writes `bountyWinnings` only
 * in the PROGRESSIVE branch, and the recorder passed that field straight
 * through — so an ordinary bounty game recorded nothing at all.
 */
describe('bountyTakeFor', () => {
  const standard = { enableBounties: true, bountyAmount: 3 };

  // THE MUTANT: return 0 for an ordinary bounty game, which is the bug.
  it('values an ordinary bounty at the head count times the price', () => {
    expect(bountyTakeFor({ knockouts: 2, position: 7 }, standard)).toEqual({ count: 2, money: 6 });
  });

  // THE MUTANT: drop the +1. The winner takes their own bounty back at the end,
  // which is why five bounties beside four knockouts is right for a champion —
  // and why the count and the money have to be worked out together.
  it('gives the winner their own bounty back', () => {
    expect(bountyTakeFor({ knockouts: 1, position: 1 }, standard)).toEqual({ count: 2, money: 6 });
  });

  // THE MUTANT: derive for progressive too. A bounty that GROWS cannot be
  // rebuilt from a head count and a starting price, so the accumulated figure is
  // the only honest one — plus the winner's own current bounty, which is what
  // both Payouts panels already did.
  it('prefers the stored figure for a progressive bounty', () => {
    const pko = { enableBounties: true, bountyAmount: 5, bountyType: 'progressive' as const };
    expect(bountyTakeFor({ knockouts: 3, position: 4, bountyWinnings: 12 }, pko))
      .toEqual({ count: 3, money: 12 });
    expect(bountyTakeFor({ knockouts: 2, position: 1, bountyWinnings: 8, currentBounty: 9 }, pko))
      .toEqual({ count: 3, money: 17 });
  });

  // A feature switched off for the whole tournament renders nothing — the rule
  // the Busted strip and the result columns already follow.
  it('is nothing at all when the game has no bounties', () => {
    expect(bountyTakeFor({ knockouts: 4, position: 1 }, { enableBounties: false, bountyAmount: 5 }))
      .toEqual({ count: 0, money: 0 });
    expect(bountyTakeFor({ knockouts: 4, position: 1 }, { enableBounties: true }))
      .toEqual({ count: 0, money: 0 });
    expect(bountyTakeFor(null, standard)).toEqual({ count: 0, money: 0 });
  });
});

describe('recordedStatsFor', () => {
  // The whole reason this is a function: the defect was in a call site inside
  // PokerTimer's recording effect, which has no test by construction.
  it('records the bounty money a league column can actually read', () => {
    const stats = recordedStatsFor(
      { knockouts: 2, position: 5, rebuys: 1, reEntries: 0, addons: 1 },
      { enableBounties: true, bountyAmount: 3, rebuyAmount: 10, addonAmount: 5 },
    );
    expect(stats).toEqual({
      rebuys: 1, reEntries: 0, addons: 1,
      bountyWinnings: 6, rebuyAmount: 10, addonAmount: 5,
    });
  });

  // `sanitizeForFirestore` turns undefined into NULL rather than stripping it,
  // which OVERWRITES whatever Firestore held — so every count is coerced.
  it('coerces every absent count rather than letting undefined through', () => {
    expect(recordedStatsFor({}, {})).toEqual({
      rebuys: 0, reEntries: 0, addons: 0,
      bountyWinnings: 0, rebuyAmount: 0, addonAmount: 0,
    });
    Object.values(recordedStatsFor(null, null)).forEach(v => expect(v).toBe(0));
  });
});

// October audit, M7: a renumbering moved the place and not the money.
describe('repricedForNewPlaces', () => {
  const payout = (pos: number) => ({ 1: 60, 2: 30, 3: 10 } as Record<number, number>)[pos] ?? 0;
  const bounties = { enableBounties: true, bountyAmount: 5 };

  it('takes the 3rd-place money away from somebody pushed down to 4th', () => {
    const before = [{ id: 'c', position: 3, prizeMoney: 10, knockouts: 0 }];
    const after = [{ id: 'c', position: 4, prizeMoney: 10, knockouts: 0 }];
    expect(repricedForNewPlaces(before, after, payout, null)[0].prizeMoney).toBe(0);
  });

  it('keeps their bounty money while it moves the payout', () => {
    const before = [{ id: 'c', position: 3, prizeMoney: 20, knockouts: 2 }];
    const after = [{ id: 'c', position: 2, prizeMoney: 20, knockouts: 2 }];
    expect(repricedForNewPlaces(before, after, payout, bounties)[0].prizeMoney).toBe(30 + 10);
  });

  it('leaves everybody whose place did not move exactly as they were', () => {
    const same = { id: 'a', position: 5, prizeMoney: 99, knockouts: 0 };
    const out = repricedForNewPlaces([same], [same], payout, null);
    expect(out[0]).toBe(same);
  });

  it('ignores players still in the game', () => {
    const playing = { id: 'p', position: undefined, prizeMoney: 0 };
    expect(repricedForNewPlaces([{ id: 'p', position: 4, prizeMoney: 0 }], [playing], payout, null)[0]).toBe(playing);
  });
});

// October audit, M5: a free game is a free game.
describe('buyInOf and a freeroll', () => {
  it('keeps a recorded zero at zero', () => {
    expect(buyInOf({ buyIn: 0 })).toBe(0);
    expect(investedIn({ buyIn: 0 })).toBe(0);
  });
  it('still falls back to 10 for a result that never recorded a price', () => {
    expect(buyInOf({})).toBe(10);
  });
});
