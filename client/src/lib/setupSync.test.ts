import { describe, it, expect } from 'vitest';
import {
  canApplyRemoteSetup,
  isRemoteSetupNewer,
  setupFingerprint,
  setupTime,
  type DirectorSetup,
} from './setupSync';

const at = (iso: string, over: Partial<DirectorSetup> = {}): DirectorSetup => ({
  settings: { a: 1 },
  blindLevels: [{ duration: 900 }],
  prizeStructure: { buyIn: 10 },
  updatedAt: iso,
  ...over,
});

describe('setupTime', () => {
  it('parses an ISO timestamp', () => {
    expect(setupTime('2026-09-15T12:00:00.000Z')).toBe(Date.parse('2026-09-15T12:00:00.000Z'));
  });

  it('treats a missing or unusable timestamp as no timestamp', () => {
    expect(setupTime(undefined)).toBeNull();
    expect(setupTime(null)).toBeNull();
    expect(setupTime('')).toBeNull();
    expect(setupTime('not a date')).toBeNull();
  });
});

describe('isRemoteSetupNewer', () => {
  it('takes the account copy when the device has nothing — a borrowed tablet', () => {
    expect(isRemoteSetupNewer(null, at('2026-09-15T12:00:00Z'))).toBe(true);
  });

  it('takes the account copy when it is strictly newer', () => {
    expect(isRemoteSetupNewer(at('2026-09-15T10:00:00Z'), at('2026-09-15T12:00:00Z'))).toBe(true);
  });

  it('keeps the device copy when it is newer', () => {
    expect(isRemoteSetupNewer(at('2026-09-15T12:00:00Z'), at('2026-09-15T10:00:00Z'))).toBe(false);
  });

  it('does nothing when the two are the same save', () => {
    // Equal is not newer. Pulling here would be pure churn.
    expect(isRemoteSetupNewer(at('2026-09-15T12:00:00Z'), at('2026-09-15T12:00:00Z'))).toBe(false);
  });

  it('never pulls an empty account copy over a real one', () => {
    expect(isRemoteSetupNewer(at('2026-09-15T10:00:00Z'), null)).toBe(false);
    expect(isRemoteSetupNewer(at('2026-09-15T10:00:00Z'), { updatedAt: '2026-09-16T10:00:00Z' })).toBe(false);
  });

  it('lets a dated device copy beat an undated account copy', () => {
    const undated = at('x', { updatedAt: undefined });
    expect(isRemoteSetupNewer(at('2026-09-15T10:00:00Z'), undated)).toBe(false);
  });

  it('lets a dated account copy beat an undated device copy', () => {
    const undated = at('x', { updatedAt: undefined });
    expect(isRemoteSetupNewer(undated, at('2026-09-15T10:00:00Z'))).toBe(true);
  });
});

describe('canApplyRemoteSetup', () => {
  it('allows it at an empty table', () => {
    expect(canApplyRemoteSetup({ playerCount: 0, isDatabaseTournament: false })).toBe(true);
  });

  it('refuses once players are seated', () => {
    // The setup carries the blind structure and the payouts. Applying it to a
    // game under way would rewrite the terms of that game.
    expect(canApplyRemoteSetup({ playerCount: 1, isDatabaseTournament: false })).toBe(false);
  });

  it('refuses for a live game, whose settings come from its own document', () => {
    expect(canApplyRemoteSetup({ playerCount: 0, isDatabaseTournament: true })).toBe(false);
  });
});

describe('setupFingerprint', () => {
  it('matches two identical setups saved at different times', () => {
    // updatedAt changes on every save by definition, so including it would
    // defeat the guard it exists to serve.
    expect(setupFingerprint(at('2026-09-15T10:00:00Z')))
      .toBe(setupFingerprint(at('2026-09-15T23:59:00Z')));
  });

  it('separates setups that genuinely differ', () => {
    expect(setupFingerprint(at('2026-09-15T10:00:00Z')))
      .not.toBe(setupFingerprint(at('2026-09-15T10:00:00Z', { prizeStructure: { buyIn: 20 } })));
  });

  it('is stable for an absent section rather than throwing', () => {
    expect(setupFingerprint({})).toBe(setupFingerprint({}));
  });
});
