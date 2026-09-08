/**
 * Whether a run of failed Firestore writes is worth telling the director about.
 *
 * Free of React and Firebase, per the lib/ convention — callers pass the error
 * code they already caught.
 *
 * This exists because both extremes were tried and both were wrong. Reporting
 * every failure meant three identical destructive toasts re-firing on every
 * retry: one underlying problem became a popup that would not go away and said
 * nothing anyone could act on. Suppressing `unavailable` outright — on the
 * reasoning that it is an offline blip which self-heals — meant an ad blocker
 * cancelling every write to firestore.googleapis.com was reported NOWHERE, and
 * a night's tournament was silently never saved.
 *
 * The distinction that matters is not the code. It is whether the failure
 * PERSISTS: an offline blip clears itself in seconds, a blocked browser never
 * does.
 */

/** Consecutive failures before a persistent `unavailable` is worth saying. */
export const PERSISTENT_FAILURES = 3;
/** …or this long, whichever comes first. */
export const PERSISTENT_MS = 20_000;

export interface SyncHealth {
  /** The Firestore code of the current streak, or null when healthy. */
  code: string | null;
  /** How many consecutive failures have carried it. */
  failures: number;
  /** When the streak began. */
  since: number;
  /** Whether this streak has already been reported. Reported once, not per retry. */
  reported: boolean;
}

export const HEALTHY: SyncHealth = { code: null, failures: 0, since: 0, reported: false };

export function recordSuccess(): SyncHealth {
  return HEALTHY;
}

export function recordFailure(health: SyncHealth, code: string, now: number): SyncHealth {
  // A different code is a different problem, and starts its own streak.
  if (health.code !== code) {
    return { code, failures: 1, since: now, reported: false };
  }
  return { ...health, failures: health.failures + 1 };
}

/**
 * Report this streak now?
 *
 * Anything that is not `unavailable` is a real answer from the server —
 * permission-denied, not-found, resource-exhausted — and says something
 * actionable straight away. `unavailable` is the ambiguous one: the same code
 * covers a tunnel, a dropped wifi connection and an extension cancelling every
 * request, so it has to prove it is persistent first.
 */
export function shouldReport(health: SyncHealth, now: number): boolean {
  if (!health.code || health.reported) return false;
  if (health.code !== 'unavailable') return true;
  return health.failures >= PERSISTENT_FAILURES || now - health.since >= PERSISTENT_MS;
}

export function markReported(health: SyncHealth): SyncHealth {
  return { ...health, reported: true };
}

/**
 * Is the app, right now, unable to reach the database at all?
 *
 * Drives the standing "Not syncing" indicator, which is a condition rather than
 * an event and so outlives the toast.
 */
export function isBlocked(health: SyncHealth, now: number): boolean {
  if (!health.code) return false;
  if (health.code !== 'unavailable') return true;
  return health.failures >= PERSISTENT_FAILURES || now - health.since >= PERSISTENT_MS;
}

/**
 * What to say. `what` names the sync, so "Players" and "The clock" read as
 * sentences.
 *
 * The `unavailable` wording names the likely cause, because "unavailable" tells
 * a director nothing and an ad blocker is overwhelmingly the reason a browser
 * cannot reach one specific domain while the rest of the internet works.
 */
export function syncFailureMessage(health: SyncHealth, what: string): string {
  if (health.code === 'unavailable') {
    return 'Cannot reach the database. An ad or tracker blocker is the usual cause — ' +
      'allow this site in it and reload. The game is safe on this device meanwhile.';
  }
  return `${what} could not be saved (${health.code}). Live updates may be delayed.`;
}
