import {
  HEALTHY, type SyncHealth, isBlocked, markReported, recordFailure, recordSuccess,
  shouldReport, syncFailureMessage,
} from './syncHealth';
import { toast } from '@/hooks/use-toast';
import { reportToOverlay } from './debugOverlay';

/**
 * The one place that holds how the database writes are faring.
 *
 * `lib/syncHealth.ts` owns the JUDGEMENT — report once per streak, and make
 * `unavailable` prove it persists before saying anything. What was missing was
 * somewhere to hold the streak. It lived in a closure inside `PokerTimer`, so
 * `useSeasons`, `useLeagueSettings` and the Buy-in tab had no way to reach it
 * and simply logged to a console nobody has open on a tablet.
 *
 * ONE streak for the whole app, deliberately. There is one database and one
 * connection, so two reporters would each raise their own toast for the same
 * outage — which is exactly the "three identical destructive toasts that will
 * not go away" problem syncHealth was written to end.
 *
 * Module scope rather than a provider, matching `lib/sharedSnapshot.ts`:
 * `toast` is exported standalone from `hooks/use-toast.ts`, so nothing here
 * needs to be inside React to speak.
 */

let health: SyncHealth = HEALTHY;
let blocked = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(fn => fn());
}

/** For `useSyncExternalStore`. */
export function subscribeSyncHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Is the app unable to reach the database right now? Drives the standing chip. */
export function getSyncBlocked(): boolean {
  return blocked;
}

/**
 * A write failed.
 *
 * `what` names the sync so the message reads as a sentence — "Players could not
 * be saved", "The points system could not be saved".
 */
export function reportWriteFailure(what: string, error: unknown): void {
  const code = (error as { code?: string } | null)?.code ?? 'unknown';
  console.error(`${what} sync to Firestore failed:`, error);

  const now = Date.now();
  let next = recordFailure(health, code, now);
  if (shouldReport(next, now)) {
    const description = syncFailureMessage(next, what);
    next = markReported(next);
    toast({ title: 'Sync issue', description, variant: 'destructive' });
    // The overlay is for phones, which have no console to read.
    reportToOverlay(`sync ${code}: ${description}`);
  }
  health = next;

  const nowBlocked = isBlocked(health, now);
  if (nowBlocked !== blocked) {
    blocked = nowBlocked;
    emit();
  }
}

/** A write landed. Ends the streak. */
export function reportWriteSuccess(): void {
  health = recordSuccess();
  if (blocked) {
    blocked = false;
    emit();
  }
}

/** Test seam. Nothing in the app calls this. */
export function __resetSyncReporter(): void {
  health = HEALTHY;
  blocked = false;
  listeners.clear();
}
