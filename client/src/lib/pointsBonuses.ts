/**
 * Bonuses that sit on top of whatever scheme a league scores with.
 *
 * Two rules almost every home league has, and neither was reachable:
 *
 *  - **points per knockout**, for busting someone out;
 *  - **points for turning up**, so a player who travels and busts early is not
 *    level with someone who stayed at home.
 *
 * `knockoutPoints` and `participationPoints` were declared on `PointsFormula`
 * and described in a comment as applying "on top of any formula type" — and
 * nothing read them. Wanting either meant writing a custom formula, which is a
 * large part of why that panel is the one people find daunting.
 *
 * Deliberately separate from the scheme: they apply to all five types, custom
 * included. A custom formula CAN reference `k` itself, so setting both will
 * count knockouts twice — that is the director's business, and the points table
 * shows it immediately.
 *
 * Pure, per the lib/ convention.
 */
export interface Bonuses {
  knockoutPoints?: number | null;
  participationPoints?: number | null;
}

export function withBonuses(basePoints: number, knockouts: number, bonuses: Bonuses): number {
  const perKnockout = Number(bonuses?.knockoutPoints) || 0;
  const forPlaying = Number(bonuses?.participationPoints) || 0;
  const busts = Number.isFinite(knockouts) ? Math.max(0, knockouts) : 0;

  const total = basePoints + busts * perKnockout + forPlaying;
  // Same floor and clamp the scheme itself gets: whole points, never negative.
  return Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
}

/** Whether a league has set either, for deciding whether to mention them. */
export function hasBonuses(bonuses: Bonuses): boolean {
  return (Number(bonuses?.knockoutPoints) || 0) > 0 || (Number(bonuses?.participationPoints) || 0) > 0;
}
