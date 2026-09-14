/**
 * Where a director's CURRENT (default, in-use) points settings for one league
 * live — a predictable document id, not a query result.
 *
 * `leagueSettings` used to be read entirely by `list`, filtered by `userId`
 * client-side. Firestore rules cannot see a query's `where` clause, only
 * which documents a `list` call would return — so there was no way to let a
 * participant read ONE director's settings without also letting a stranger
 * enumerate every director's settings, which discloses each one's Firebase
 * uid (an account identifier, not just game data) plus their leagueIds and
 * points config.
 *
 * A deterministic id closes that: the rule can make `list` owner-only while
 * `get` on this exact id stays public, because a participant who already
 * knows the tournament's `ownerId` (public) and `leagueId` (public) can
 * compute the same id without listing anything.
 *
 * Saved formula TEMPLATES keep an auto-generated id — they are never public,
 * never read by a participant, and there can legitimately be many per
 * director. Only the one "this is what's currently scoring the league"
 * document needs a name a stranger can compute.
 */
export function defaultSettingsDocId(ownerId: string, leagueId: string | null | undefined): string {
  return `${ownerId}_${leagueId || 'standalone'}`;
}
