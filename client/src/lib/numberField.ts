/**
 * What a typed string becomes when a numeric field is left.
 *
 * The Tables and Seats/Table fields could not be changed at all, and the reason
 * is worth keeping because it looks like a sync bug and is not one. They were
 * controlled inputs whose `onChange` threw away anything that was not already a
 * valid FINAL number:
 *
 *   const v = parseInt(e.target.value);
 *   if (!isNaN(v) && v >= 1 && v <= 20) setNumberOfTables(v);
 *
 * So the field could not be cleared — backspacing to empty gives `''`, which is
 * NaN, which is rejected, so the old value re-rendered instantly and there was
 * no way to start a fresh number — and it could not be appended to, because
 * from `3` typing a second digit makes `"35"`, which is over the maximum and
 * therefore also rejected. Select-all-then-type-one-digit was the only gesture
 * that worked, which is not a gesture anyone performs on purpose.
 *
 * **Typing passes through states that are not valid numbers.** An empty field
 * and a half-typed one are both normal, and a numeric input has to allow them
 * on the way; the value is only decided when the field is LEFT. That is what
 * this function is for, and it is the whole rule.
 *
 * **Clamping, not rejecting.** A director who types 30 tables means "lots", and
 * silently keeping 3 teaches them the control is broken — which is exactly the
 * lesson the old code taught. Out of range settles at the nearest end.
 *
 * Empty or unparseable returns `fallback`, so leaving a field blank is a no-op
 * rather than a surprise.
 */
export function commitNumber(
  raw: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

/** Whether a string is something a numeric field should allow mid-typing. */
export function isDraftNumber(raw: string): boolean {
  return raw === '' || /^\d+$/.test(raw);
}
