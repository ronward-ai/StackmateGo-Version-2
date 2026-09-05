/**
 * Chopping the remaining prize money.
 *
 * Two ways of splitting what is left when the last players agree a deal:
 *
 *  - **ICM** (Malmuth-Harville) values a stack by the money it is expected to
 *    win, treating the chance of finishing in each paid place as proportional
 *    to chips. It shades money from the chip leader towards the short stacks,
 *    because in a tournament a chip is worth less the more of them you have —
 *    doubling your stack does not double your equity.
 *  - **Proportional** simply splits the money by chip share.
 *
 * The two disagree by design; both must at least be splitting the SAME pot,
 * which is the bug this module exists to fix. ICM competed for the top n
 * payouts while the proportional chop divided the entire prize pool, so with
 * six paid places and three players left it shared out the money already owed
 * to 4th, 5th and 6th.
 *
 * Free of React, per the lib/ convention: this decides who gets paid what, so
 * it wants tests rather than a component to be poked by hand.
 */

/**
 * How many places actually pay.
 *
 * Trailing zeros are trimmed. Not cosmetic: ICM recurses once per payout, so
 * padding the array out to the player count made nine players enumerate 9!
 * ≈ 363,000 orderings to compute equities that are zero past third place.
 */
export function payingPlaces(payouts: number[]): number[] {
  let last = payouts.length;
  while (last > 0 && !(payouts[last - 1] > 0)) last--;
  return payouts.slice(0, last);
}

/**
 * The money the remaining players are playing for: the top `playerCount`
 * payouts.
 *
 * Anyone already eliminated has taken their place and their money with them, so
 * the places below the survivors are not on the table.
 */
export function chopBase(payouts: number[], playerCount: number): number {
  return payouts.slice(0, Math.max(0, playerCount)).reduce((sum, p) => sum + (p || 0), 0);
}

/**
 * Each player's ICM equity, in the same order as `chips`.
 *
 * Recursive Malmuth-Harville: the chance of finishing first is the chip share,
 * and the rest of the field then plays for the remaining places without them.
 */
export function icmEquity(chips: number[], payouts: number[]): number[] {
  if (chips.length === 0 || payouts.length === 0) return chips.map(() => 0);

  const total = chips.reduce((s, c) => s + c, 0);
  if (total === 0) return chips.map(() => 0);

  const equity = chips.map(() => 0);

  for (let i = 0; i < chips.length; i++) {
    const pFirst = chips[i] / total;
    equity[i] += pFirst * payouts[0];

    if (payouts.length > 1) {
      const rest = chips.filter((_, j) => j !== i);
      const restEq = icmEquity(rest, payouts.slice(1));
      let k = 0;
      for (let j = 0; j < chips.length; j++) {
        if (j !== i) { equity[j] += pFirst * restEq[k]; k++; }
      }
    }
  }
  return equity;
}

/** Each player's share of `base`, proportional to chips. */
export function proportionalChop(chips: number[], base: number): number[] {
  const total = chips.reduce((s, c) => s + c, 0);
  if (total === 0) return chips.map(() => 0);
  return chips.map(c => (c / total) * base);
}
