import type { TournamentDetails } from '@/types';

/**
 * Every game that is not already a Firestore document carries a `localGameId`,
 * and that is load-bearing rather than bookkeeping.
 *
 * **The document id IS the `localGameId`.** That is the whole mechanism behind
 * "a collision means JOIN, not overwrite": the same night's game has the same id
 * on every device, so a second device's `createTournamentDocument` 409s and
 * `createDocViaRest` adopts the existing document instead of writing over it.
 * It is also what the auto-save's adopt guard matches on before writing
 * anything.
 *
 * **Standalone games did not have one**, and the protection therefore did not
 * apply to them at all. `createTournamentDocument` passed `undefined`,
 * `createDocViaRest` fell through to the auto-generated-id branch, and its
 * 409-adopt arm requires a `docId` — so two devices on one standalone night made
 * two documents with nothing to collide on, and nothing anywhere said so.
 *
 * It was never a decision. `resetTournament` has always minted one for both
 * kinds, `updateTournamentDetails` back-filled one for league games only, and
 * the local-progress mirror already worked around the gap in a comment reading
 * *"A standalone game carries no localGameId on details — only league games do —
 * so fall back to the stored id, which exists for every local game."* The stored
 * id was always there; only `details` disagreed.
 *
 * Kept here, pure, because the rule is one line and the bug was that the line
 * appeared in three places and said something different in one of them.
 */

/**
 * A DATABASE game is deliberately excluded: it already has a document, and its
 * `id` is the identity everything keys on. Giving it a second, local identity
 * that may not match the document it is driving is exactly the "two answers to
 * one question" fault this codebase keeps paying for.
 */
export function needsLocalGameId(details: { type?: string; localGameId?: string } | null | undefined): boolean {
  if (!details) return false;
  if (details.localGameId) return false;
  return details.type === 'standalone' || details.type === 'season';
}

/**
 * The `details` a game starts life with.
 *
 * `mintLocalGameId` is a thunk so that opening a database tournament does not
 * mint — and therefore does not STORE — an id it will never use, which would
 * then be inherited by the next local game started in this browser.
 */
export function initialDetails(
  tournamentId: string | undefined | null,
  isSeasonTournament: boolean,
  mintLocalGameId: () => string,
): TournamentDetails {
  if (tournamentId) {
    return { type: 'database', id: tournamentId };
  }
  return {
    type: isSeasonTournament ? 'season' : 'standalone',
    localGameId: mintLocalGameId(),
  };
}
