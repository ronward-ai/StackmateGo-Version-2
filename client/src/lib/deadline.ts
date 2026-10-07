/**
 * Reject if `promise` has not settled within `ms` (October audit, Low).
 *
 * A Firestore write cancelled by an ad blocker, or made offline, does not
 * reject — the SDK keeps retrying and the promise never settles. Reset, Delete
 * and sign-out each awaited one with no bound, so on a blocked browser they
 * spun for ever; sign-out's release is documented as never blocking, and it
 * could. Same 8 seconds as the preflight, for the same reason.
 *
 * The original promise is not cancelled — Firestore cannot cancel a write — so
 * a write that lands after the deadline still lands. The caller has simply
 * stopped waiting for it.
 */
export const WRITE_DEADLINE_MS = 8000;

export function withDeadline<T>(promise: Promise<T>, ms: number = WRITE_DEADLINE_MS, what = 'write'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`The ${what} did not complete within ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
