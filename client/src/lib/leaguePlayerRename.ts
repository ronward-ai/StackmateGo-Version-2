import { nameKey } from './leagueRecorder';

/**
 * Why a league player may NOT be renamed to `next` — or null when they may.
 *
 * A rename is safe in itself: a result carries `leaguePlayerId` and no name, so
 * every result follows the player. What is not safe, and why each refusal exists:
 *
 * - A name another league player already has is NOT refused: it merges the two
 *   (`renameMerges`), which is how a misspelt row is put back together with the
 *   real one. The screen asks first, because two different people under one name
 *   would merge their histories.
 * - **A player in tonight's roster.** The recorder finds them by the name in the
 *   game, so renaming here mid-game files their next bust-out as a brand-new
 *   player. Edit results renames both together.
 */
export function renameRefusal(
  current: string,
  next: string,
  leagueNames: readonly (string | null | undefined)[],
  rosterNames: readonly (string | null | undefined)[],
): string | null {
  const trimmed = next.trim();
  if (!trimmed) return 'A name cannot be empty.';
  if (trimmed.length > 60) return 'Keep the name under 60 characters.';
  const currentKey = nameKey(current);
  if (rosterNames.some(n => nameKey(n ?? '') === currentKey)) {
    return `${current} is in tonight's game — rename them in Edit results instead, so tonight's result moves with them.`;
  }
  // A name another player already has is a MERGE, not a refusal — see
  // renameMerges. The screen confirms it.
  return null;
}

/**
 * Whether renaming `current` to `next` would MERGE two league players — the name
 * is another player's already. Not a refusal any more: that is exactly how a
 * misspelt row is put back together with the real one, and the standings
 * already merge documents that share a name into one row. The screen asks for
 * a confirmation, since it is only right when they are the same person.
 */
export function renameMerges(
  current: string,
  next: string,
  leagueNames: readonly (string | null | undefined)[],
): boolean {
  const nextKey = nameKey(next.trim());
  return !!nextKey && nextKey !== nameKey(current) && leagueNames.some(n => nameKey(n ?? '') === nextKey);
}

/**
 * The SOURCE's results to delete when it is merged into the target: those for a
 * game the target already has a result for. Both spellings can carry the same
 * night — the reported case recorded it once under each — and a merged row
 * must count a night once, in points as well as games.
 */
export function duplicateResultsOnMerge<R extends { id?: string | number; leaguePlayerId?: string | number | null; tournamentId?: string | number | null }>(
  results: readonly R[],
  sourceIds: readonly (string | number)[],
  targetIds: readonly (string | number)[],
): R[] {
  const source = new Set(sourceIds.map(String));
  const target = new Set(targetIds.map(String));
  const targetGames = new Set(results
    .filter(r => target.has(String(r.leaguePlayerId)) && r.tournamentId != null && r.tournamentId !== '')
    .map(r => String(r.tournamentId)));
  return results.filter(r => source.has(String(r.leaguePlayerId))
    && r.tournamentId != null && targetGames.has(String(r.tournamentId)));
}
