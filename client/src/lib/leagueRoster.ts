/**
 * Who is in the league's roster, what they may be called, and where a hidden
 * one still counts.
 *
 * ## A result carries no name, which is what makes RENAME free
 *
 * `addResultMutation` writes `leaguePlayerId` and nothing identifying, so
 * correcting the player document fixes every past night in the standings and in
 * the drill-down at once, and future games match the new spelling. Nothing is
 * lost and nothing is migrated.
 *
 * ## And it is what makes DELETE unsafe in BOTH directions
 *
 * `useLeague` joins results to players **roster-outer** —
 * `cloudResults.filter(r => r.leaguePlayerId === player.id)` — and nothing in
 * the app ever iterates `tournamentResults` as the outer loop. So:
 *
 * - delete the player AND their results, and real history is gone;
 * - delete the player and KEEP their results, and those rows become **invisible
 *   orphans**: absent from the standings, from `countGamesPlayed`, and therefore
 *   from `nextGameNumber`, which goes BACKWARDS — while still stored.
 *
 * Both are wrong, which is why the action a director reaching for "this name
 * won't play again" actually wants is a HIDE. Reported as exactly that: removing
 * a player must not remove their results.
 *
 * ## The hide is honoured in TWO places and deliberately nowhere else
 *
 * `offerableRoster` (the Add Player lists) and `rosterForStandings` (a row with
 * nothing in it). Every other reader of the roster — `seasonProgress.ts`'s
 * `countGamesPlayed`/`gameNumberFor`/`nextGameNumber`, `SeasonDashboard`, the
 * CSV and both image exports — must go on counting a hidden player exactly as
 * before. **Excluding them from the counters would move the game number**, which
 * is a fact about the league rather than a preference about a list.
 */

export interface RosterPlayerLike {
  id: string | number;
  name?: string;
  /** Set by Hide. Absent on every player written before this shipped, which is
   *  why the test is `=== true` rather than truthiness. */
  archived?: boolean;
}

export interface StandingsPlayerLike extends RosterPlayerLike {
  tournamentResults?: any[];
}

/** One spelling of the flag, so a second reading of it cannot drift. */
export function isHidden(player: RosterPlayerLike | null | undefined): boolean {
  return player?.archived === true;
}

const key = (name: string | undefined) => (name || '').trim().toLowerCase();

/**
 * Why this name cannot be used, or null when it can.
 *
 * `exceptId` is the player being renamed, and leaving it out is a real mutant:
 * without it a player could never be renamed to their own name, so correcting
 * `dave` to `Dave` — a capitalisation fix, the commonest kind — would be refused
 * by the very feature meant to allow it.
 *
 * **A HIDDEN player still blocks a name, and that is not an oversight.**
 * `recordResultByName` matches by name across every document regardless of the
 * flag, so a hidden namesake would still capture future nights — invisibly,
 * because they are hidden. Hiding someone takes them out of the pickers; it does
 * not free up their name.
 */
export function rosterNameConflict(
  players: readonly RosterPlayerLike[] | null | undefined,
  name: string,
  exceptId?: string | number,
): string | null {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Enter a name.';

  const clash = (players ?? []).find(p =>
    String(p.id) !== String(exceptId) && key(p.name) === key(trimmed));

  return clash ? `${clash.name} is already in this league.` : null;
}

/**
 * The roster as the Add Player lists offer it: sorted, one entry per name,
 * without anybody hidden and without anybody already in tonight's game.
 *
 * **Extracted from `PlayerSection`, where it was inline** — the `seatablePlayers()`
 * argument, and the one this codebase keeps paying for: the results-column arrows
 * and the two seaters were all correct in isolation and wrong in a few lines of
 * component, which has no test by construction.
 *
 * The de-dupe is load-bearing and predates the hide: its original comment reads
 * "Firestore may have stale duplicate docs".
 */
export function offerableRoster<T extends RosterPlayerLike>(
  players: readonly T[] | null | undefined,
  takenNames: readonly string[] = [],
): T[] {
  const taken = new Set((takenNames ?? []).map(key));
  const seen = new Set<string>();
  return (players ?? [])
    .filter(player => {
      const k = key(player.name);
      if (!k || isHidden(player) || taken.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

/**
 * The standings' rows for one season: every player, their results narrowed to
 * that season — and no row at all for a hidden player who did not play it.
 *
 * **A hidden player who DID play the season is listed exactly as before.** Their
 * results are real and the season has to add up; hiding is about not being
 * offered, not about being erased. A player who is NOT hidden keeps their row of
 * zeros too, which is today's behaviour and is left alone.
 *
 * **The drop only applies once `seasonId` is resolved, and that is load-bearing.**
 * The unresolved branch hands everybody an empty result list, so applying it
 * there would drop EVERY hidden player for a frame and then bring back the ones
 * who played — a flicker. Before the season is known, "no games this season" is
 * not an answer, it is "not loaded yet": the same distinction `pinIsDead()` draws
 * between `missing` and `error`.
 */
export function rosterForStandings<T extends StandingsPlayerLike>(
  players: readonly T[] | null | undefined,
  seasonId: string | number | null | undefined,
): T[] {
  if (!Array.isArray(players)) return [];

  if (!seasonId) {
    return players.map(player => ({ ...player, tournamentResults: [] }));
  }

  return players
    .map(player => ({
      ...player,
      tournamentResults: (player.tournamentResults || []).filter(
        (result: any) => result.seasonId === seasonId,
      ),
    }))
    .filter(row => !(isHidden(row) && row.tournamentResults.length === 0));
}

/**
 * Why this player cannot be deleted outright, or null when they can.
 *
 * Deleting is offered for a player with NO results — a genuine phantom, with
 * nothing to lose, which `removeTournamentResultForPlayer` can produce when a
 * rebuy takes back somebody's only recorded night. With results behind them
 * there is no safe deletion at all (see this module's header), so the button
 * renders disabled carrying this sentence, which names the two things that DO
 * work. The `lib/entryLimits.ts` → `PlayerEntryActions` pattern: the wording
 * lives with the rule rather than in whichever screen asks.
 */
export function deleteBlockedReason(
  player: RosterPlayerLike | null | undefined,
  resultCount: number,
): string | null {
  const games = Number(resultCount) || 0;
  if (games <= 0) return null;
  const name = (player?.name || '').trim() || 'This player';
  return `${name} has ${games} recorded ${games === 1 ? 'result' : 'results'} in the standings. `
    + 'Hide them instead, or rename them if the spelling is wrong.';
}
