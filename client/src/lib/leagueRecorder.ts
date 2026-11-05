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

import { isRealSeasonId } from './seasonProgress';

export interface RecorderPlayer {
  id: string;
  name: string;
  position?: number | null;
  isActive?: boolean;
}

interface LeaguePlayerResults {
  name: string;
  /** Former spellings, recorded by a rename — see `nameKeysOf`. */
  aliases?: readonly (string | null | undefined)[] | null;
  tournamentResults?: Array<{
    tournamentId?: string | number | null;
    position?: number | null;
    playersEliminatedCount?: number | null;
    rebuys?: number | null;
    reEntries?: number | null;
  }>;
}

/**
 * The counts a recorded result carries that the results editor can change
 * without moving anybody's place. A field absent from an old result is
 * unknown, not 0 — results recorded before rebuys were stored must not all be
 * rewritten (and rescored under today's points scheme) the moment their game
 * is opened.
 */
export interface RecordedStats {
  knockouts?: number;
  rebuys?: number;
  reEntries?: number;
}

const STAT_KEYS = ['knockouts', 'rebuys', 'reEntries'] as const;

export function statsOfPlayer(p: { knockouts?: number; rebuys?: number; reEntries?: number }): RecordedStats {
  return { knockouts: p.knockouts || 0, rebuys: p.rebuys || 0, reEntries: p.reEntries || 0 };
}

/** Each player's recorded counts for this game, from the league's results. */
export function recordedStatsForGame(
  leaguePlayers: readonly LeaguePlayerResults[] | null | undefined,
  gameId: string | null | undefined,
): Map<string, RecordedStats> {
  const out = new Map<string, RecordedStats>();
  if (!gameId) return out;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  for (const lp of leaguePlayers ?? []) {
    const hit = (lp.tournamentResults ?? []).find(r => String(r.tournamentId) === gameId);
    if (hit) for (const key of nameKeysOf(lp)) out.set(key, {
      knockouts: num(hit.playersEliminatedCount),
      rebuys: num(hit.rebuys),
      reEntries: num(hit.reEntries),
    });
  }
  return out;
}

/** Do the recorded counts disagree with the player's? Unknown fields never do. */
export function statsDiffer(recorded: RecordedStats | undefined, player: RecordedStats): boolean {
  if (!recorded) return false;
  return STAT_KEYS.some(k => recorded[k] !== undefined && recorded[k] !== (player[k] ?? 0));
}

/**
 * The league matches players by lower-cased, TRIMMED name; so does everything
 * that asks "is this the same person" (October audit, coverage). The recorder's
 * lookup did not trim and its Firestore fallback was case-SENSITIVE, so "amy"
 * missed "Amy" whenever the roster snapshot lagged and created a second player.
 */
export const nameKey = (name: string | null | undefined) => (name || '').toLowerCase().trim();

/**
 * Every name a league player answers to: their name, and each spelling they
 * were RENAMED from (`aliases`, written by `renameLeaguePlayer`).
 *
 * Reported after a misspelt player was renamed from their season card: the
 * league table then showed a row for each spelling. The rename changed the
 * league player and not the game, so last week's roster still said the old
 * spelling — and when that game was next open on a console the recorder,
 * which matches by NAME, found no result under it and recorded the night
 * again as a brand-new player. An alias makes the old spelling mean the same
 * person everywhere a name is matched.
 */
export function nameKeysOf(p: { name?: string | null; aliases?: readonly (string | null | undefined)[] | null }): string[] {
  const keys = [nameKey(p.name), ...(p.aliases ?? []).map(a => nameKey(a))].filter(Boolean);
  return Array.from(new Set(keys));
}

/** Does this player answer to this name — as their name or a former spelling? */
export const answersTo = (p: { name?: string | null; aliases?: readonly (string | null | undefined)[] | null }, name: string | null | undefined) =>
  nameKeysOf(p).includes(nameKey(name));

/** Do two names belong to one league player (one row of the standings)? */
export function samePerson(
  leaguePlayers: readonly { name?: string | null; aliases?: readonly (string | null | undefined)[] | null }[] | null | undefined,
  a: string,
  b: string,
): boolean {
  return (leaguePlayers ?? []).some(p => answersTo(p, a) && answersTo(p, b));
}

/** The league player a name belongs to, the way the standings merge them. */
export function findPlayerByName<P extends { name?: string | null; aliases?: readonly (string | null | undefined)[] | null }>(players: readonly P[], name: string): P | undefined {
  const key = nameKey(name);
  // The name first: a former spelling only decides when nobody is called it now.
  return players.find(p => nameKey(p.name) === key) ?? players.find(p => answersTo(p as any, name));
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
  playerDocs: readonly { id: string | number; name?: string | null; aliases?: readonly (string | null | undefined)[] | null }[],
  results: readonly { leaguePlayerId?: string | number | null; tournamentId?: string | number | null }[],
  name: string,
  tournamentId: string | number,
  extraIds: readonly (string | number)[] = [],
): boolean {
  const ids = new Set([...playerIdsForName(playerDocs, name), ...extraIds.map(String)]);
  return results.some(r => ids.has(String(r.leaguePlayerId)) && String(r.tournamentId) === String(tournamentId));
}

/**
 * Every player DOCUMENT that is this person — the merged row's primary id and
 * any duplicate created by concurrent recording.
 *
 * Both halves of the recorder have to ask this: the dedupe above, and the
 * REMOVAL a rebuy, re-entry or renumbering triggers. The removal found the
 * player through the merged row and deleted results under that one id, so a
 * result recorded against a duplicate document was never removed — the stale
 * place stayed and counted twice. Found by the season scenario tests.
 */
export function playerIdsForName(
  playerDocs: readonly { id: string | number; name?: string | null; aliases?: readonly (string | null | undefined)[] | null }[],
  name: string,
): string[] {
  const key = nameKey(name);
  return playerDocs.filter(p => nameKey(p.name) === key || answersTo(p, name)).map(p => String(p.id));
}

/** The results to delete when this person's result for this game is withdrawn. */
export function resultsToWithdraw<R extends { leaguePlayerId?: string | number | null; tournamentId?: string | number | null }>(
  playerDocs: readonly { id: string | number; name?: string | null; aliases?: readonly (string | null | undefined)[] | null }[],
  results: readonly R[],
  name: string,
  tournamentId: string | number,
): R[] {
  const ids = new Set(playerIdsForName(playerDocs, name));
  return results.filter(r => ids.has(String(r.leaguePlayerId)) && String(r.tournamentId) === String(tournamentId));
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
    // Under every name the player answers to, so a roster still carrying a
    // spelling they were renamed from finds the result (see nameKeysOf).
    if (hit && typeof hit.position === 'number' && hit.position > 0) {
      for (const key of nameKeysOf(lp)) out.set(key, hit.position);
    }
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
export function removalsDue<P extends RecorderPlayer & { knockouts?: number; rebuys?: number; reEntries?: number }>(
  players: readonly P[],
  memory: ReadonlyMap<string, number>,
  cloud: ReadonlyMap<string, number>,
  stats?: { memory: ReadonlyMap<string, RecordedStats>; cloud: ReadonlyMap<string, RecordedStats> },
): { back: P[]; moved: P[]; changed: P[] } {
  const back: P[] = [];
  const moved: P[] = [];
  const changed: P[] = [];
  for (const p of players) {
    const recorded = recordedPosition(memory, cloud, p);
    if (recorded === null) continue;
    if (p.isActive !== false && !p.position) back.push(p);
    else if (p.position && recorded !== p.position) moved.push(p);
    // Same place, different counts — what the results editor does to a
    // finished night. This tab's memory first, for the reason the positions
    // take it first: the results snapshot lags this tab's own writes.
    else if (stats && statsDiffer(
      memory.has(p.id) ? stats.memory.get(p.id) : stats.cloud.get(nameKey(p.name)),
      statsOfPlayer(p),
    )) changed.push(p);
  }
  return { back, moved, changed };
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

/**
 * Results still filed under a name a player has been RENAMED from (the results
 * editor, `lib/resultsEdit.ts`), for this game.
 *
 * The recorder finds what is already recorded by NAME, and its tab memory by
 * player id — so a rename alone was invisible on the tab that made it (memory
 * still held the place) and, after a reload, recorded the new name BESIDE the old
 * one: the night counted twice, under two names. Reported from a real league game,
 * where a regular was added misspelt and the standings showed a stranger.
 *
 * The old name travels on the player (`formerNames`) in the game document, so this
 * answers the same after a reload. A former name another player in the game still
 * goes by is never withdrawn — that result is theirs. `done` holds the
 * `playerId:formerName` pairs this tab has already withdrawn: the results snapshot
 * LAGS this tab's own deletes, and acting on the stale copy would tombstone the
 * player again and record the night a second time.
 */
export function renamesDue<P extends RecorderPlayer & { formerNames?: readonly string[] | null }>(
  players: readonly P[],
  cloud: ReadonlyMap<string, number>,
  done: ReadonlySet<string> = new Set(),
  /** True when two names are one league player — then the "former" result IS theirs. */
  isSamePerson: (a: string, b: string) => boolean = () => false,
): { player: P; formerName: string }[] {
  const current = new Set(players.map(p => nameKey(p.name)));
  const out: { player: P; formerName: string }[] = [];
  for (const p of players) {
    for (const former of p.formerNames ?? []) {
      const key = nameKey(former);
      if (!key || current.has(key)) continue;
      if (!cloud.has(key)) continue;
      if (done.has(renameKey(p.id, former))) continue;
      if (isSamePerson(former, p.name)) continue;
      out.push({ player: p, formerName: former });
    }
  }
  return out;
}

export const renameKey = (playerId: string, formerName: string) => `${playerId}:${nameKey(formerName)}`;

/**
 * Which season tonight's results are filed under — or null for "not known yet,
 * so write nothing".
 *
 * Reported from game 5 of a league, played on a venue network that blocked
 * Google's sign-in servers: next day some players had the game counted and some
 * did not. The recorder waited for the league's players and results, but NOT
 * for its seasons or the league document, and the season came from the loaded
 * seasons list, then `currentSeason`, then `activeSeasonId` — each of which is
 * absent while those reads have not landed. So a result could be written with
 * `seasonId: null`, and the standings (`seasonRoster`, `countGamesPlayed`) do
 * not count a result that belongs to no season.
 *
 * The GAME's own stored season wins: the console writes it onto every league
 * game and it travels in the game document, so it is known as soon as the game
 * is. The season on screen is the fallback, for a game that has not had one
 * written yet. Neither real means wait — results are recorded on a later pass,
 * never filed into nothing.
 */
export function seasonForRecording(
  gameSeasonId: unknown,
  displaySeasonId: unknown,
): string | null {
  if (isRealSeasonId(gameSeasonId)) return String(gameSeasonId);
  if (isRealSeasonId(displaySeasonId)) return String(displaySeasonId);
  return null;
}

/**
 * This game's results that were filed under NO season, to be moved into the
 * game's own season.
 *
 * The other half of the game-5 repair. `recordedForGame` ignores the season,
 * so a result written with `seasonId: null` reads as recorded and the recorder
 * never looked at it again — reopening the game could not bring it back.
 *
 * Only a MISSING season is corrected, never a different real one: a game whose
 * stored season was itself only a guess must not drag an older night's results
 * into the season on screen. And only when the game names its season itself
 * (`gameSeasonId`), for the same reason. Only `seasonId` is rewritten, so
 * nothing is rescored.
 */
export function misfiledDue<R extends { id?: string | number; tournamentId?: string | number | null; seasonId?: string | number | null }>(
  results: readonly R[] | null | undefined,
  gameId: string | null | undefined,
  gameSeasonId: unknown,
): R[] {
  if (!gameId || !isRealSeasonId(gameSeasonId)) return [];
  return (results ?? []).filter(r =>
    r.id != null
    && String(r.tournamentId) === String(gameId)
    && !isRealSeasonId(r.seasonId));
}

/**
 * How many of tonight's results the league does not hold yet: finished players
 * the recorder has not recorded, plus results this device has written that the
 * server has not acknowledged (Firestore shows them locally at once, which is
 * why the screen can look right while nothing has been saved).
 *
 * Nothing said so before. The recorder stands down silently while the league is
 * loading, the season is unknown or a write is stuck, and on the game-5 night
 * the director had no way to tell the standings were not being saved.
 */
export function pendingLeagueResults<P extends RecorderPlayer>(input: {
  players: readonly P[];
  memory: ReadonlyMap<string, number>;
  cloud: ReadonlyMap<string, number>;
  gameIsFinished: boolean;
  results?: readonly { tournamentId?: string | number | null; pendingWrite?: boolean }[] | null;
  gameId?: string | null;
}): number {
  const notRecorded = recordsDue(input.players, input.memory, input.cloud, input.gameIsFinished).length;
  const unsent = input.gameId
    ? (input.results ?? []).filter(r => r.pendingWrite && String(r.tournamentId) === String(input.gameId)).length
    : 0;
  return notRecorded + unsent;
}

/**
 * Which seasons this game's league results are filed under, and how many in
 * each — when they are not all in one place the director is asked which season
 * the night belongs to (the "split" line above the League panel).
 *
 * Results for one game belong to one season. They were split by the fault
 * `gameSeasonFor` in lib/seasonProgress.ts fixes: the game's season was
 * overwritten by a guess while the seasons were loading, so players who busted
 * before it went into one season and players after it into another. Which one is
 * right cannot be known from the data, so it is asked rather than guessed.
 * Results with no season are left to `misfiledDue`.
 */
export function seasonSplitOfGame(
  results: readonly { tournamentId?: string | number | null; seasonId?: string | number | null }[] | null | undefined,
  gameId: string | null | undefined,
  gameSeasonId: unknown,
): { seasons: { seasonId: string; count: number }[]; isSplit: boolean } {
  const counts = new Map<string, number>();
  if (gameId) {
    for (const r of results ?? []) {
      if (String(r.tournamentId) !== String(gameId) || !isRealSeasonId(r.seasonId)) continue;
      counts.set(String(r.seasonId), (counts.get(String(r.seasonId)) ?? 0) + 1);
    }
  }
  const seasons = Array.from(counts, ([seasonId, count]) => ({ seasonId, count }));
  const game = isRealSeasonId(gameSeasonId) ? String(gameSeasonId) : null;
  const isSplit = seasons.length > 1 || (seasons.length === 1 && !!game && seasons[0].seasonId !== game);
  if (isSplit && game && !counts.has(game)) seasons.push({ seasonId: game, count: 0 });
  return { seasons, isSplit };
}

/** This game's results NOT in `seasonId` — what "Move all to …" moves. */
export function resultsToMoveInto<R extends { id?: string | number; tournamentId?: string | number | null; seasonId?: string | number | null }>(
  results: readonly R[] | null | undefined,
  gameId: string | null | undefined,
  seasonId: string,
): R[] {
  if (!gameId) return [];
  return (results ?? []).filter(r => r.id != null && String(r.tournamentId) === String(gameId) && String(r.seasonId) !== String(seasonId));
}

export interface LeagueCheckResult {
  id: string;
  leaguePlayerId: string;
  playerName: string;
  tournamentId: string | null;
  seasonId: string | null;
  position: number | null;
  pendingWrite: boolean;
  time: number | null;
}

export interface LeagueCheckRow {
  name: string;
  position: number;
  /** League documents this name (or alias) resolves to. */
  playerIds: string[];
  /** Results for THIS game under those documents. */
  thisGame: LeagueCheckResult[];
  /** Their three most recent results for OTHER games — catches a different game id. */
  recentOther: LeagueCheckResult[];
}

/**
 * What the league holds for the game on screen, player by player — the read-only
 * "League check" on the console. Built after two guesses about a night whose
 * results were missing from the table turned out wrong: it shows the data
 * rather than inferring it. Nothing here writes.
 */
export function leagueCheck(input: {
  players: readonly { name: string; position?: number | null }[];
  playerDocs: readonly { id: string | number; name?: string | null; aliases?: readonly (string | null | undefined)[] | null }[];
  results: readonly any[];
  gameId: string | null | undefined;
  timeOf?: (r: any) => number | null;
}): { rows: LeagueCheckRow[]; bySeason: { seasonId: string | null; count: number }[]; strays: LeagueCheckResult[]; total: number } {
  const { players, playerDocs, results, gameId } = input;
  const timeOf = input.timeOf ?? (() => null);
  const nameOfDoc = new Map(playerDocs.map(d => [String(d.id), d.name ?? '']));
  const view = (r: any): LeagueCheckResult => ({
    id: String(r.id),
    leaguePlayerId: String(r.leaguePlayerId),
    playerName: nameOfDoc.get(String(r.leaguePlayerId)) ?? '(unknown player)',
    tournamentId: r.tournamentId != null && r.tournamentId !== '' ? String(r.tournamentId) : null,
    seasonId: r.seasonId != null && r.seasonId !== '' ? String(r.seasonId) : null,
    position: typeof r.position === 'number' ? r.position : null,
    pendingWrite: !!r.pendingWrite,
    time: timeOf(r),
  });
  const forGame = gameId ? results.filter(r => String(r.tournamentId) === String(gameId)) : [];
  const claimed = new Set<string>();
  const rows: LeagueCheckRow[] = players
    .filter(p => typeof p.position === 'number' && p.position > 0)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map(p => {
      // By standings ROW, as the table counts: every document sharing a name
      // with one that answers to this player's name. A merge leaves the old
      // spelling as an alias on one document and the result on another.
      const rowKeys = new Set(playerDocs.filter(d => answersTo(d, p.name)).map(d => nameKey(d.name)));
      const ids = playerDocs.filter(d => rowKeys.has(nameKey(d.name)) || answersTo(d, p.name)).map(d => String(d.id));
      const idSet = new Set(ids);
      const thisGame = forGame.filter(r => idSet.has(String(r.leaguePlayerId))).map(view);
      thisGame.forEach(r => claimed.add(r.id));
      const recentOther = results
        .filter(r => idSet.has(String(r.leaguePlayerId)) && !(gameId && String(r.tournamentId) === String(gameId)))
        .map(view)
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
        .slice(0, 3);
      return { name: p.name, position: p.position as number, playerIds: ids, thisGame, recentOther };
    });
  const counts = new Map<string | null, number>();
  for (const r of forGame) {
    const s = r.seasonId != null && r.seasonId !== '' ? String(r.seasonId) : null;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return {
    rows,
    bySeason: Array.from(counts, ([seasonId, count]) => ({ seasonId, count })),
    strays: forGame.filter(r => !claimed.has(String(r.id))).map(view),
    total: forGame.length,
  };
}
