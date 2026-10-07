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
  // An ABSENT price is a document older than the field, and falls back to 10 so
  // old leagues do not move. A ZERO is a free game, and stays zero: `0 || 10`
  // recorded every freeroll as a £10 game, so a free league showed −£10 and
  // −100% ROI for everybody, every week (October audit, M5) — the bug the Buy-in
  // tab's `??` was fixed for, arriving at the recorder.
  if (typeof result.buyIn === 'number') return result.buyIn;
  if (typeof result.buyInAmount === 'number') return result.buyInAmount;
  return 10;
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
  // A re-entry is another buy-in, and it is charged here (October audit, M5).
  // It used to be left out on the grounds that "a re-entry is recorded as its
  // own result" — it is not: processReEntry reuses the same player, and the
  // recorder writes one result per player per game. So a player who re-entered
  // twice showed +£40 profit having broken even, while the prize pool counted
  // both re-entries.
  const reEntries = (result.reEntries || 0) * buyIn;
  return buyIn + rebuys + addons + reEntries;
}

/** Bounty money this result credits the player with. */
export function bountyWinningsIn(result: ResultCosts): number {
  return result.bountyWinnings || result.bountyWon || result.bountiesWon || 0;
}

/**
 * Did this result finish IN THE MONEY — a place that paid, as opposed to
 * collecting only bounties? (October audit, Low.)
 *
 * `prizeMoney` is everything collected, and `bountyWinnings` says how much of
 * that was bounty — the contract recorded in CLAUDE.md. The league's ITM % and
 * Current streak tested the total, so a player out in 9th with one bounty
 * "cashed". Taking the bounty back out leaves the place's payout.
 *
 * Results recorded before ordinary bounties were written carry
 * `bountyWinnings: 0`, so their total is their prize and nothing changes.
 */
export function cashedIn(result: ResultCosts & Record<string, any>): boolean {
  const collected = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings || 0;
  return collected - bountyWinningsIn(result) > 0;
}

/**
 * What a player's bounties are worth, and how many heads that is.
 *
 * **ONE derivation, because there were four and one of them wrote to the
 * database.** `lib/resultRows.ts` had it inline for the results table, both
 * Payouts panels (`TournamentInfoCard`, `ParticipantTournamentInfoCard`) had an
 * identical copy each, and `PokerTimer`'s league recorder had none at all — it
 * passed `player.bountyWinnings`, which `useTournament` only ever writes in the
 * PROGRESSIVE branch. So an ordinary bounty game showed the money on the night
 * and recorded **£0** into the season's Bounties column, for every league.
 *
 * **The winner takes their own bounty back**, which is the `+1`: five bounties
 * beside four knockouts is correct for a champion, and the count multiplies out
 * against the money on the same row.
 *
 * **Progressive prefers the STORED figure**, the `payoutsOf()` trade. A bounty
 * that grows cannot be re-derived from a head count and a starting price, so the
 * accumulated `bountyWinnings` is the only honest number — plus the winner's own
 * current bounty, which is what both Payouts panels already did.
 */
export interface BountyPlayerLike {
  knockouts?: number;
  position?: number | null;
  bountyWinnings?: number;
  currentBounty?: number;
  /** Knockouts of players carrying no bounty, which pay nothing. */
  bountylessKnockouts?: number;
}

export interface BountyStructureLike {
  enableBounties?: boolean;
  bountyAmount?: number;
  bountyType?: 'standard' | 'progressive' | string;
}

export function bountyTakeFor(
  player: BountyPlayerLike | null | undefined,
  structure: BountyStructureLike | null | undefined,
): { count: number; money: number } {
  // A feature switched off for the whole tournament renders nothing — the rule
  // the Busted strip and the result columns already follow.
  if (!player || !structure?.enableBounties || !structure?.bountyAmount) {
    return { count: 0, money: 0 };
  }
  const knockouts = Number(player.knockouts) || 0;
  const isWinner = Number(player.position) === 1;

  // `??`, never `||`: a stored 0 means "carries no bounty" — a rebuy or re-entry
  // taken without a fresh one — and `0 ||` turned it back into a full bounty, so
  // a winner who never bought one was paid their own bounty back (October audit,
  // M6). Absent still means the standard amount, for games stored before it.
  const ownBounty = player.currentBounty ?? structure.bountyAmount;

  if (structure.bountyType === 'progressive') {
    const count = knockouts + (isWinner ? 1 : 0);
    const winnings = Number(player.bountyWinnings) || 0;
    return { count, money: winnings + (isWinner ? Number(ownBounty) || 0 : 0) };
  }
  // A standard bounty pays per knockout — but only for a player who carried
  // one. Knocking out somebody who rebought without a bounty used to pay out
  // money that was never collected.
  const paying = Math.max(0, knockouts - (Number(player.bountylessKnockouts) || 0));
  const count = paying + (isWinner && ownBounty ? 1 : 0);
  return { count, money: count * structure.bountyAmount };
}

/**
 * What the league recorder writes about one player's night.
 *
 * It is a function rather than a literal inside `PokerTimer`'s recording effect
 * because that is where the bug above actually lived: a 1,900-line page effect
 * has no test by construction, and this file does. The same argument
 * `lib/tableBalance.ts` and `lib/seating.ts` were extracted on.
 *
 * `bountyWinnings` is the BREAKDOWN, not an addend: `prizeMoney` already carries
 * the bounty money (`eliminatePlayer` folds it in at the bust-out), so this says
 * how much of that total was bounty. Anything adding the two together is the
 * double-count the Won column was reported for.
 */
export function recordedStatsFor(
  player: (BountyPlayerLike & { rebuys?: number; reEntries?: number; addons?: number }) | null | undefined,
  structure: (BountyStructureLike & { rebuyAmount?: number; addonAmount?: number }) | null | undefined,
): {
  rebuys: number; reEntries: number; addons: number;
  bountyWinnings: number; rebuyAmount: number; addonAmount: number;
} {
  // `|| 0` on every count, because `sanitizeForFirestore` turns `undefined` into
  // NULL rather than stripping it — which OVERWRITES whatever Firestore held.
  return {
    rebuys: player?.rebuys || 0,
    reEntries: player?.reEntries || 0,
    addons: player?.addons || 0,
    bountyWinnings: bountyTakeFor(player, structure).money,
    rebuyAmount: structure?.rebuyAmount || 0,
    addonAmount: structure?.addonAmount || 0,
  };
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

/**
 * Re-price every finisher whose PLACE changed (October audit, M7).
 *
 * A player's stored `prizeMoney` is everything they collected — the payout for
 * the place they finished in, plus their bounty money — and it was fixed at the
 * moment they busted. When a re-entry, an undo, a late entry or a removal then
 * renumbered the places, the position moved and the money did not. With three
 * paid, a 3rd-place finisher pushed down to 4th kept the 3rd-place money; the
 * results table falls back to the stored figure outside the places, the league
 * recorded it as Cash, and the eventual 3rd was paid as well — the 3rd-place
 * money, twice.
 *
 * So a moved finisher's money is rebuilt: the payout for the place they now hold,
 * from the pool as it stands, plus the bounty money from `bountyTakeFor`, the one
 * derivation of it. Players whose place did not change keep their figure
 * untouched, by identity.
 */
export function repricedForNewPlaces<T extends { id: string; position?: number | null; prizeMoney?: number } & BountyPlayerLike>(
  before: readonly T[],
  after: T[],
  payoutFor: (position: number) => number,
  structure: BountyStructureLike | null | undefined,
): T[] {
  const was = new Map(before.map(p => [p.id, p.position]));
  return after.map(p => {
    const pos = Number(p.position);
    if (!(pos > 0) || was.get(p.id) === p.position) return p;
    return { ...p, prizeMoney: payoutFor(pos) + bountyTakeFor(p, structure).money };
  });
}
