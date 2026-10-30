/**
 * JSON with every object's keys in sorted order, and a key holding `undefined`
 * or `null` treated as absent — so two values that are the same to the app
 * serialise to the same string.
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
    const v = (value as Record<string, unknown>)[key];
    // A key holding nothing is the same as no key: the app writes `undefined` as
    // `null`, and an echo may carry either or neither.
    if (v === undefined || v === null) continue;
    out[key] = normalise(v);
  }
  return out;
}

/**
 * The clock sync's dependency on the blind structure, as a value. The effect
 * listed `state.levels` itself, and every snapshot hands state a NEW levels
 * array, so every snapshot re-ran a sync whose payload carries the ticking
 * `secondsLeft` — it always differed and always wrote (October 2026, live).
 */
export function clockSyncKey(levels: unknown): string {
  return stableStringify(levels ?? []);
}
