/**
 * What the league recorder must do about each player tonight — and where it
 * learns what has ALREADY been recorded (October audit, H6).
 *
 * The recorder in PokerTimer used to know only what THIS TAB had recorded: an
 * in-memory map of player id → recorded position. A reload (an iPad evicting the
 * tab is ordinary) or a takeover started it empty, so:
 *   - a player who busted 12th, then re-entered after the reload, was never
 *     removed — the tab held no claim — and when they busted again 5th the
 *     duplicate check found the stale 12th and skipped the write. 12th, for good;
 *   - every finisher a re-entry renumbered kept their old place the same way.
 *
 * The league's own results for this game are the record. So "what is recorded"
 * is answered from them, with this tab's memory taking precedence wherever it has
 * an answer — because the results snapshot LAGS this tab's own writes, and
 * trusting a lagging snapshot over a write this tab has just made would remove a
 * result it had just corrected.
 *
 * Memory holds a position for "recorded at this place", and 0 for "this tab has
 * removed it" — a tombstone, so the lagging snapshot cannot resurrect a removal
 * either.
 */

export interface RecorderPlayer {
  id: string;
  name: string;
  position?: number | null;
  isActive?: boolean;
}

interface LeaguePlayerResults {
  name: string;
  tournamentResults?: Array<{ tournamentId?: string | number | null; position?: number | null }>;
}

/**
 * The league matches players by lower-cased, TRIMMED name; so does everything
 * that asks "is this the same person" (October audit, coverage). The recorder's
 * lookup did not trim and its Firestore fallback was case-SENSITIVE, so "amy"
 * missed "Amy" whenever the roster snapshot lagged and created a second player.
 */
export const nameKey = (name: string | null | undefined) => (name || '').toLowerCase().trim();

/** The league player a name belongs to, the way the standings merge them. */
export function findPlayerByName<P extends { name?: string | null }>(players: readonly P[], name: string): P | undefined {
  const key = nameKey(name);
  return players.find(p => nameKey(p.name) === key);
}

/**
 * Has this person a result for this game already — under ANY of the player
 * documents that share their name?
 *
 * The standings merge duplicate-named documents into one row, so the recorder
 * only ever sees the PRIMARY document's id. Checking that id alone missed a
 * result recorded against a duplicate, and the night was recorded twice: the
 * dedupe CLAUDE.md relies on as the second console's backstop had a hole the
 * merge itself made.
 */
export function alreadyRecorded(
  playerDocs: readonly { id: string | number; name?: string | null }[],
  results: readonly { leaguePlayerId?: string | number | null; tournamentId?: string | number | null }[],
  name: string,
  tournamentId: string | number,
  extraIds: readonly (string | number)[] = [],
): boolean {
  const key = nameKey(name);
  const ids = new Set([
    ...playerDocs.filter(p => nameKey(p.name) === key).map(p => String(p.id)),
    ...extraIds.map(String),
  ]);
  return results.some(r => ids.has(String(r.leaguePlayerId)) && String(r.tournamentId) === String(tournamentId));
}

/** Each player's recorded position for this game, from the league's results. */
export function recordedForGame(
  leaguePlayers: readonly LeaguePlayerResults[] | null | undefined,
  gameId: string | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!gameId) return out;
  for (const lp of leaguePlayers ?? []) {
    const hit = (lp.tournamentResults ?? []).find(r => String(r.tournamentId) === gameId);
    if (hit && typeof hit.position === 'number' && hit.position > 0) out.set(nameKey(lp.name), hit.position);
  }
  return out;
}

/** The position recorded for this player tonight, or null for none. */
export function recordedPosition(
  memory: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
  player: RecorderPlayer,
): number | null {
  if (memory.has(player.id)) {
    const v = memory.get(player.id)!;
    return v > 0 ? v : null;
  }
  return cloud.get(nameKey(player.name)) ?? null;
}

/**
 * The removals due BEFORE anything is recorded:
 *   - `back`: in the game again (rebuy, re-entry, undo) but still recorded;
 *   - `moved`: still out, but recorded at a place that has since changed.
 */
export function removalsDue<P extends RecorderPlayer>(
  players: readonly P[],
  memory: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
): { back: P[]; moved: P[] } {
  const back: P[] = [];
  const moved: P[] = [];
  for (const p of players) {
    const recorded = recordedPosition(memory, cloud, p);
    if (recorded === null) continue;
    if (p.isActive !== false && !p.position) back.push(p);
    else if (p.position && recorded !== p.position) moved.push(p);
  }
  return { back, moved };
}

/** Who should be recorded now: finished, and not recorded at that place. */
export function recordsDue<P extends RecorderPlayer>(
  players: readonly P[],
  memory: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
  gameIsFinished: boolean,
): P[] {
  return players.filter(p => {
    if (!p.position || p.position <= 0) return false;
    if (!gameIsFinished && p.isActive !== false) return false;
    return recordedPosition(memory, cloud, p) === null;
  });
}
