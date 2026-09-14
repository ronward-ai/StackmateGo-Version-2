import { describe, it, expect } from 'vitest';
import { statusForSubscription, isNewerEvent } from './subscriptionStatus';

describe('statusForSubscription', () => {
  it('active and trialing are pro', () => {
    expect(statusForSubscription('active')).toBe('pro');
    expect(statusForSubscription('trialing')).toBe('pro');
  });

  it('a failed payment loses pro immediately', () => {
    expect(statusForSubscription('past_due')).toBe('free');
    expect(statusForSubscription('unpaid')).toBe('free');
  });

  it('a subscription that never started, or was explicitly paused, is not pro', () => {
    expect(statusForSubscription('incomplete')).toBe('free');
    expect(statusForSubscription('incomplete_expired')).toBe('free');
    expect(statusForSubscription('paused')).toBe('free');
  });

  it('a fully cancelled subscription is not pro', () => {
    expect(statusForSubscription('canceled')).toBe('free');
  });

  // The whole point of this function: cancel-at-period-end needs no special
  // case, because Stripe leaves status at 'active' for the rest of the paid
  // period regardless of whether cancel_at_period_end is set. This function
  // only ever sees `status`, never that flag, on purpose.
  it('does not need to know about cancel_at_period_end — active is active', () => {
    expect(statusForSubscription('active')).toBe('pro');
  });

  it('an unrecognised future Stripe status is treated as not-pro, not as a crash', () => {
    expect(statusForSubscription('some_new_status_stripe_adds_later')).toBe('free');
  });
});

describe('isNewerEvent', () => {
  it('accepts anything when nothing is stored yet', () => {
    expect(isNewerEvent(100, null)).toBe(true);
    expect(isNewerEvent(100, undefined)).toBe(true);
  });

  it('accepts a strictly newer event', () => {
    expect(isNewerEvent(200, 100)).toBe(true);
  });

  it('rejects an older event — the out-of-order retry case', () => {
    expect(isNewerEvent(100, 200)).toBe(false);
  });

  // Not just >=: the SAME event redelivered must not re-run its write, even
  // though the write itself would be harmless.
  it('rejects an equal timestamp — a redelivered duplicate, not a new event', () => {
    expect(isNewerEvent(150, 150)).toBe(false);
  });
});
