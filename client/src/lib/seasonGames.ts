import { isRealSeasonId, gameKeyOf, resultTime } from './seasonProgress';

/**
 * The season's games, one slot per segment of the Players tab's game bar.
 *
 * Derived from the league's own results — every result carries the game's
 * document id as `tournamentId` — which is exactly how `countGamesPlayed` counts
 * them, so the bar and the "N of M played" line cannot disagree. Nothing new is
 * stored: a season's games already exist as the results recorded in it.
 */

export type SlotState = 'played' | 'current' | 'future';

export interface GameSlot {
  /** One-based position in the season. */
  number: number;
  /** The game's document id; null for a future slot. */
  gameId: string | null;
  state: SlotState;
  /** When it was played (earliest result), if known. */
  playedAt: Date | null;
  /** Past the season's scheduled number of games. */
  beyond: boolean;
}

interface ResultLike {
  seasonId?: unknown;
  tournamentId?: unknown;
  date?: unknown;
  tournamentDate?: unknown;
  position?: number;
  points?: number;
  knockouts?: number;
  playersEliminatedCount?: number;
  rebuys?: number;
  reEntries?: number;
  prizeMoney?: number;
}

interface PlayerLike {
  id?: unknown;
  name?: string;
  tournamentResults?: ResultLike[] | null;
}

export { resultTime };

export function seasonGameSlots({
  seasonId,
  numberOfGames,
  leaguePlayers,
  currentGameId,
}: {
  seasonId: unknown;
  numberOfGames?: number | null;
  leaguePlayers: PlayerLike[] | null | undefined;
  /** The game on the console, when it belongs to this season. */
  currentGameId?: string | null;
}): GameSlot[] {
  if (!isRealSeasonId(seasonId)) return [];
  const target = String(seasonId);

  // Each game, at the time of its earliest result.
  const earliest = new Map<string, number | null>();
  for (const player of leaguePlayers ?? []) {
    for (const r of player?.tournamentResults ?? []) {
      if (String(r?.seasonId) !== target) continue;
      // The same key every other game count uses, so the bar cannot disagree.
      const id = gameKeyOf(r as any);
      if (id === null) continue;
      const t = resultTime(r);
      const known = earliest.get(id);
      if (!earliest.has(id)) earliest.set(id, t);
      else if (t !== null && (known === null || known === undefined || t < known)) earliest.set(id, t);
    }
  }

  // The order the nights were played; a game with no date goes last.
  const played = Array.from(earliest.entries()).sort(([a, ta], [b, tb]) => {
    if (ta === null && tb === null) return a.localeCompare(b);
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb || a.localeCompare(b);
  });

  const current = currentGameId ? String(currentGameId) : null;
  const slots: GameSlot[] = played.map(([id, t], i) => ({
    number: i + 1,
    gameId: id,
    state: id === current ? 'current' : 'played',
    playedAt: t === null ? null : new Date(t),
    beyond: false,
  }));

  // Tonight's game before its first result is the next slot.
  if (current && !earliest.has(current)) {
    slots.push({ number: slots.length + 1, gameId: current, state: 'current', playedAt: null, beyond: false });
  }

  const scheduled = numberOfGames && numberOfGames > 0 ? numberOfGames : 0;
  while (slots.length < scheduled) {
    slots.push({ number: slots.length + 1, gameId: null, state: 'future', playedAt: null, beyond: false });
  }
  if (scheduled) for (const s of slots) s.beyond = s.number > scheduled;
  return slots;
}

export interface GameResultRow {
  name: string;
  position: number;
  points: number;
  knockouts: number;
  rebuys: number;
  reEntries: number;
  prizeMoney: number;
}

/**
 * One game's results as the league recorded them, best place first — what the
 * bar shows for a game with no History record (played before History existed).
 */
export function leagueResultsForGame(leaguePlayers: PlayerLike[] | null | undefined, gameId: string): GameResultRow[] {
  const rows: GameResultRow[] = [];
  for (const player of leaguePlayers ?? []) {
    for (const r of player?.tournamentResults ?? []) {
      if (gameKeyOf(r as any) !== gameId) continue;
      rows.push({
        name: player.name ?? '',
        position: r.position ?? 0,
        points: r.points ?? 0,
        knockouts: r.knockouts ?? r.playersEliminatedCount ?? 0,
        rebuys: r.rebuys ?? 0,
        reEntries: r.reEntries ?? 0,
        prizeMoney: r.prizeMoney ?? 0,
      });
    }
  }
  return rows.sort((a, b) => (a.position || Infinity) - (b.position || Infinity));
}

/**
 * Which season the Players tab's bar shows, and whether tonight's game is on it.
 *
 * The season the League panel's standings show — a past season picked in its
 * "Viewing" list, else the league's CURRENT season — never the open game's own
 * season. They used to differ: after another season was made current in Manage
 * League the table moved and the bar stayed put, two games long (reported).
 * A viewed season that has since become current is just the current one.
 * Tonight's game is marked only when it belongs to the season shown.
 */
export function barSeasonFor<S extends { id?: unknown }>({
  viewedSeasonId,
  currentSeason,
  seasons,
  gameSeasonId,
  gameId,
}: {
  viewedSeasonId: string | null | undefined;
  currentSeason: S | null | undefined;
  seasons: readonly S[] | null | undefined;
  /** The season the open game belongs to. */
  gameSeasonId: unknown;
  gameId: string | null | undefined;
}): { season: S | null; viewedPast: S | null; currentGameId: string | null } {
  const viewedPast = viewedSeasonId && String(viewedSeasonId) !== String(currentSeason?.id)
    ? (seasons ?? []).find(s => String(s.id) === String(viewedSeasonId)) ?? null
    : null;
  const season = viewedPast ?? currentSeason ?? null;
  const onIt = !!season && gameSeasonId != null && String(season.id) === String(gameSeasonId);
  return { season, viewedPast, currentGameId: onIt ? gameId ?? null : null };
}
