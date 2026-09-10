/**
 * Points per finishing place, in bands.
 *
 * A band is "places X to Y score N", where N is either a flat number or a
 * MULTIPLE OF THE FIELD — and that multiple is the whole reason this exists.
 * The per-position grid it replaces could already express a band by repeating a
 * number seven times; what it could not do was make the points scale with how
 * many played, which is exactly what sends a director to the formula editor.
 *
 * The other ready-made schemes are square roots. Boxes cannot express those
 * without inventing controls for functions, so this removes the commonest
 * reason to write a formula rather than the ability to.
 *
 * Pure, per the lib/ convention.
 */
import type { PointsFormula } from '@/types/leagueSettings';

export interface PointsBand {
  /** First place this band covers, 1-based and inclusive. */
  from: number;
  /** Last place it covers, inclusive. `null` means "and everything after". */
  to: number | null;
  points: number;
  /** Multiply by the number of players rather than paying a flat figure. */
  perPlayer?: boolean;
}

/** The ladder a new league starts on: 25 down to 1, then nothing. */
export const DEFAULT_POSITION_POINTS = [25, 18, 13, 9, 6, 4, 3, 2, 1];

/**
 * The bands a formula scores by, whatever shape it stored them in.
 *
 * NORMALISED ON READ rather than migrated, the same trade `payoutsOf()` makes:
 * a league that stored `positionPoints` keeps scoring exactly what it scored,
 * and nothing has to rewrite a stored document to keep working. Never write
 * `positionPoints` again.
 */
export function bandsOf(formula: Partial<PointsFormula> | null | undefined): PointsBand[] {
  if (formula?.positionBands?.length) return formula.positionBands;

  const legacy = formula?.positionPoints?.length ? formula.positionPoints : DEFAULT_POSITION_POINTS;
  return legacy.map((points, index) => ({
    from: index + 1,
    to: index + 1,
    points,
    perPlayer: false,
  }));
}

/**
 * What a finishing place scores.
 *
 * FIRST MATCHING BAND WINS, in the order they are listed. Overlaps are then
 * harmless and predictable rather than an error state the editor has to police —
 * a director dragging "1 to 3" over an existing "1 to 1" gets the first row,
 * which is what the table shows them.
 *
 * A place no band covers scores nothing, which is how "top twenty only" is said.
 */
export function pointsForBand(
  bands: PointsBand[],
  position: number,
  totalPlayers: number,
): number {
  if (!Number.isFinite(position) || position < 1) return 0;

  const band = bands.find(b => {
    const from = Number(b?.from) || 0;
    const to = b?.to === null || b?.to === undefined ? Infinity : Number(b.to);
    return position >= from && position <= to;
  });
  if (!band) return 0;

  const points = Number(band.points) || 0;
  const scaled = band.perPlayer ? points * (Number(totalPlayers) || 0) : points;
  return Number.isFinite(scaled) ? Math.max(0, Math.floor(scaled)) : 0;
}
