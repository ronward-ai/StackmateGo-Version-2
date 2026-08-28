/**
 * Season progress — how many games have been played, and which game this is.
 *
 * This derivation previously existed as five near-identical `useMemo` blocks
 * (LeagueSection, TournamentModeToggle, TournamentNewButton ×2, PokerTimer)
 * plus a persisted copy in `tournament.settings.gameNumber`. They disagreed on
 * which season to count against — some used the hook's `currentSeason`, others
 * the tournament's stored `settings.seasonId` — and two of them wrote the same
 * persisted field, so they fought whenever those two seasons differed, which is
 * exactly what happens after choosing a different season for the next game.
 *
 * One implementation, one meaning.
 */

/** Minimal shape needed from a league player. */
export interface ResultLike {
  seasonId?: string | number | null;
  tournamentId?: string | number | null;
  /** Legacy rows predating tournamentId. */
  id?: string | number | null;
}

export interface PlayerLike {
  tournamentResults?: ResultLike[] | null;
}

/**
 * The synthetic season id used before Firestore resolves. Results must never be
 * attributed to it — they would match no real season and vanish from every
 * season-filtered view.
 */
export const SYNTHETIC_SEASON_ID = 'default-season';

/** True when a season id is safe to record results against. */
export function isRealSeasonId(seasonId: unknown): seasonId is string | number {
  return (
    seasonId !== null &&
    seasonId !== undefined &&
    seasonId !== '' &&
    String(seasonId) !== SYNTHETIC_SEASON_ID
  );
}

/**
 * Distinct tournaments recorded in a season.
 *
 * Falls back to a result's own id for legacy rows written before tournamentId
 * existed, matching what RealTimeLeagueTable already did.
 */
export function countGamesPlayed(
  seasonId: string | number | null | undefined,
  leaguePlayers: PlayerLike[] | null | undefined,
): number {
  if (!isRealSeasonId(seasonId) || !leaguePlayers?.length) return 0;
  const target = String(seasonId);
  const ids = new Set<string>();
  for (const player of leaguePlayers) {
    for (const r of player?.tournamentResults ?? []) {
      if (String(r?.seasonId) !== target) continue;
      if (r?.tournamentId) ids.add(String(r.tournamentId));
      else if (r?.id) ids.add(String(r.id));
    }
  }
  return ids.size;
}

/**
 * Which game number the current tournament is within its season, 1-based.
 *
 * If the game in progress has already recorded results it IS one of the counted
 * games, so the count is the answer; otherwise it is the next one.
 *
 * @param localGameId identifier of the game in progress, if any.
 */
export function gameNumberFor(
  seasonId: string | number | null | undefined,
  leaguePlayers: PlayerLike[] | null | undefined,
  localGameId?: string | number | null,
): number {
  if (!isRealSeasonId(seasonId)) return 1;
  const target = String(seasonId);
  const ids = new Set<string>();
  for (const player of leaguePlayers ?? []) {
    for (const r of player?.tournamentResults ?? []) {
      if (String(r?.seasonId) !== target) continue;
      if (r?.tournamentId) ids.add(String(r.tournamentId));
      else if (r?.id) ids.add(String(r.id));
    }
  }
  if (localGameId && ids.has(String(localGameId))) return ids.size;
  return ids.size + 1;
}
