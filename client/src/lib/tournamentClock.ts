/**
 * How much of the level is left, from a tournament document.
 *
 * The document carries the clock in two forms and they are NOT equally
 * trustworthy:
 *
 *   - `targetEndTime` is absolute — the wall-clock moment the level ends. It
 *     stays true no matter how long ago it was written.
 *   - `secondsLeft` is a countdown snapshotted at write time. It is true only at
 *     the instant it was stored.
 *
 * Reading the second one over a running clock is what made the console's timer
 * freeze and then jump. It went unnoticed for a long time because the app was
 * writing the document about twice a second, so the stored countdown was never
 * more than a moment stale — the bug was being propped up by a write storm, and
 * appeared the moment that was fixed.
 *
 * So: while the clock is RUNNING the end time decides, and the stored countdown
 * is ignored. Paused, the countdown is all there is — and that is fine, because
 * pausing is itself a write, so the stored value is fresh exactly when it is
 * needed.
 *
 * Pure, per the lib/ convention: `now` is passed in.
 */
export interface ClockFields {
  isRunning?: boolean;
  targetEndTime?: number | null;
  secondsLeft?: number;
}

export function secondsLeftFrom(clock: ClockFields, now: number): number {
  if (clock.isRunning && typeof clock.targetEndTime === 'number' && clock.targetEndTime > 0) {
    return Math.max(0, Math.ceil((clock.targetEndTime - now) / 1000));
  }
  if (typeof clock.secondsLeft === 'number' && clock.secondsLeft >= 0) {
    return Math.floor(clock.secondsLeft);
  }
  return 0;
}
