import { describe, it, expect } from 'vitest';
import { secondsLeftFrom } from './tournamentClock';

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
