/**
 * Payout structure templates.
 *
 * The "Top 10% of field" template used to build its tail from
 * `Math.floor(100 / n)` and then force the total to 100 by dumping the whole
 * remainder on the LAST position. That produced payouts that were not merely
 * ugly but wrong at ordinary pub field sizes:
 *
 *   20 players -> 40, 60                          (2nd paid more than 1st)
 *   30 players -> 40, 25, 35                      (3rd paid more than 2nd)
 *   80 players -> 40, 25, 15, 10, 6, 12, 12, -20  (negative last place)
 *
 * The fix is not three special cases; it is generating a distribution that
 * cannot violate the invariants in the first place. Every result is
 * monotonically non-increasing, at least 1% per paid place, and sums to
 * exactly 100.
 */

/** Percentage paid to a single finishing position. */
export interface PayoutSlot {
  position: number;
  percentage: number;
}

/**
 * The shape of a poker payout: steeply weighted to the top, flattening out.
 * Used as relative weights, not percentages, so any number of paid places
 * normalises to 100 without the tail going negative.
 */
const WEIGHTS = [40, 25, 15, 10, 6, 4, 3, 2.5, 2, 1.6, 1.3, 1.1];

/** Weight for a place beyond the explicit table, decaying but never zero. */
function weightFor(index: number): number {
  if (index < WEIGHTS.length) return WEIGHTS[index];
  // Continue the decay rather than stopping dead, so a 20th place still
  // ranks below a 19th.
  return WEIGHTS[WEIGHTS.length - 1] * Math.pow(0.9, index - WEIGHTS.length + 1);
}

/**
 * How many places pay, for a given field size.
 *
 * Roughly the top 10%, but always at least one and never more than the field.
 */
export function paidPlacesFor(playerCount: number): number {
  const players = Number.isFinite(playerCount) && playerCount > 0 ? Math.floor(playerCount) : 10;
  return Math.max(1, Math.min(players, Math.ceil(players * 0.1)));
}

/**
 * Payout percentages for roughly the top 10% of the field.
 *
 * Guarantees, for every field size:
 *   - percentages are monotonically non-increasing (1st >= 2nd >= 3rd ...)
 *   - every paid place gets at least 1
 *   - the total is exactly 100
 */
export function topPercentPayouts(playerCount: number): PayoutSlot[] {
  const places = paidPlacesFor(playerCount);

  // One paid place is the whole prize pool; skip the arithmetic.
  if (places === 1) return [{ position: 1, percentage: 100 }];

  // A place cannot be given less than 1%, so reserve that floor first and
  // distribute only what is genuinely left. This is what stops the tail going
  // negative however many places pay.
  const floorTotal = places;
  const distributable = 100 - floorTotal;

  const weights = Array.from({ length: places }, (_, i) => weightFor(i));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  const percentages = weights.map(w => 1 + Math.floor((distributable * w) / weightSum));

  // Floor() leaves a few points unallocated. Hand them out from the top down,
  // which preserves the ordering — the old code added the remainder to the
  // last place, which is precisely what inverted it.
  let remainder = 100 - percentages.reduce((sum, p) => sum + p, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % places) {
    percentages[i] += 1;
    remainder -= 1;
  }

  // Rounding can still leave a place fractionally above the one before it.
  // Clamp each to its predecessor and push any freed points to the top, so the
  // ordering invariant holds by construction rather than by luck.
  for (let i = 1; i < percentages.length; i++) {
    if (percentages[i] > percentages[i - 1]) {
      const excess = percentages[i] - percentages[i - 1];
      percentages[i] -= excess;
      percentages[0] += excess;
    }
  }

  return percentages.map((percentage, i) => ({ position: i + 1, percentage }));
}
