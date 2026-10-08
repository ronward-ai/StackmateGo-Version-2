/**
 * Has the game being run finished, and who won it?
 *
 * THE FACT THIS EXISTS FOR: when a tournament ends, EVERY player is inactive —
 * including the winner. `eliminatePlayer` awards the last player standing
 * `position: 1` and `isActive: false` in the same state update
 * (`hooks/useTournament.ts`), because that is how the rest of the app tells a
 * finished game from one still in play.
 *
 * So any check shaped "exactly one player is still active" is zero at the very
 * moment it is supposed to fire, and three separate pieces of UI were gated on
 * one: the Tournament Over banner on the console, the same banner on every
 * player's phone, and the Tournament Winner card. None of them had ever been
 * seen on a completed game. They were not subtly wrong — they were dead.
 *
 * One predicate, so a fourth cannot be written differently again.
 */

/**
 * Only what deciding "is it over" needs. A `Player` satisfies it, and so does
 * an untyped entry from a tournament document read back out of Firestore.
 */
export interface GameOverPlayerLike {
  isActive?: boolean | null;
  position?: number | null;
  name?: string | null;
}

/**
 * Still in the tournament?
 *
 * `isActive !== false` rather than `=== true`, because an ABSENT flag means
 * active everywhere in this app — a player from an older saved game or a
 * Firestore round-trip may carry no flag at all, and `eliminatePlayer`'s own
 * comment records what reading that as "not active" cost the last time.
 *
 * A finishing position also means out, and that clause is what makes this one
 * function correct for both the console's state and a stored document: a
 * player still in the game never has one, so it can only ever add players the
 * flag alone would have missed.
 */
function stillIn(p: GameOverPlayerLike): boolean {
  if (p?.isActive === false) return false;
  return !(Number(p?.position) > 0);
}

/**
 * Is this game finished?
 *
 * Three conditions, and the third is the one that stops a half-built or wiped
 * roster reading as a finished tournament: somebody has to have actually won.
 */
export function gameIsOver(players?: readonly GameOverPlayerLike[] | null): boolean {
  if (!players || players.length < 2) return false;
  if (players.some(stillIn)) return false;
  return players.some(p => Number(p?.position) === 1);
}

/**
 * Whoever came first, or null.
 *
 * Deliberately independent of `gameIsOver` — callers that want both ask for
 * both. At the end of a game there is no "active" player left to read a name
 * from, which is exactly how the winner went missing from the screens above.
 *
 * Generic so a caller gets back the type it passed in: a `Player` in, a
 * `Player` out, id and all, rather than this module's minimal shape.
 */
export function winnerOf<T extends GameOverPlayerLike>(
  players?: readonly T[] | null,
): T | null {
  if (!players) return null;
  return players.find(p => Number(p?.position) === 1) ?? null;
}

/**
 * What a finished game says where the ways in used to be, or null while it is
 * still being played.
 *
 * **A finished game takes no new entries** — no added player, no re-entry, no
 * rebuy. Adding one makes the game read as unfinished again on every screen
 * after History was already written, and re-entering the runner-up runs
 * `positionsAfterReEntry`, which moves the winner from 1st to 2nd. Late entry
 * only WARNS, because somebody arriving at the door is a fact about the world;
 * after the final hand there is no game left to arrive at.
 *
 * It names both ways forward, because a line that only says "no" is what
 * `rebuyUnavailableReason` was written to replace: a wrong ending is put right
 * with Undo bust-out, which is deliberately left open, and anything else is the
 * next game.
 */
export function finishedGameNote(players?: readonly GameOverPlayerLike[] | null): string | null {
  if (!gameIsOver(players)) return null;
  return 'This game is over. To correct the result, undo the last bust-out — otherwise start the next game.';
}

/**
 * Does a game recorded as finished need reopening (October audit, M12)?
 *
 * The completion effect writes `status: 'completed'` and History the moment the
 * game ends — and nothing ever un-wrote either. After the documented correction
 * for a misrecorded final hand (Undo bust-out), play carried on, but resume and
 * handover skipped the game as finished, and the corrected ending never reached
 * History, which kept the first winner. A finished status on a game that is no
 * longer over — whether written here or read from the document — is the signal.
 */
export function shouldReopen(
  players: readonly GameOverPlayerLike[] | null | undefined,
  storedStatus: string | null | undefined,
  finishedHere: boolean,
): boolean {
  if (!players || gameIsOver(players)) return false;
  return storedStatus === 'completed' || finishedHere;
}

/**
 * Should the completion effect record this game as finished — the status write
 * and the History record?
 *
 * Not merely because it IS finished. The effect's memory of what it has saved
 * lives in a ref, which every mount starts empty, so OPENING a game that ended
 * last week re-ran it: History was re-saved with a new end time and the game
 * jumped to the top of the list. Reopening a game from History to correct it
 * would have made that the common case. A game the document already says is
 * completed has been recorded; it is recorded again only once it has been
 * reopened (`shouldReopen` clears the status) and has ended again.
 */
export function shouldRecordCompletion(
  players: readonly GameOverPlayerLike[] | null | undefined,
  storedStatus: string | null | undefined,
  alreadySavedHere: boolean,
  /** The results editor has just rewritten this game: record it again, as a correction. */
  correction = false,
): boolean {
  if (!gameIsOver(players)) return false;
  if (correction) return true;
  if (alreadySavedHere) return false;
  return storedStatus !== 'completed';
}

/**
 * The status the game record holds, as this console last heard it. The snapshot
 * spreads the document's `status` onto state; the first read puts it on
 * details. The snapshot is the newer of the two.
 */
export function storedStatusOf(state: { details?: unknown } | null | undefined): string | null | undefined {
  const s = state as any;
  if (!s) return undefined;
  return 'status' in s ? s.status : s.details?.status;
}

/**
 * What the completion effect writes onto the live game when it ends.
 *
 * It used to release control too (`controllingDeviceId: null`). The console
 * that ended the game did not claim again — its claim ran once per game — so a
 * finished night that was then corrected, or simply left open on two devices,
 * had no holder and both could drive it. A console hands a game back when it
 * moves OFF it (`useReleaseControlOnLeave`) or signs out; finishing it is not
 * leaving it.
 */
export function completionFields(now: Date = new Date()): { status: 'completed'; updatedAt: string } {
  return { status: 'completed', updatedAt: now.toISOString() };
}
