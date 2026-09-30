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
 * WHAT THE DOOR NOW CHECKS: whether this device holds control of the game.
 * `lib/directorControl.ts` owns that decision; the current answer is held at
 * MODULE SCOPE here, set from the tournament snapshot by `PokerTimer`.
 *
 * Module scope rather than a context, for the reason `lib/syncReporter.ts` holds
 * the sync streak the same way: there is one database, one connection and one
 * live game, so two answers to "may this device write" could only disagree — and
 * the writers that most need gating are effects and callbacks with no route to a
 * provider. That is the shape the removed lock failed on.
 *
 * `fields` goes through `sanitizeForFirestore`, so this door is for plain
 * values only — a Firestore SENTINEL (`deleteField()`, `serverTimestamp()`)
 * must not be passed through it. Nothing routed here needs one; the participant
 * unclaim that does is outside this door anyway.
 *
 * The Firebase import is dynamic to match every call site it replaced, so this
 * does not pull the SDK into a chunk that did not already have it.
 */

import { controlOf, mayDrive, type Control } from '@/lib/directorControl';

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
 * Who is driving, as last read from the tournament document.
 *
 * `tournamentId` is part of it deliberately: the answer is about ONE game, and a
 * control fact left over from the previous game would gate writes to the next
 * one. A held id belonging to no current game is worth nothing — the same fault
 * `consoleTournamentId()` exists to stop.
 */
let control: { tournamentId: string; holder: string | null; myDeviceId: string } | null = null;

/** Called from the snapshot handler. Passing null forgets the fact entirely. */
export function setLiveGameControl(
  next: { tournamentId: string | number; holder: string | null | undefined; myDeviceId: string } | null,
): void {
  control = next
    ? {
        tournamentId: String(next.tournamentId),
        holder: next.holder ?? null,
        myDeviceId: next.myDeviceId,
      }
    : null;
}

/**
 * This device's control of `tournamentId`, for the gate and for the banner.
 *
 * A game we hold no fact about is `unclaimed`, NOT `other`. The fact arrives
 * with the first snapshot, and refusing to write until then would re-gate every
 * write behind a read — which `hasLoadedRemoteState` already does, in the place
 * that owns it.
 */
export function liveGameControl(tournamentId: string | number | null | undefined): Control {
  if (!tournamentId || !control) return 'unclaimed';
  if (control.tournamentId !== String(tournamentId)) return 'unclaimed';
  return controlOf(control.holder, control.myDeviceId);
}

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

  // Another device is driving this game. Standing down is the whole point of
  // the door: a second console writing its own copy of the roster is how the
  // first removed lock silently reverted a director's rebuys.
  if (!mayDrive(liveGameControl(tournamentId))) return 'skipped';

  const { doc, updateDoc } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  const { sanitizeForFirestore } = await import('@/lib/utils');

  await updateDoc(
    doc(db, 'activeTournaments', String(tournamentId)),
    sanitizeForFirestore(fields),
  );
  return 'written';
}

/**
 * Hand control back, if this device is the one holding it.
 *
 * **Nothing in this app ever released a claim, and that was the bug.** There was
 * exactly one write of `controllingDeviceId` — the claim below — and it only ever
 * SET. Not when a game finished, not when the director signed out, not on
 * teardown. So every game an account had ever taken live carried a holder for
 * good, and any OTHER device opening it read `other` and went read-only: a
 * director who ran a game on the laptop and opened it next week on a tablet was
 * locked out of their own finished tournament until they found Take control.
 *
 * Reported from a live night in exactly that shape — a banner reading "this game
 * is being run on another device" about a game nobody was running, on a phone
 * that had resumed an old test game from home.
 *
 * **A transaction that checks first, for the reason the claim is one**: it reads
 * the live holder and clears the field only when `controlOf` says the claim is
 * ours. A device can give up its own control and can never strip anybody else's,
 * which is what keeps this from being the automatic steal the claim's own comment
 * rules out.
 *
 * **This is release, not timeout.** Control is given back by the holder — when the
 * game ends, or when the director signs out, which in this app IS the handover.
 * Nothing takes it on a clock: a tournament break is twenty minutes of silence and
 * indistinguishable from an abandoned game, so idleness can never be the signal.
 */
export async function releaseLiveGameControl(
  tournamentId: string | number | null | undefined,
  myDeviceId: string,
): Promise<'released' | 'not-mine'> {
  if (tournamentId === null || tournamentId === undefined || tournamentId === '') return 'not-mine';

  const { doc, runTransaction } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  const ref = doc(db, 'activeTournaments', String(tournamentId));

  return runTransaction(db, async (tx): Promise<'released' | 'not-mine'> => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return 'not-mine';
    const holder = snap.data()?.controllingDeviceId ?? null;
    // Only our own claim. `unclaimed` is already released and needs no write.
    if (controlOf(holder, myDeviceId) !== 'mine') return 'not-mine';

    tx.update(ref, { controllingDeviceId: null, controlClaimedAt: null });
    return 'released';
  });
}

/**
 * The outcome of asking for control. `held` means another device has it and this
 * was not a takeover, so nothing was written.
 */
export type ControlClaim = 'claimed' | 'already-mine' | 'held';

/**
 * Claim control of a live game, or take it.
 *
 * Deliberately NOT gated by the door above, which would be circular: a device
 * with no control could never ask for it.
 *
 * A TRANSACTION, for the reason `lib/seatClaims.ts` gives for the same shape: it
 * reads the live holder before writing, so two devices loading at the same
 * moment cannot both come away believing they claimed an unheld game.
 *
 * `force` is the Take control button, and it must ALWAYS be able to win. A
 * director whose phone has died, been left at home, or simply has a flat battery
 * would otherwise be locked out of their own tournament by a device that cannot
 * hand it back — which is worse than the problem this lock solves. There is no
 * timeout, no heartbeat and no automatic steal: one explicit press, by the
 * person standing there.
 */
export async function claimLiveGameControl(
  tournamentId: string | number | null | undefined,
  myDeviceId: string,
  opts: { force?: boolean } = {},
): Promise<ControlClaim> {
  if (tournamentId === null || tournamentId === undefined || tournamentId === '') return 'held';

  const { doc, runTransaction } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  const ref = doc(db, 'activeTournaments', String(tournamentId));

  return runTransaction(db, async (tx): Promise<ControlClaim> => {
    const snap = await tx.get(ref);
    const holder = snap.exists() ? (snap.data()?.controllingDeviceId ?? null) : null;
    const state = controlOf(holder, myDeviceId);

    if (state === 'mine') return 'already-mine';
    if (state === 'other' && !opts.force) return 'held';

    tx.update(ref, {
      controllingDeviceId: myDeviceId,
      controlClaimedAt: new Date().toISOString(),
    });
    return 'claimed';
  });
}
