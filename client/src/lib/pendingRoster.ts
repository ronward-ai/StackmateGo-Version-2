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
 * Per GAME, keyed by tournament id — never one slot for the tab (October 2026,
 * a real league's game 3).
 *
 * It was module scope with no game attached, reset only by the home route's
 * New Tournament. But opening another game inside the app — History, the
 * season bar, the other-live-game banner — is a client-side navigation: the
 * director route remounts the console and nothing reloads this module. So the
 * new game's first snapshot was judged against the PREVIOUS game's roster,
 * read as "a change not yet written", and the merge kept the console's empty
 * roster; the players sync then wrote `players: []` over a finished night. A
 * late settle from the game just left did the same through `inFlight`.
 *
 * Each game answers only for itself now, so neither can reach another.
 */
interface GameRoster {
  /** The payload last SUCCESSFULLY written, from `rosterPayload`. */
  lastWritten: string | null;
  /**
   * Roster writes ISSUED and not yet settled.
   *
   * "Nothing pending before the first write" assumed the first write had either
   * not happened or had landed. Between the two — a write sent, not yet
   * acknowledged — the document is behind the screen exactly as it is after any
   * other write, and a snapshot in that window applied it: a player rebought
   * while their bust-out's write was still in flight was put straight back out,
   * rebuy count and all (found reproducing a report of rebuys missing from a
   * night). In flight therefore counts as pending, whatever has landed before.
   */
  inFlight: number;
}

const games = new Map<string, GameRoster & { generation: number }>();
let generations = 0;

function entry(gameId: string) {
  let g = games.get(gameId);
  if (!g) { g = { lastWritten: null, inFlight: 0, generation: ++generations }; games.set(gameId, g); }
  return g;
}

/**
 * Call just before a roster write is sent. Returns the game's GENERATION, to
 * hand back when the write settles: a game forgotten meanwhile (a new console
 * mounting on it) must not have its fresh slate written over by a settle from
 * the console before.
 */
export function markRosterIssued(gameId: string): number {
  const g = entry(gameId);
  g.inFlight += 1;
  return g.generation;
}

function current(gameId: string, generation?: number) {
  const g = entry(gameId);
  return generation === undefined || generation === g.generation ? g : null;
}

/** Call when a write ends WITHOUT landing — skipped by the door, or failed. */
export function markRosterSettled(gameId: string, generation?: number): void {
  const g = current(gameId, generation);
  if (g) g.inFlight = Math.max(0, g.inFlight - 1);
}

/**
 * Called where the sync effect records a payload as synced — which is only ever
 * on `'written'`, never on a skipped or failed write. Passing null forgets the
 * game: a new game, or a console starting to listen to one afresh.
 */
export function markRosterWritten(gameId: string, serialised: string | null, generation?: number): void {
  if (serialised === null) { games.delete(gameId); return; }
  const g = current(gameId, generation);
  if (!g) return;
  g.inFlight = Math.max(0, g.inFlight - 1);
  g.lastWritten = serialised;
}

/** Forget every game — a test's clean slate. */
export function forgetRosters(): void {
  games.clear();
}

/**
 * Is there a local roster change for THIS game still waiting on Firestore?
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
export function rosterIsPending(gameId: string, payload: RosterPayload): boolean {
  const g = games.get(gameId);
  if (!g) return false;
  if (g.inFlight > 0) return true;
  if (g.lastWritten === null) return false;
  return rosterPayload(payload) !== g.lastWritten;
}

/**
 * May the players sync send this roster? Never an EMPTY one.
 *
 * Belt and braces for the fault above, and for any other route to it: a console
 * holds `players: []` from the moment it mounts until a read fills it, so an
 * empty roster is far more likely to be "not read yet" than "every player
 * removed". `firestore.rules` refuses the same write — a roster going from
 * players to none — so the app does not attempt one it would only be refused.
 * The way to empty a game is New Tournament.
 *
 * `lastSynced` is kept in the signature for the call site's sake; it no longer
 * changes the answer.
 */
export function mayWriteRoster(players: unknown, _lastSynced?: string): boolean {
  return Array.isArray(players) && players.length > 0;
}
