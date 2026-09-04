/**
 * What a league result says a player spent and collected.
 *
 * These four numbers — rebuys, re-entries, add-ons and bounty winnings — were
 * displayed as 0 for every player in every league, forever. Not broken
 * arithmetic: nothing ever wrote them. The tournament tracks all of them live on
 * the player, and the recording path dropped them on the way to Firestore, while
 * the read path had a whitelist that would have stripped them anyway.
 *
 * The money columns went wrong with them. Investment is buy-in PLUS what the
 * player put in again, so with rebuys and add-ons pinned at 0 a player who
 * rebought three times showed their buy-in alone, and Invested, Profit and ROI
 * were all understated.
 *
 * Kept free of React and Firebase, per the lib/ convention, so the arithmetic can
 * be tested without mocking either.
 */

/** The result fields these functions read. Structural, so `TournamentResult`
 *  satisfies it without this module importing the hook that defines it. */
export interface ResultCosts {
  buyIn?: number;
  buyInAmount?: number;
  rebuys?: number;
  rebuyAmount?: number;
  addons?: number;
  addonAmount?: number;
  reEntries?: number;
  bountyWinnings?: number;
  /** Older documents that happen to carry a bounty figure under another name. */
  bountyWon?: number;
  bountiesWon?: number;
}

/**
 * The buy-in a result was played for.
 *
 * Falls back to 10 when the document records none. That default predates this
 * module and is deliberately preserved: results written before `buyIn` was
 * stored would otherwise drop to 0 and rewrite the history of every old league.
 */
export function buyInOf(result: ResultCosts): number {
  return result.buyIn || result.buyInAmount || 10;
}

/**
 * What the player put into this tournament in total.
 *
 * A rebuy or add-on with no recorded price is charged at the buy-in — the
 * closest thing to right for a document written before the prices were stored,
 * and much closer than charging nothing.
 */
export function investedIn(result: ResultCosts): number {
  const buyIn = buyInOf(result);
  const rebuys = (result.rebuys || 0) * (result.rebuyAmount || buyIn);
  const addons = (result.addons || 0) * (result.addonAmount || buyIn);
  return buyIn + rebuys + addons;
}

/** Bounty money this result credits the player with. */
export function bountyWinningsIn(result: ResultCosts): number {
  return result.bountyWinnings || result.bountyWon || result.bountiesWon || 0;
}

export interface ResultTotals {
  rebuys: number;
  reEntries: number;
  addons: number;
  bountyWinnings: number;
  invested: number;
}

/** The same figures summed over every result a player has. */
export function totalsAcross(results: ResultCosts[]): ResultTotals {
  return results.reduce<ResultTotals>(
    (totals, result) => ({
      rebuys: totals.rebuys + (result.rebuys || 0),
      reEntries: totals.reEntries + (result.reEntries || 0),
      addons: totals.addons + (result.addons || 0),
      bountyWinnings: totals.bountyWinnings + bountyWinningsIn(result),
      invested: totals.invested + investedIn(result),
    }),
    { rebuys: 0, reEntries: 0, addons: 0, bountyWinnings: 0, invested: 0 },
  );
}
