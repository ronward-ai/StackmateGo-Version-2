import { nameKey } from './leagueRecorder';

/**
 * Why a league player may NOT be renamed to `next` — or null when they may.
 *
 * A rename is safe in itself: a result carries `leaguePlayerId` and no name, so
 * every result follows the player. What is not safe, and why each refusal exists:
 *
 * - **A name another league player already has.** `recordResultByName` matches by
 *   lowercased name over every player document and `useLeague` merges documents
 *   that share one into a single row — two people under one name would merge their
 *   histories, and the next result would be filed against whichever came first.
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
  const nextKey = nameKey(trimmed);
  if (nextKey !== currentKey && leagueNames.some(n => nameKey(n ?? '') === nextKey)) {
    return `Another player in this league is already called ${trimmed}.`;
  }
  return null;
}
