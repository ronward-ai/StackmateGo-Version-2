/**
 * The order of a league's standings, and the ONE place it is decided
 * (October audit, Low).
 *
 * The table sorted by points, then fewer games, then best finish. The movement
 * arrows ranked last week's table by points and games only — so two players
 * level on both were ordered one way on screen and another in the "previous"
 * ranking, and an arrow could point at a move that never happened. Two
 * spellings of one order is the fault; one comparator is the cure.
 */
export interface StandingsKey {
  points: number;
  games: number;
  /** Best finishing position; absent or 0 means none. */
  bestFinish?: number | null;
}

const NO_FINISH = 999;

export function compareStandings(a: StandingsKey, b: StandingsKey): number {
  if (b.points !== a.points) return b.points - a.points;
  // Fewer games for the same points ranks higher.
  if (a.games !== b.games) return a.games - b.games;
  return (a.bestFinish || NO_FINISH) - (b.bestFinish || NO_FINISH);
}

/** Best finish across a set of results, for the key above. */
export function bestFinishOf(results: readonly { position?: number | null }[] | null | undefined): number {
  const places = (results || []).map(r => r.position || 0).filter(p => p > 0);
  return places.length ? Math.min(...places) : NO_FINISH;
}
