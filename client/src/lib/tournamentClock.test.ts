import { describe, it, expect } from 'vitest';
import { secondsLeftFrom, advanceClock, formatClock } from './tournamentClock';

const now = 1_700_000_000_000;

describe('secondsLeftFrom', () => {
  it('IGNORES a stale countdown while the clock is running', () => {
    // The regression, exactly: the document was written when the level began and
    // says 900, but the level ends 90 seconds from now.
    expect(
      secondsLeftFrom({ isRunning: true, targetEndTime: now + 90_000, secondsLeft: 900 }, now)
    ).toBe(90);
  });

  it('uses the stored countdown when paused — the document is fresh then', () => {
    expect(secondsLeftFrom({ isRunning: false, targetEndTime: null, secondsLeft: 423 }, now)).toBe(423);
  });

  it('falls back to the countdown if a running clock has no end time', () => {
    expect(secondsLeftFrom({ isRunning: true, secondsLeft: 500 }, now)).toBe(500);
    expect(secondsLeftFrom({ isRunning: true, targetEndTime: null, secondsLeft: 500 }, now)).toBe(500);
  });

  it('never goes negative when the end time has passed', () => {
    expect(secondsLeftFrom({ isRunning: true, targetEndTime: now - 30_000, secondsLeft: 900 }, now)).toBe(0);
  });

  it('is zero when the document says nothing useful', () => {
    expect(secondsLeftFrom({}, now)).toBe(0);
    expect(secondsLeftFrom({ isRunning: true, secondsLeft: -5 }, now)).toBe(0);
  });

  it('rounds up, so a level shows 1 rather than 0 for its last part-second', () => {
    expect(secondsLeftFrom({ isRunning: true, targetEndTime: now + 200 }, now)).toBe(1);
  });
});

// October audit, M11.

describe('advanceClock — catch up from the end time', () => {
  const MIN = 60_000;
  const levels = [
    { duration: 900 }, { duration: 900 }, { duration: 600, isBreak: true }, { duration: 900 },
  ];

  it('chains the next level from the previous end, not from now', () => {
    // Level 1 ended 1.4s ago (a slow tick): level 2 ends exactly 15 min after it.
    const end = 1_000_000;
    const out = advanceClock(levels, 0, end, end + 1400, true);
    expect(out.currentLevel).toBe(1);
    expect(out.targetEndTime).toBe(end + 15 * MIN);
  });

  // THE regression: back after 6 minutes away, the schedule must not slip.
  it('resumes the next level part-way through after time away', () => {
    const end = 1_000_000;
    const out = advanceClock(levels, 0, end, end + 6 * MIN, true);
    expect(out.currentLevel).toBe(1);
    expect(out.secondsLeft).toBe(9 * 60);
  });

  it('passes through every level that elapsed entirely', () => {
    const end = 1_000_000;
    const withoutHold = advanceClock(levels, 0, end, end + 20 * MIN, false);
    expect(withoutHold.currentLevel).toBe(2);           // level 2 gone, into the break
    expect(withoutHold.secondsLeft).toBe(5 * 60);
  });

  it('stops at a break-hold, as the tick always has', () => {
    const out = advanceClock(levels, 2, 1_000_000, 1_000_000 + 1000, true);
    expect(out).toMatchObject({ currentLevel: 3, isRunning: false, targetEndTime: null, secondsLeft: 900 });
  });

  it('finishes when the structure runs out', () => {
    expect(advanceClock(levels, 3, 1_000_000, 1_000_500, true)).toMatchObject({ finished: true, isRunning: false, secondsLeft: 0 });
  });
});

describe('formatClock (Oct Low)', () => {
  it.each([
    [0, '00:00'], [59, '00:59'], [300, '05:00'], [3599, '59:59'],
    [3600, '1:00:00'], [7200, '2:00:00'], [3661, '1:01:01'], [-5, '00:00'],
  ])('%i seconds reads %s on every screen', (secs, text) => {
    expect(formatClock(secs as number)).toBe(text);
  });
});
