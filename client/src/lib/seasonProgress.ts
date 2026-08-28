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

/** Minimal shape needed from a season. */
export interface SeasonLike {
  numberOfGames?: number | null;
  endDate?: string | null;
}

/**
 * Has this season run its course?
 *
 * Two independent signals, because either can arrive first: a quarterly league
 * is both a date range (Jan–Mar) and a schedule inside it (12–13 Wednesdays).
 * Neither field is "the" authority — a season can hit its game count early, or
 * run past its end date because a week was cancelled.
 *
 * This is advisory only. Nothing ends a season automatically; the director
 * decides, because a missed week means "past the end date" is not the same as
 * "finished".
 */
export function isSeasonComplete(
  season: SeasonLike | null | undefined,
  gamesPlayed: number,
): boolean {
  if (!season) return false;

  const total = season.numberOfGames ?? 0;
  if (total > 0 && gamesPlayed >= total) return true;

  if (season.endDate) {
    const end = new Date(season.endDate);
    if (!Number.isNaN(end.getTime())) {
      // Compare by day, so a season is not "complete" during its own last day.
      const endOfDay = new Date(end);
      endOfDay.setHours(23, 59, 59, 999);
      if (Date.now() > endOfDay.getTime()) return true;
    }
  }

  return false;
}

/**
 * Game number for display, never exceeding the season total.
 *
 * Without this the counter runs past the schedule — a 13-game season showing
 * "Game 14 of 13" once the extra game is played.
 */
export function clampedGameNumber(
  gameNumber: number,
  season: SeasonLike | null | undefined,
): number {
  const total = season?.numberOfGames ?? 0;
  if (total > 0) return Math.min(gameNumber, total);
  return gameNumber;
}

/**
 * Dates for the season that follows this one.
 *
 * Quarterly leagues repeat, so the next season is "the same again, shifted
 * along". Two cases:
 *
 *  - Whole calendar months (1 Jan – 31 Mar): advance by the same NUMBER OF
 *    MONTHS, giving 1 Apr – 30 Jun. Equal-duration arithmetic gets this wrong,
 *    because quarters are not equal lengths — Q1 is 90 days and Q2 is 91, so
 *    adding Q1's duration to 1 Apr lands on 29 Jun.
 *  - Anything else: same duration, starting the day after.
 *
 * All arithmetic in UTC so a local timezone cannot shift a date across midnight.
 */
export function nextSeasonDates(season: SeasonLike & { startDate?: string | null }): {
  startDate: string;
  endDate: string;
} | null {
  if (!season?.startDate || !season?.endDate) return null;
  const start = new Date(season.startDate);
  const end = new Date(season.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;

  const iso = (d: Date) => d.toISOString().split('T')[0];
  const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0));

  const startsOnFirst = start.getUTCDate() === 1;
  const endsOnLast =
    end.getUTCDate() === lastDayOfMonth(end.getUTCFullYear(), end.getUTCMonth()).getUTCDate();

  if (startsOnFirst && endsOnLast) {
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - start.getUTCMonth()) + 1;
    const nextStart = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 1));
    const nextEnd = lastDayOfMonth(nextStart.getUTCFullYear(), nextStart.getUTCMonth() + months - 1);
    return { startDate: iso(nextStart), endDate: iso(nextEnd) };
  }

  const lengthMs = end.getTime() - start.getTime();
  const nextStart = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const nextEnd = new Date(nextStart.getTime() + lengthMs);
  return { startDate: iso(nextStart), endDate: iso(nextEnd) };
}

/**
 * A name for the next season, derived from this one where the pattern is
 * obvious.
 *
 * "Season 3" -> "Season 4". A trailing year is bumped when the next period
 * crosses into a new one. Anything else falls back to the quarter and year,
 * which is what pub leagues tend to use.
 */
export function suggestNextName(currentName: string | undefined, nextStartDate: string): string {
  const start = new Date(nextStartDate);
  const year = Number.isNaN(start.getTime()) ? new Date().getFullYear() : start.getUTCFullYear();
  const quarter = Number.isNaN(start.getTime()) ? 1 : Math.floor(start.getUTCMonth() / 3) + 1;

  if (currentName) {
    const numbered = currentName.match(/^(.*?)(\d+)\s*$/);
    if (numbered) {
      const [, prefix, n] = numbered;
      // Skip a bare year — bumping "Spring 2026" to "Spring 2027" is wrong when
      // the next season is merely the following quarter.
      if (!/^(19|20)\d{2}$/.test(n)) {
        return `${prefix}${Number(n) + 1}`;
      }
    }
  }

  return `Q${quarter} ${year}`;
}
