/**
 * The one rule renaming a league player needs.
 *
 * **A rename is the right fix for a misspelling, and it costs nothing**:
 * `addResultMutation` writes `leaguePlayerId` and no player NAME, so correcting
 * the player document fixes every past night in the standings and in the
 * drill-down at once, and future games match the new spelling.
 *
 * **The conflict check is the whole safety of it.** `recordResultByName` matches
 * by NAME, so two players in one league sharing a name would send future results
 * to whichever `find` reaches first — and the League Roster picker de-dupes by
 * name, so the duplicate would be INVISIBLE while quietly splitting the league's
 * history. Refusing the rename is the honest answer; merging two players is
 * deliberately not offered, because a merge that guesses which results belong to
 * whom is how a league loses its standings.
 */
export interface RosterPlayerLike {
  id: string | number;
  name?: string;
}

/**
 * Why this name cannot be used, or null when it can.
 *
 * `exceptId` is the player being renamed, and leaving it out is a real mutant:
 * without it a player could never be renamed to their own name, so correcting
 * `dave` to `Dave` — a capitalisation fix, the commonest kind — would be refused
 * by the very feature meant to allow it.
 */
export function rosterNameConflict(
  players: readonly RosterPlayerLike[] | null | undefined,
  name: string,
  exceptId?: string | number,
): string | null {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'Enter a name.';

  const clash = (players ?? []).find(p =>
    String(p.id) !== String(exceptId) &&
    (p.name || '').trim().toLowerCase() === trimmed.toLowerCase());

  return clash ? `${clash.name} is already in this league.` : null;
}
