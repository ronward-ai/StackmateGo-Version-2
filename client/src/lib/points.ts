import { withBonuses } from '@/lib/pointsBonuses';
import { bandsOf, pointsForBand } from '@/lib/pointsBands';
import { evaluateFormula } from '@/lib/formulaEval';
import type { PointsFormula } from '@/types/leagueSettings';

/**
 * What a finishing place scores under a league's points system — the ENGINE,
 * extracted from `useLeagueSettings` (October audit, coverage).
 *
 * Five schemes, the two bonuses and the error paths sat inline in a hook with
 * no test, which is how the custom-formula failure path came to drop the
 * bonuses unnoticed. React- and Firebase-free, so it is tested directly; the
 * hook's `calculatePoints` is now a stable wrapper that hands it the current
 * settings.
 *
 * Never throws: a scheme that cannot score returns 0 (plus the bonuses, where
 * the scheme itself is what failed), the behaviour every caller relies on.
 */
export function pointsFor(
  formula: PointsFormula | null | undefined,
  position: number,
  totalPlayers: number,
  knockouts: number = 0,
  buyIn: number = 0,
  totalCost: number = 0,
  prizepool: number = 0,
): number {
  if (!formula) return 0;
  try {
    // The bonuses ride on top of every scheme, custom included — see
    // lib/pointsBonuses.ts. They were declared on the type and read by
    // nobody, so wanting points per knockout meant writing a formula.
    const bonuses = formula;

    switch (formula.type) {
      case 'logarithmic': {
        const baseMultiplier = formula.baseMultiplier || 10;
        const winnerMultiplier = formula.winnerMultiplier || 1.5;
        const points = baseMultiplier * Math.log(totalPlayers - position + 2);
        return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
      }

      case 'squareRoot': {
        const baseMultiplier = formula.baseMultiplier || 10;
        const winnerMultiplier = formula.winnerMultiplier || 1.2;
        const points = baseMultiplier * Math.sqrt(totalPlayers - position + 1);
        return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
      }

      case 'linear': {
        const baseMultiplier = formula.baseMultiplier || 10;
        const winnerMultiplier = formula.winnerMultiplier || 1.0;
        const points = baseMultiplier * (totalPlayers - position + 1);
        return withBonuses(position === 1 ? points * winnerMultiplier : points, knockouts, bonuses);
      }

      case 'fixed': {
        // Bands, which a stored positionPoints array converts into on read —
        // see lib/pointsBands.ts. There used to be a `fixedPoints` fallback
        // here "for when there is nothing else at all", but `bandsOf` falls
        // back to the default per-place points itself, so it never answered;
        // the test written on extraction is what showed it.
        return withBonuses(pointsForBand(bandsOf(formula), position, totalPlayers), knockouts, bonuses);
      }

      case 'custom': {
        if (!formula.customFormula?.trim()) {
          return withBonuses(0, knockouts, bonuses);
        }

        // lib/formulaEval.ts, not new Function. This ran a director's stored
        // string through the JS engine directly, and RealTimeLeagueTable
        // loads the DIRECTOR's settings and scores with them in the
        // PARTICIPANT's browser by design — so any signed-in director could
        // put arbitrary JavaScript in a points formula and have it execute
        // on this origin in every visitor's browser. The parser can only
        // ever produce arithmetic; there is no path from a formula string to
        // executing anything, however the string is contrived.
        const evaluation = evaluateFormula(formula.customFormula, {
          position, totalPlayers, knockouts, buyIn, totalCost, prizepool,
        });
        if (evaluation.ok === false) {
          console.error('Error evaluating custom formula:', evaluation.error, 'Formula:', formula.customFormula);
          // The bonuses still apply: a formula failing for one place is no
          // reason to take away that player's knockout and turning-up points
          // (October audit, Low). The settings tick names the failing place.
          return withBonuses(0, knockouts, bonuses);
        }
        return withBonuses(evaluation.value, knockouts, bonuses);
      }

      default:
        return 0;
    }
  } catch (error) {
    console.error('Error calculating points:', error);
    return 0;
  }
}
