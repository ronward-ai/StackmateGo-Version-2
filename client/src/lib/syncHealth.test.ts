import { describe, it, expect, vi } from 'vitest';
import {
  HEALTHY,
  judgePreflight,
  isBlocked,
  markReported,
  recordFailure,
  recordSuccess,
  shouldReport,
  syncFailureMessage,
  PERSISTENT_MS,
} from './syncHealth';

const t0 = 1_000_000;

describe('shouldReport', () => {
  it('says nothing while healthy', () => {
    expect(shouldReport(HEALTHY, t0)).toBe(false);
  });

  it('reports a server answer on the first failure', () => {
    const h = recordFailure(HEALTHY, 'permission-denied', t0);
    expect(shouldReport(h, t0)).toBe(true);
  });

  it('stays quiet for a single unavailable — that is a blip', () => {
    const h = recordFailure(HEALTHY, 'unavailable', t0);
    expect(shouldReport(h, t0)).toBe(false);
  });

  it('reports unavailable once it has happened three times', () => {
    let h = recordFailure(HEALTHY, 'unavailable', t0);
    h = recordFailure(h, 'unavailable', t0 + 100);
    expect(shouldReport(h, t0 + 100)).toBe(false);
    h = recordFailure(h, 'unavailable', t0 + 200);
    expect(shouldReport(h, t0 + 200)).toBe(true);
  });

  it('reports unavailable that has simply gone on too long', () => {
    const h = recordFailure(HEALTHY, 'unavailable', t0);
    expect(shouldReport(h, t0 + PERSISTENT_MS)).toBe(true);
  });

  it('reports a streak once, not on every retry', () => {
    let h = recordFailure(HEALTHY, 'resource-exhausted', t0);
    expect(shouldReport(h, t0)).toBe(true);
    h = markReported(h);
    h = recordFailure(h, 'resource-exhausted', t0 + 100);
    expect(shouldReport(h, t0 + 100)).toBe(false);
  });

  it('treats a different code as a new problem worth reporting', () => {
    let h = markReported(recordFailure(HEALTHY, 'unavailable', t0));
    h = recordFailure(h, 'permission-denied', t0 + 100);
    expect(shouldReport(h, t0 + 100)).toBe(true);
  });

  it('forgets the streak once a write succeeds', () => {
    let h = recordFailure(HEALTHY, 'unavailable', t0);
    h = recordFailure(h, 'unavailable', t0 + 100);
    h = recordSuccess();
    expect(h).toEqual(HEALTHY);
    expect(shouldReport(recordFailure(h, 'unavailable', t0 + 200), t0 + 200)).toBe(false);
  });
});

describe('isBlocked', () => {
  it('is false while healthy, and false for one unavailable', () => {
    expect(isBlocked(HEALTHY, t0)).toBe(false);
    expect(isBlocked(recordFailure(HEALTHY, 'unavailable', t0), t0)).toBe(false);
  });

  it('is true once unavailable persists', () => {
    let h = recordFailure(HEALTHY, 'unavailable', t0);
    h = recordFailure(h, 'unavailable', t0 + 100);
    h = recordFailure(h, 'unavailable', t0 + 200);
    expect(isBlocked(h, t0 + 200)).toBe(true);
  });

  it('stays true after the streak has been reported', () => {
    let h = recordFailure(HEALTHY, 'permission-denied', t0);
    h = markReported(h);
    expect(isBlocked(h, t0)).toBe(true);
  });
});

describe('syncFailureMessage', () => {
  it('names the blocker for unavailable', () => {
    const h = recordFailure(HEALTHY, 'unavailable', t0);
    expect(syncFailureMessage(h, 'Players')).toContain('blocker');
  });

  it('names the code and the sync for anything else', () => {
    const h = recordFailure(HEALTHY, 'permission-denied', t0);
    expect(syncFailureMessage(h, 'Players')).toBe(
      'Players could not be saved (permission-denied). Live updates may be delayed.'
    );
  });
});

describe('judgePreflight (Oct Low)', () => {
  const flush = () => new Promise(r => setTimeout(r, 0));

  it('takes the verdict back when a slow write lands after the deadline', async () => {
    vi.useFakeTimers();
    let land!: () => void;
    const results: boolean[] = [];
    judgePreflight(new Promise<void>(r => { land = r; }), 8000, ok => results.push(ok));
    vi.advanceTimersByTime(8000);
    expect(results).toEqual([false]);
    land();
    vi.useRealTimers();
    await flush();
    expect(results).toEqual([false, true]);
  });

  it('stays blocked while the write never settles', () => {
    vi.useFakeTimers();
    const results: boolean[] = [];
    judgePreflight(new Promise(() => {}), 8000, ok => results.push(ok));
    vi.advanceTimersByTime(60_000);
    expect(results).toEqual([false]);
    vi.useRealTimers();
  });

  it('reports a rejected write once, as blocked', async () => {
    const results: boolean[] = [];
    judgePreflight(Promise.reject(new Error('denied')), 8000, ok => results.push(ok));
    await flush();
    expect(results).toEqual([false]);
  });
});
