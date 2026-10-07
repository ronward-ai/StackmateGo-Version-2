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

export interface ClockLevel {
  duration: number;
  isBreak?: boolean;
}

export interface ClockAdvance {
  /** The level the clock is on once caught up. */
  currentLevel: number;
  secondsLeft: number;
  targetEndTime: number | null;
  isRunning: boolean;
  /** The structure ran out: the last level has ended. */
  finished: boolean;
}

/**
 * Move a running clock past the end of its level — CATCHING UP, from the end
 * time, never restarting from now (October audit, M11).
 *
 * The tick that noticed a level had ended used to start the next one at
 * `Date.now() + duration`, one level per tick. A tablet that slept, or a phone
 * whose director switched apps (iOS suspends the page; Chrome throttles hidden
 * timers to about once a minute), came back minutes after the level ended and
 * started the next one at its FULL length — the schedule slipped by however long
 * it had been away, two elapsed levels collapsed into one, and participants'
 * phones, which derive from `targetEndTime`, sat on 00:00 meanwhile. Even
 * awake, every level lost up to a second.
 *
 * So the next level ends `duration` after the PREVIOUS END, and the loop keeps
 * going through every level that has fully elapsed. It stops where the tick
 * always stopped: at a break-hold (the director presses play after a break) or
 * at the end of the structure. "A running clock is an end time."
 */
export function advanceClock(
  levels: readonly ClockLevel[],
  currentLevel: number,
  targetEndTime: number | null | undefined,
  now: number,
  pauseAfterBreak: boolean,
): ClockAdvance {
  let level = currentLevel;
  let end = typeof targetEndTime === 'number' ? targetEndTime : now;
  for (;;) {
    const next = level + 1;
    if (next >= levels.length) {
      return { currentLevel: level, secondsLeft: 0, targetEndTime: end, isRunning: false, finished: true };
    }
    if (pauseAfterBreak && levels[level]?.isBreak) {
      return { currentLevel: next, secondsLeft: levels[next].duration, targetEndTime: null, isRunning: false, finished: false };
    }
    end += levels[next].duration * 1000;
    level = next;
    if (end > now) {
      return {
        currentLevel: level,
        secondsLeft: Math.max(0, Math.ceil((end - now) / 1000)),
        targetEndTime: end,
        isRunning: true,
        finished: false,
      };
    }
  }
}

/**
 * How the clock's digits are spelled, on the console and on every phone
 * (October audit, Low).
 *
 * There were two: the console capped at `99:59` and padded the minutes, the
 * participant view did neither and switched to hours — so a 60-minute break
 * read `60:00` on the big screen and `1:00:00` at the table, and a
 * 2-hour level read `99:59` on one and `2:00:00` on the other. MM:SS under an
 * hour, H:MM:SS from an hour, never capped.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const ss = secs.toString().padStart(2, '0');
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${ss}`
    : `${minutes.toString().padStart(2, '0')}:${ss}`;
}
