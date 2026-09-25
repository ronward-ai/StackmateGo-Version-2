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
