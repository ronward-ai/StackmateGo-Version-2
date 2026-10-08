import { isRealSeasonId } from './seasonProgress';

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

/** A result's time in ms — strings, numbers, Dates and Firestore Timestamps all occur. */
export function resultTime(r: ResultLike): number | null {
  for (const raw of [r?.tournamentDate, r?.date] as any[]) {
    if (raw == null) continue;
    let ms: number;
    if (typeof raw === 'number') ms = raw;
    else if (typeof raw === 'string') ms = Date.parse(raw);
    else if (raw instanceof Date) ms = raw.getTime();
    else if (typeof raw.toDate === 'function') ms = raw.toDate().getTime();
    else if (typeof raw.seconds === 'number') ms = raw.seconds * 1000;
    else continue;
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

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
      if (String(r?.seasonId) !== target || r?.tournamentId == null) continue;
      const id = String(r.tournamentId);
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
      if (String(r?.tournamentId) !== gameId) continue;
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
