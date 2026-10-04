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

/**
 * What number will the NEXT game get?
 *
 * A DIFFERENT QUESTION FROM `gameNumberFor`, and conflating the two is a bug
 * this app shipped. `gameNumberFor` answers "which game is the one in
 * progress", which is what every header label wants — after game 1 has been
 * played and is still on screen, that game IS game 1, and saying so is right.
 *
 * The dialog that starts the next game asked the same function and printed the
 * answer on its button, so having just finished game 1 a director was offered
 * "Start Game 1". Nothing added one.
 *
 * The in-progress `localGameId` is deliberately NOT a parameter here. Whether
 * tonight's game has recorded results or not, the next one is simply the game
 * after everything already recorded — that is the whole distinction, and taking
 * the id would be the invitation to reintroduce the bug.
 */
export function nextGameNumber(
  seasonId: string | number | null | undefined,
  leaguePlayers: PlayerLike[] | null | undefined,
): number {
  if (!isRealSeasonId(seasonId)) return 1;
  return countGamesPlayed(seasonId, leaguePlayers) + 1;
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
 * The line under a season's name: its dates, its length, or both.
 *
 * Either half can be absent — a league that does not run on a calendar has no
 * dates, and a season need not declare a length — so the parts are joined only
 * when they are there. Concatenating them directly left a season with no dates
 * reading " · 12 games", leading separator and all.
 */
export function seasonSubtitle(
  dateRange: string | null | undefined,
  numberOfGames: number | null | undefined,
): string {
  return [
    dateRange || '',
    numberOfGames ? `${numberOfGames} games` : '',
  ].filter(Boolean).join(' · ');
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
 * `Game 4 of 13`, clamped — the one spelling of a season's progress.
 *
 * It was spelled THREE times: `TournamentInfoCard`, the identical line copied
 * onto `ParticipantTournamentInfoCard`, and `LeagueSection` — and they already
 * disagreed, because only the League panel clamped. A fourteenth game of a
 * thirteen-game season read `Game 14 of 13` on the two cards and
 * `Game 13 of 13` in the panel, about the same night.
 *
 * Clamped here, so a site cannot opt out of it by forgetting.
 */
export function gameProgressLabel(
  gameNumber: number | null | undefined,
  numberOfGames: number | null | undefined,
): string {
  const n = Number(gameNumber);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Number(numberOfGames) || 0;
  return total > 0 ? `Game ${Math.min(n, total)} of ${total}` : `Game ${n}`;
}

/**
 * The season and the game in it, as one line: `Spring 2026 · Game 4 of 13`.
 *
 * **Every part is optional and the separator is never left stranded**, which is
 * the fault `seasonSubtitle` above exists for — concatenating directly left a
 * dateless season reading `· 12 games`, leading separator and all. A standalone
 * tournament has no season block at all and gets `''`, so a caller joining this
 * with its own parts adds nothing rather than a bare dot.
 */
export function seasonLine(input: {
  seasonName?: string | null;
  gameNumber?: number | null;
  numberOfGames?: number | null;
}): string {
  return [
    (input.seasonName || '').trim(),
    gameProgressLabel(input.gameNumber, input.numberOfGames),
  ].filter(Boolean).join(' · ');
}

/**
 * How many games a date range holds, given when the league plays.
 *
 * A director setting up a quarterly season should not have to count Wednesdays
 * on a calendar. Tell it the nights you play and how often, and it counts them.
 *
 * A SUGGESTION, never a rule: the number it produces fills the games field and
 * can be typed over. A cancelled week, a Christmas break or a double-header are
 * all normal, and none of them are knowable from a pattern — which is the same
 * reason nothing ends a season automatically.
 *
 * All arithmetic in UTC, like `nextSeasonDates`, so a local timezone cannot
 * shift a date across midnight and lose or gain a week.
 */
export interface SchedulePattern {
  /** 0 = Sunday … 6 = Saturday. More than one for a league playing twice a week. */
  weekdays: number[];
  /** 1 = every week, 2 = every other week. Whole weeks only. */
  everyNWeeks?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function gamesInRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  pattern: SchedulePattern,
): number {
  if (!startDate || !endDate) return 0;

  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end.getTime() < start.getTime()) return 0;

  const days = Array.from(new Set(pattern.weekdays ?? []))
    .filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
  if (days.length === 0) return 0;

  const every = Math.max(1, Math.floor(pattern.everyNWeeks ?? 1));

  // The Monday of the week the range begins in, as the parity anchor. Anchoring
  // per weekday instead would let a fortnightly Tuesday and Thursday land on
  // alternating weeks — "every other week" means the WEEK repeats, not each day
  // independently.
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const anchor = start.getTime() - mondayOffset * DAY_MS;

  let count = 0;
  // A season longer than twenty years is a mistake, not a schedule.
  for (let week = 0; week < 1040; week += every) {
    const weekStart = anchor + week * 7 * DAY_MS;
    if (weekStart > end.getTime()) break;
    for (const day of days) {
      const when = weekStart + ((day + 6) % 7) * DAY_MS;
      if (when >= start.getTime() && when <= end.getTime()) count++;
    }
  }
  return count;
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
export function suggestNextName(currentName: string | undefined, nextStartDate?: string): string {
  // Optional: a league that does not run on a calendar has no next start date,
  // and falls back to naming by today's quarter — or, far more usefully, to
  // bumping the trailing number on the current name ("Season 3" → "Season 4").
  const start = new Date(nextStartDate ?? '');
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

/**
 * Where the NEXT game of a season stands, before it is started.
 *
 * Reported: after the last game the director pressed End Season, and Next Game
 * then offered — and started — "Game 13 of 12", recording a night into a season
 * the director had closed. Ending a season leaves `activeSeasonId` pointing at it,
 * so nothing downstream knew.
 *
 * - **`ended`** — the director closed it. No game may be started in it; Next
 *   Game sends them to Start Next Season. Outranks `full`.
 * - **`full`** — every scheduled game has been played but nobody has ended it.
 *   The next season is the obvious step, and an extra game is still allowed
 *   with a warning — a rescheduled or bonus night is real, and the director is
 *   the one standing there (the `lateEntryClosedReason` call).
 * - **`open`** — anything else.
 *
 * **Full is by GAME COUNT only, never the end date.** `isSeasonComplete` also
 * reads the end date, and that is right for its advisory banner; but a past end
 * date with games still to play is a cancelled week, not a finished season, and
 * steering a director away from the games they still owe would be wrong.
 */
export type NextGameState = 'ended' | 'full' | 'open';

export function nextGameState(
  season: (SeasonLike & { status?: string | null }) | null | undefined,
  gamesPlayed: number,
): NextGameState {
  if (!season) return 'open';
  if (season.status === 'completed') return 'ended';
  const total = Number(season.numberOfGames) || 0;
  if (total > 0 && gamesPlayed >= total) return 'full';
  return 'open';
}

/**
 * How the game about to be STARTED is named.
 *
 * Deliberately not `gameProgressLabel`, which clamps — right for the header of a
 * game already being played, where a 14th game of 13 reading "Game 13 of 13" is
 * the kinder lie, and wrong here: a dialog about to start a 13th game must not
 * print "Game 12 of 12" over it. Past the schedule it says so in words.
 */
export function nextGameLabel(
  gameNumber: number | null | undefined,
  numberOfGames: number | null | undefined,
): string {
  const n = Number(gameNumber);
  if (!Number.isFinite(n) || n <= 0) return '';
  const total = Number(numberOfGames) || 0;
  if (total <= 0) return `Game ${n}`;
  return n <= total ? `Game ${n} of ${total}` : `Game ${n} — beyond the ${total} scheduled`;
}
