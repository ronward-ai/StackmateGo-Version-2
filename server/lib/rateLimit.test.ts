import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, resetRateLimits } from './rateLimit';

beforeEach(() => resetRateLimits());

describe('checkRateLimit', () => {
  it('allows attempts up to the limit', () => {
    const opts = { max: 3, windowMs: 60_000 };
    expect(checkRateLimit('user-1', opts, 0)).toBe(true);
    expect(checkRateLimit('user-1', opts, 1)).toBe(true);
    expect(checkRateLimit('user-1', opts, 2)).toBe(true);
  });

  it('rejects the attempt beyond the limit', () => {
    const opts = { max: 3, windowMs: 60_000 };
    checkRateLimit('user-1', opts, 0);
    checkRateLimit('user-1', opts, 1);
    checkRateLimit('user-1', opts, 2);
    expect(checkRateLimit('user-1', opts, 3)).toBe(false);
  });

  it('does not let a rejected attempt count towards a later window either', () => {
    const opts = { max: 1, windowMs: 100 };
    expect(checkRateLimit('user-1', opts, 0)).toBe(true);
    expect(checkRateLimit('user-1', opts, 10)).toBe(false); // rejected
    expect(checkRateLimit('user-1', opts, 20)).toBe(false); // still rejected — did not reset the window
    expect(checkRateLimit('user-1', opts, 101)).toBe(true); // the ORIGINAL hit has aged out
  });

  it('tracks each key independently', () => {
    const opts = { max: 1, windowMs: 60_000 };
    expect(checkRateLimit('user-1', opts, 0)).toBe(true);
    expect(checkRateLimit('user-2', opts, 0)).toBe(true); // a different uid is not affected
    expect(checkRateLimit('user-1', opts, 1)).toBe(false);
  });

  it('a hit ages out of the window and frees up a slot', () => {
    const opts = { max: 2, windowMs: 1000 };
    checkRateLimit('user-1', opts, 0);
    checkRateLimit('user-1', opts, 500);
    expect(checkRateLimit('user-1', opts, 999)).toBe(false); // both still in window
    expect(checkRateLimit('user-1', opts, 1001)).toBe(true); // the first (t=0) has aged out
  });
});
