/**
 * Who has checked in as whom.
 *
 * `activeTournaments/{id}.claims` is a top-level map, playerId → deviceId,
 * written only by check-in (`PlayerClaimView`) and read by the participant
 * view to show "this is you". It replaced `Player.claimedBy`, a field living
 * *inside* the players array — which meant a check-in write had exactly the
 * same shape as every other players-array write, so the rule admitting it
 * (`hasOnly(['players'])`, array length preserved) could not tell "set my
 * claim" apart from "rename this player" or "eliminate this player". Any QR
 * visitor could obtain an anonymous session — the participant view mints one
 * for everyone on arrival — and the director's own snapshot handler
 * (`useTournament.ts`) treats an incoming `isActive: false` as a genuine
 * elimination and spreads an incoming active entry wholesale, so a hostile
 * check-in write reached the director's screen and the league standings as
 * if the director had done it themselves.
 *
 * `claims` carries no gameplay data at all — a playerId and a deviceId, and
 * nothing else — so the rule now admits nothing BUT this map from a
 * check-in, and there is nothing left in that branch for a hostile write to
 * reach.
 *
 * NORMALISED ON READ, the same trade `payoutsOf()` and `bandsOf()` make: a
 * tournament document written before this shipped may still carry
 * `Player.claimedBy` from the old scheme, and no stored document is rewritten
 * to keep it working. Every read here prefers `claims` and falls back to the
 * player's own (deprecated) field. **Never write `Player.claimedBy` again.**
 */

export interface ClaimsMap {
  [playerId: string]: string;
}

interface ClaimableTournament {
  claims?: ClaimsMap | null;
  players?: Array<{ id: string; claimedBy?: string | null }> | null;
}

/** Which device holds this seat, new scheme first, old scheme as fallback. */
export function claimedByFor(
  tournament: ClaimableTournament | null | undefined,
  playerId: string,
): string | undefined {
  const fromClaims = tournament?.claims?.[playerId];
  if (fromClaims) return fromClaims;
  const legacy = tournament?.players?.find(p => p.id === playerId)?.claimedBy;
  return legacy || undefined;
}

/** Whether anyone at all — new scheme or old — has claimed this seat. */
export function isClaimed(
  tournament: ClaimableTournament | null | undefined,
  playerId: string,
): boolean {
  return !!claimedByFor(tournament, playerId);
}

/**
 * Which player, if any, this device has claimed.
 *
 * Used as the fallback when the `claimedPlayer_{id}` localStorage key a
 * check-in also sets is missing — a second lookup path, so it is worth
 * getting right rather than leaving it dead: it used to compare a player's
 * `claimedBy` (a device id) against the visitor's *Firebase auth uid*, two
 * different identity spaces that were never going to match. It always
 * returned nothing.
 */
export function myPlayerId(
  tournament: ClaimableTournament | null | undefined,
  deviceId: string | null | undefined,
): string | undefined {
  if (!deviceId) return undefined;
  const fromClaims = tournament?.claims
    ? Object.entries(tournament.claims).find(([, v]) => v === deviceId)?.[0]
    : undefined;
  if (fromClaims) return fromClaims;
  return tournament?.players?.find(p => p.claimedBy === deviceId)?.id || undefined;
}

/**
 * The dotted field path for one player's claim.
 *
 * A check-in updates this ONE path (`tx.update(ref, { [claimFieldPath(id)]:
 * deviceId })`), not the whole `claims` map — Firestore treats a dotted-path
 * update as a merge into the existing map, touching only that key. That is
 * what makes the write race-free without a whole-map read-modify-write: two
 * participants checking in at the same moment touch different keys and
 * cannot clobber each other. `firestore.rules.test.ts` proves the merge
 * behaves this way against the real emulator, not just the SDK's word for it.
 *
 * Centralised so the client and the rules comments describing it cannot say
 * two different things.
 */
export function claimFieldPath(playerId: string): string {
  return `claims.${playerId}`;
}
