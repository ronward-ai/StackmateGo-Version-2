/**
 * Which of an account's tournaments is the one being run right now.
 *
 * Nothing deletes an `activeTournaments` document, so every game an account has
 * ever taken live is a candidate. Two places need the same answer and must not
 * disagree:
 *
 *  - **Resume.** Signing in on any device reopens the current game. That is the
 *    whole handover mechanism — the outgoing director logs out, the next one
 *    logs in with the same account, and their device finds the game by itself.
 *  - **Auto-save.** A device with local players and no document id would
 *    otherwise mint a *second* document for a night that already has one. Worse,
 *    the id it mints from is the `localGameId`, so it collides with the existing
 *    game. Asking this question first means the device joins instead.
 *
 * Kept free of React and Firebase so it can be tested without mocking: callers
 * pass the documents they have already read.
 */

/** The fields the choice depends on. Structural, so a Firestore doc's data
 *  satisfies it after being given its id. */
export interface LiveTournamentCandidate {
  id: string;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/**
 * A poker night does not span longer than this, so anything untouched for
 * longer is not tonight's game.
 *
 * Picking "newest ever created" instead reopened a test tournament from months
 * earlier whenever there was no current game — which is worse than reopening
 * nothing at all.
 */
export const LIVE_TOURNAMENT_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * A Firestore field that might be an ISO string, a Timestamp, or missing, as a
 * number of milliseconds. 0 when it cannot be read.
 *
 * Not decorative: sorting `String(value)` put "[object Object]" — a Timestamp —
 * above every ISO string, so an old document could outrank tonight's game.
 */
export function timestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (value && typeof value === 'object' && 'seconds' in (value as any)) {
    const seconds = Number((value as any).seconds);
    return Number.isFinite(seconds) ? seconds * 1000 : 0;
  }
  return 0;
}

/** When this tournament was last known to be active. */
export function lastActivityMs(candidate: LiveTournamentCandidate): number {
  return Math.max(timestampMs(candidate.updatedAt), timestampMs(candidate.createdAt));
}

/**
 * The account's current live tournament, or null if it has none.
 *
 * Skips games explicitly marked finished, and anything outside the recency
 * window, then takes the most recently active. `updatedAt` is written on every
 * player sync, so "most recently active" is real rather than "most recently
 * created".
 */
export function findCurrentLiveTournament<T extends LiveTournamentCandidate>(
  candidates: T[],
  now: number = Date.now(),
): T | null {
  const live = candidates
    .filter(c => String(c.status ?? '') !== 'completed')
    .map(c => ({ candidate: c, at: lastActivityMs(c) }))
    .filter(c => c.at > 0 && now - c.at < LIVE_TOURNAMENT_WINDOW_MS)
    .sort((a, b) => b.at - a.at);

  return live.length > 0 ? live[0].candidate : null;
}

/**
 * The account's live game, when it is NOT the game this console is on.
 *
 * The question behind the banner that tells a director their account is already
 * running a game somewhere else — and it is deliberately the SAME question the
 * resume and the auto-save ask, delegated rather than re-filtered. A second
 * `status`/recency filter here would be a fourth notion of "which game is
 * current", which is the exact thing `leagues/{id}.activeSeasonId` exists to
 * have killed.
 *
 * `thisGameId` is `consoleTournamentId()`'s answer, so the banner and the sync
 * effects cannot disagree about which game this device is driving. That
 * identity check is also what keeps this banner and the read-only banner
 * mutually exclusive: a console that IS on the game gets null here, so the two
 * can never both be on screen saying different things about one game.
 *
 * WHY THIS IS NEEDED AT ALL, since the resume already looks the game up: both
 * resume effects are gated, and both gates are load-bearing.
 *
 *  - `PokerTimer` returns early when `activeDirectorTournamentId` is set, so a
 *    pin naming LAST NIGHT'S finished game stops the lookup before it happens.
 *  - `?home=1` suppresses it too, which is correct — that parameter means "do
 *    not reopen the game I just left", and New Tournament relies on it.
 *
 * "Do not reopen mine" is not "do not tell me about theirs", and conflating the
 * two is how a director ran game 5 on a phone and started a SECOND game 5 on a
 * laptop with nothing on screen to say so. This is asked separately, past both
 * gates, and only ever produces a sentence and a button.
 */
export function otherLiveGame<T extends LiveTournamentCandidate>(
  candidates: T[],
  thisGameId?: string | null,
  now?: number,
): T | null {
  const live = findCurrentLiveTournament(candidates, now);
  if (!live) return null;
  if (thisGameId && String(live.id) === String(thisGameId)) return null;
  return live;
}

/**
 * Which document the DIRECTOR'S CONSOLE should be reading and writing — or null
 * when this game is not in the database at all.
 *
 * There were two answers to this and they disagreed. The sync effects used a
 * `dbTournamentId` held in `PokerTimer`'s own state; the QR code used
 * `state.details?.id || dbTournamentId`. New Tournament navigates to `/?home=1`,
 * which is the route the console is already on, so the component never unmounts
 * and that held id SURVIVED THE RESET. The second game of a session therefore
 * showed a QR for the FIRST game's document — with its stale roster and paused
 * clock — while the console wrote nothing anywhere, because the reset had made
 * the game local again and the sync effects wait on a Firestore read that never
 * happens for a local game.
 *
 * So the rule, once:
 *   - a tournament id in the URL is definitive — that route exists to open one
 *     specific game, and it must survive the moment before its document loads;
 *   - otherwise the id ON THE GAME, if it has one;
 *   - otherwise the held id, but only for a game whose type says it is stored;
 *   - a held id belonging to no current game is worth nothing. Returning it is
 *     what caused this.
 *
 * `detailsId` comes first deliberately. Keying on `type === 'database'` alone
 * was wrong, because that field is OVERLOADED: it says both "league or
 * standalone" and "saved to Firestore", and the mode toggle writes the first
 * meaning over the second. Flipping the slider on a saved game therefore made
 * this return null, the syncs stopped, and a removed player came back from the
 * document while re-adding produced a duplicate. Having a document id is the
 * honest marker — `resetTournament` drops it when a new game begins.
 */
export function consoleTournamentId(input: {
  /** From the /tournament/:id/director route, if any. */
  urlId?: string | null;
  detailsType?: string | null;
  detailsId?: string | number | null;
  /** The id the console is currently holding in state. */
  heldId?: string | null;
}): string | null {
  if (input.urlId) return String(input.urlId);
  if (input.detailsId) return String(input.detailsId);
  if (input.detailsType !== 'database') return null;
  return input.heldId ? String(input.heldId) : null;
}

/**
 * How a console's attempt to read the tournament it believes it is driving
 * resolved.
 *
 * `pending` is not a failure — it is the ordinary first moment of every load.
 * The distinction that matters is the last two: **`missing` is an answer and
 * `error` is not.**
 */
export type RemoteLoad = 'pending' | 'loaded' | 'missing' | 'error';

/**
 * Whether the id the console is driving has been PROVEN not to exist, and
 * should therefore be abandoned.
 *
 * `localStorage.activeDirectorTournamentId` sends the console to
 * `/tournament/{id}/director` on every visit, and nothing ever checked that the
 * game was still there. A pin outlives the game it names — a deleted test game,
 * an account wipe on another device, a document that was never created — and on
 * that route the console then held an id it could never read:
 *
 *   - the initial `getDoc` found nothing and only logged, so `details.id` was
 *     never set, so the snapshot listener never attached, so
 *     `hasLoadedRemoteState` never closed, so all three sync effects stood down;
 *   - and `dbTournamentId` is seeded from the URL, so the auto-save — the one
 *     path that would have created a real document — returned early on the
 *     strength of the very id that was broken.
 *
 * A director started a game, added players, refreshed, and they were gone. The
 * only thing on screen blamed an ad blocker.
 *
 * **Only `missing` counts.** A read that FAILED is not evidence the game is
 * gone, and discarding a pin on a flaky connection is how this codebase has
 * lost a live game before. An error leaves the pin exactly where it is.
 */
export function pinIsDead(load: RemoteLoad, id?: string | null): boolean {
  if (!id) return false;
  return load === 'missing';
}
