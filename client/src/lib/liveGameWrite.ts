/**
 * The one door every director-side write to a live tournament goes through.
 *
 * WHY THIS EXISTS, because it looks like indirection for its own sake:
 *
 * A device lock was built once and removed. `CLAUDE.md` records why — it was
 * "only half-enforced: `broadcastTournamentState` stood down, but the three
 * direct `updateDoc` writers in `PokerTimer.tsx` bypass the broadcast chain by
 * design and kept writing. The device without control still wrote the players
 * array on every local change, so its stale copy overwrote the other device's
 * rebuys — bust-outs worked, rebuys silently reverted."
 *
 * The lesson is not "locks do not work". It is that a rule enforced in three
 * places out of twelve is not a rule. An inventory of this app found writes to
 * `activeTournaments` scattered across six files using eight different gating
 * idioms, four of them resolving the document id their own way. There was
 * nowhere to put the check.
 *
 * So this is the somewhere. Every director-side write lands here, which makes
 * "may this device write to this game right now" a question asked once, in one
 * place, rather than a discipline each new writer has to remember.
 *
 * DELIBERATELY NOT HERE:
 *  - **Participant writes.** A player checking in writes `claims` from their
 *    own phone (`PlayerClaimView`), which is not the director driving the game
 *    and must never be gated by which device the director is on.
 *  - **Account writes.** The director's setup, templates, league and season
 *    admin, history — none of it is the live game, and a director doing admin
 *    on a phone while a console runs is legitimate.
 *  - **Creation.** `lib/tournamentDocument.ts` is the single creation path and
 *    already treats a collision as JOIN rather than overwrite.
 *
 * `fields` goes through `sanitizeForFirestore`, so this door is for plain
 * values only — a Firestore SENTINEL (`deleteField()`, `serverTimestamp()`)
 * must not be passed through it. Nothing routed here needs one; the participant
 * unclaim that does is outside this door anyway.
 *
 * The Firebase import is dynamic to match every call site it replaced, so this
 * does not pull the SDK into a chunk that did not already have it.
 */

/**
 * `written` means it reached Firestore. `skipped` means it deliberately did
 * not — no game to write to, and (once the control lock lands) no right to.
 *
 * Callers MUST NOT record a payload as synced unless they get `written`.
 * Recording a skipped write as saved is how a device that regains control
 * would sit on a stale roster it believes it has already sent: the same fault
 * as marking a FAILED write saved, which this codebase has already paid for.
 */
export type LiveGameWrite = 'written' | 'skipped';

/**
 * Writes `fields` onto the live tournament document.
 *
 * Throws on a Firestore failure rather than swallowing it — the callers differ
 * in how they report (some raise the sync toast, some log) and that judgement
 * stays with them.
 */
export async function writeLiveGame(
  // `string | number` because `details.id` is typed that way and every call
  // site this replaced spelled its own `String(...)`/`.toString()`. Coercing
  // once here is the point of a single door; a caller doing it itself is a
  // caller with its own idea of what the id is.
  tournamentId: string | number | null | undefined,
  fields: Record<string, unknown>,
): Promise<LiveGameWrite> {
  if (tournamentId === null || tournamentId === undefined || tournamentId === '') return 'skipped';

  const { doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  const { sanitizeForFirestore } = await import('@/lib/utils');

  await updateDoc(
    doc(db, 'activeTournaments', String(tournamentId)),
    sanitizeForFirestore(fields),
  );
  return 'written';
}
