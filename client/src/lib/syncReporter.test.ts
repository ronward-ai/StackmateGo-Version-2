import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({ toast: vi.fn(), reportToOverlay: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: h.toast }));
vi.mock('./debugOverlay', () => ({ reportToOverlay: h.reportToOverlay }));

import {
  __resetSyncReporter, getSyncBlocked, reportWriteFailure, reportWriteSuccess, subscribeSyncHealth,
} from './syncReporter';
import { PERSISTENT_FAILURES, PERSISTENT_MS } from './syncHealth';

const denied = { code: 'permission-denied' };
const offline = { code: 'unavailable' };

beforeEach(() => {
  __resetSyncReporter();
  h.toast.mockReset();
  h.reportToOverlay.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('reporting a real answer from the server', () => {
  it('says so straight away', () => {
    // Anything that is not `unavailable` is actionable immediately.
    reportWriteFailure('Players', denied);
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0].description).toContain('Players');
  });

  it('says it ONCE, however many retries follow', () => {
    // The bug this whole mechanism exists for: one underlying problem became a
    // popup that would not go away and said nothing anyone could act on.
    for (let i = 0; i < 5; i++) reportWriteFailure('Players', denied);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('speaks again for a genuinely different problem', () => {
    reportWriteFailure('Players', denied);
    reportWriteFailure('Players', { code: 'resource-exhausted' });
    expect(h.toast).toHaveBeenCalledTimes(2);
  });

  it('blocks the moment it hears a real answer', () => {
    expect(getSyncBlocked()).toBe(false);
    reportWriteFailure('Players', denied);
    expect(getSyncBlocked()).toBe(true);
  });
});

describe('an offline blip versus a blocked browser', () => {
  it('stays quiet while it might just be a tunnel', () => {
    reportWriteFailure('Players', offline);
    expect(h.toast).not.toHaveBeenCalled();
    expect(getSyncBlocked()).toBe(false);
  });

  it('speaks once it has proved it persists', () => {
    for (let i = 0; i < PERSISTENT_FAILURES; i++) reportWriteFailure('Players', offline);
    expect(h.toast).toHaveBeenCalledTimes(1);
    // An ad blocker is overwhelmingly the reason one domain fails while the
    // rest of the internet works, so the message says so.
    expect(h.toast.mock.calls[0][0].description).toContain('blocker');
    expect(getSyncBlocked()).toBe(true);
  });

  it('speaks on time alone, without needing the failure count', () => {
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start);
    reportWriteFailure('Players', offline);
    expect(h.toast).not.toHaveBeenCalled();

    vi.spyOn(Date, 'now').mockReturnValue(start + PERSISTENT_MS);
    reportWriteFailure('Players', offline);
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
});

describe('recovery', () => {
  it('clears the block when a write lands', () => {
    reportWriteFailure('Players', denied);
    expect(getSyncBlocked()).toBe(true);
    reportWriteSuccess();
    expect(getSyncBlocked()).toBe(false);
  });

  it('will speak again about a new outage after recovering', () => {
    reportWriteFailure('Players', denied);
    reportWriteSuccess();
    reportWriteFailure('Players', denied);
    expect(h.toast).toHaveBeenCalledTimes(2);
  });
});

describe('subscribers', () => {
  it('are told when the block state changes, not on every failure', () => {
    const listener = vi.fn();
    subscribeSyncHealth(listener);

    reportWriteFailure('Players', denied);
    expect(listener).toHaveBeenCalledTimes(1);

    // Still blocked — nothing has changed, so nothing is announced.
    reportWriteFailure('Players', denied);
    expect(listener).toHaveBeenCalledTimes(1);

    reportWriteSuccess();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('can be unsubscribed', () => {
    const listener = vi.fn();
    subscribeSyncHealth(listener)();
    reportWriteFailure('Players', denied);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('an error with no code', () => {
  it('is still reported rather than swallowed', () => {
    reportWriteFailure('Players', new Error('boom'));
    expect(h.toast).toHaveBeenCalledTimes(1);
    expect(h.toast.mock.calls[0][0].description).toContain('unknown');
  });
});
