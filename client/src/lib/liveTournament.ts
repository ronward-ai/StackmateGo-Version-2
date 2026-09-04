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
