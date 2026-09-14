/**
 * A minimal per-key rate limit, in memory.
 *
 * Guards `/api/create-checkout-session` once it requires a verified uid (see
 * server/routes.ts) — unauthenticated, it was a free "make Stripe email this
 * address" primitive with no limit at all; authenticated, the same endpoint
 * still creates a real Checkout Session against the Stripe account on every
 * call, so a compromised or scripted account could still hammer it.
 *
 * In memory, not a shared store: this app runs as a single Railway instance,
 * so that is an honest match for the deployment rather than a shortcut. If
 * this ever runs on more than one instance, the limit becomes per-instance —
 * worth remembering before scaling this out, not before shipping it.
 */

interface Bucket {
  hits: number[]; // timestamps (ms) within the window
}

const buckets = new Map<string, Bucket>();

/** Sweeps a bucket back to only the hits still inside the window. */
function prune(bucket: Bucket, now: number, windowMs: number): void {
  let i = 0;
  while (i < bucket.hits.length && bucket.hits[i] <= now - windowMs) i++;
  if (i > 0) bucket.hits.splice(0, i);
}

/**
 * Records an attempt for `key` and reports whether it is within the limit.
 * Call once per attempt — a rejected attempt is NOT recorded again, so a
 * caller hammering the endpoint doesn't get to keep resetting their own
 * window by trying more often.
 */
export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
  now: number = Date.now(),
): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  prune(bucket, now, windowMs);
  if (bucket.hits.length >= max) return false;
  bucket.hits.push(now);
  return true;
}

/** Test-only: clears all recorded attempts. */
export function resetRateLimits(): void {
  buckets.clear();
}
