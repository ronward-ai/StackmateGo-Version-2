/**
 * Whether this device is sitting on a roster change it has not had written yet.
 *
 * WHY THIS EXISTS, and it is a bug that cost a director a rebuy in a real game:
 *
 * `lib/snapshotMerge.ts` biases the merge toward LOCAL for eliminations, so the
 * echo of the console's own bust-out write cannot resurrect the player it just
 * busted. What it does NOT protect is a local change in the other direction —
 * and one second after a bust-out the document legitimately says that player is
 * out, because that is this device's own echo in flight.
 *
 * So: bust a player out (write #1), press Rebuy, echo of write #1 arrives, and
 * the merge's "eliminated in the document, active locally: allow it" rule puts
 * them straight back out. The revert then changes `state.players`, which fires
 * the players sync effect, which writes the busted roster back as write #3. The
 * rebuy is gone from the document as well as the screen, permanently — which is
 * why it reads as "I pressed the button and nothing happened" rather than as a
 * flicker.
 *
 * The final table lost its seat redraw to the same echo through the same merge.
 *
 * **Nothing about the race was new.** The rebuy used to be a button that
 * lingered for the whole rebuy period, so it was always pressed minutes after
 * the echo had landed. Making a rebuy immediate — which is what a rebuy is —
 * moved it inside the window.
 *
 * THE RULE: a device that is driving the game is the only writer, so a snapshot
 * can tell it nothing new about the roster until its own writes have landed.
 * "One writer per fact", applied to the read side.
 *
 * Module scope, for the reason `lib/liveGameWrite.ts` and `lib/syncReporter.ts`
 * hold their facts the same way and say so: there is one live game and one
 * connection, the writer is an effect and the reader is a Firestore callback,
 * neither with a route to a provider — and two answers to "is a write
 * outstanding" could only disagree.
 */

/**
 * What the players sync effect actually sends, as one string.
 *
 * **The writer and the reader MUST serialise the same thing**, or this breaks in
 * the worst direction: if the write guard records a wider payload than the
 * pending check compares, the roster reads as pending on every snapshot for the
 * rest of the night and the console stops applying the document at all. One
 * builder, used by both, is the only way that cannot drift.
 *
 * `isFinalTable` rides in here because it rides in the same WRITE — it is a fact
 * about the game, it changes in the same `setState` as the seats it redraws, and
 * a device that has just collapsed the table must not have the echo of the
 * previous write tell it otherwise. `updatedAt` is deliberately absent: it
 * changes on every write by definition, so including it would make every payload
 * differ from the last and defeat the comparison entirely — the same trap
 * `lib/setupSync.ts` records for its own fingerprint.
 */
export interface RosterPayload {
  players: unknown;
  isFinalTable?: boolean;
}

export function rosterPayload(payload: RosterPayload): string {
  return JSON.stringify({
    players: payload.players ?? [],
    isFinalTable: !!payload.isFinalTable,
  });
}

/**
 * The payload last SUCCESSFULLY written, from `rosterPayload`. `null` means
 * nothing has been written yet this game.
 */
let lastWritten: string | null = null;

/**
 * Called where the sync effect records a payload as synced — which is only ever
 * on `'written'`, never on a skipped or failed write. Passing null forgets it,
 * for a new game.
 */
export function markRosterWritten(serialised: string | null): void {
  lastWritten = serialised;
}

/**
 * Is there a local roster change still waiting on Firestore?
 *
 * **False when nothing has been written yet, and that default is load-bearing.**
 * Before the first write there is no local change to protect, and answering
 * `true` would stop the very first snapshot from seeding the roster — the
 * `hasLoadedRemoteState` hazard with the sign flipped, and how a resumed game
 * would come up empty.
 *
 * Self-clearing: the moment the write lands the payloads match again, so the
 * window is exactly as long as the hazard and not one snapshot longer.
 */
export function rosterIsPending(payload: RosterPayload): boolean {
  if (lastWritten === null) return false;
  return rosterPayload(payload) !== lastWritten;
}
