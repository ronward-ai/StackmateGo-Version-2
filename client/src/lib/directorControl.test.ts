import { describe, it, expect } from 'vitest';
import { controlOf, mayDrive, shouldClaim, controlLockReason, describeClaimTime } from './directorControl';

describe('controlOf', () => {
  it('is mine when the holder is this device', () => {
    expect(controlOf('d_1', 'd_1')).toBe('mine');
  });

  it('is other when a different device holds it', () => {
    expect(controlOf('d_1', 'd_2')).toBe('other');
  });

  // Every game written before this shipped has no field. Treating that as
  // "somebody else has it" would make the lock's first act be freezing every
  // game in flight.
  it.each([undefined, null, '', '   '])('is unclaimed when the field is %p', (held) => {
    expect(controlOf(held as any, 'd_1')).toBe('unclaimed');
  });

  // A device with no identity of its own cannot claim to be the holder. This is
  // the localStorage-throwing case that lib/deviceId.ts mints a session
  // fallback for, so it should not arise — but guessing "mine" here would hand
  // control to whichever device could not identify itself.
  it('is other when this device has no id and someone holds it', () => {
    expect(controlOf('d_1', null)).toBe('other');
    expect(controlOf('d_1', undefined)).toBe('other');
  });
});

describe('mayDrive', () => {
  it('permits mine and unclaimed, refuses other', () => {
    expect(mayDrive('mine')).toBe(true);
    expect(mayDrive('unclaimed')).toBe(true);
    expect(mayDrive('other')).toBe(false);
  });
});

describe('shouldClaim', () => {
  // Never automatic from another device. A console that grabbed control on load
  // would recreate the removed activeDeviceId lock's worst property: whichever
  // device loaded last won, and the other went read-only mid-game.
  it('claims only what nobody holds', () => {
    expect(shouldClaim('unclaimed')).toBe(true);
    expect(shouldClaim('mine')).toBe(false);
    expect(shouldClaim('other')).toBe(false);
  });
});

describe('controlLockReason', () => {
  it('says nothing when this device may write', () => {
    expect(controlLockReason('mine')).toBeNull();
    expect(controlLockReason('unclaimed')).toBeNull();
  });

  // "Nothing you do here is being saved" is the load-bearing half. A read-only
  // console that merely looks normal is how the half-enforced lock cost a
  // director their rebuys without anybody noticing.
  it('warns that nothing is being saved', () => {
    expect(controlLockReason('other')).toMatch(/not being saved|being saved/i);
  });

  it('names the time when it has one, and omits it when it does not', () => {
    const withTime = controlLockReason('other', '2026-09-27T19:42:00.000Z');
    expect(withTime).toMatch(/since /);
    expect(controlLockReason('other', null)).not.toMatch(/since /);
    expect(controlLockReason('other', 'not a date')).not.toMatch(/since /);
  });
});

describe('describeClaimTime', () => {
  it('is empty rather than Invalid Date for anything unusable', () => {
    expect(describeClaimTime(null)).toBe('');
    expect(describeClaimTime(undefined)).toBe('');
    expect(describeClaimTime('')).toBe('');
    expect(describeClaimTime('banana')).toBe('');
  });

  it('formats a real timestamp', () => {
    expect(describeClaimTime('2026-09-27T19:42:00.000Z')).toMatch(/\d/);
  });
});
