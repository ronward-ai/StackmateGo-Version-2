/**
 * JSON with every object's keys in sorted order, and `undefined` written as
 * `null` — so two values that are the same to Firestore serialise to the same
 * string.
 *
 * WHY (October 2026, a live league night): the sync effects decide "is this
 * already saved?" by comparing serialised payloads, and plain `JSON.stringify`
 * follows key ORDER. A Firestore map has no order — the same document comes back
 * with its fields in a different order from one snapshot to the next — and the
 * snapshot merge builds each player as `{ ...incoming, ... }`, so a roster that
 * had not changed at all serialised differently on every snapshot. The players
 * sync saw a "change", wrote it, that write's snapshot came back in another
 * order, and so on: a write a second, a redraw a second on every device, the
 * Tables and Seats boxes reset mid-typing, levels jumping. `undefined` vs `null`
 * is the same fault by another route — the write turns one into the other.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalise);
  if (value instanceof Date) return value.toISOString();
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = normalise((value as Record<string, unknown>)[key]);
  }
  return out;
}
