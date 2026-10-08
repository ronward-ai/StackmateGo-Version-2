import { describe, it, expect } from 'vitest';
import { controlOf, mayDrive, shouldClaim, shouldClaimNow, shouldAdoptRemote, controlLockReason, describeClaimTime, takesDocumentRoster } from './directorControl';

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
  it('warns that nothing is being saved, with or without a time', () => {
    // BOTH branches. The timed one used to be asserted only on the time, so a
    // reword could drop the warning from it and every test still passed.
    expect(controlLockReason('other')).toMatch(/not being saved|being saved/i);
    expect(controlLockReason('other', '2026-09-27T19:42:00.000Z')).toMatch(/not being saved|being saved/i);
  });

  // It must not assert a fact it does not have. "This game is being run on
  // another device" was reported from a live night as plainly wrong — the holder
  // was an iPad at home and nobody was running anything. All the app knows is
  // that a device claimed control.
  it('says a device has control, never that anyone is running the game', () => {
    for (const reason of [controlLockReason('other'), controlLockReason('other', '2026-09-27T19:42:00.000Z')]) {
      expect(reason).not.toMatch(/being run on another device/i);
      expect(reason).toMatch(/has control/i);
      expect(reason).toMatch(/take control/i);
    }
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

describe('shouldAdoptRemote', () => {
  // The clean slate that Take control has no page reload to lean on.
  it('adopts when this device was read-only and now holds control', () => {
    expect(shouldAdoptRemote('other', 'mine')).toBe(true);
  });

  // The automatic claim. A device that just created a game legitimately has a
  // roster AHEAD of the document; adopting would wipe the players just added.
  it('does NOT adopt on the automatic claim of an unheld game', () => {
    expect(shouldAdoptRemote('unclaimed', 'mine')).toBe(false);
  });

  // Every ordinary snapshot, including the echo of this device's own writes.
  // Adopting here would undo each bust-out the instant it came back.
  it('does NOT adopt on an ordinary snapshot while already driving', () => {
    expect(shouldAdoptRemote('mine', 'mine')).toBe(false);
  });

  it('does NOT adopt on a first snapshot', () => {
    expect(shouldAdoptRemote(null, 'mine')).toBe(false);
    expect(shouldAdoptRemote(undefined, 'mine')).toBe(false);
  });

  // Losing control, or never having had it, changes nothing about the roster.
  it('does NOT adopt when this device is not the one driving', () => {
    expect(shouldAdoptRemote('mine', 'other')).toBe(false);
    expect(shouldAdoptRemote('other', 'other')).toBe(false);
    expect(shouldAdoptRemote('other', 'unclaimed')).toBe(false);
    expect(shouldAdoptRemote('mine', 'unclaimed')).toBe(false);
  });
});

// October audit, M14: a console that is only watching must show the game as
// the document has it, or the driving device's rebuys and undos never arrive.
describe('takesDocumentRoster', () => {
  it('takes the document whenever this device is only watching', () => {
    expect(takesDocumentRoster('other', 'other')).toBe(true);
    expect(takesDocumentRoster(null, 'other')).toBe(true);
    expect(takesDocumentRoster('mine', 'other')).toBe(true);
  });
  it('takes it on a takeover, as before', () => {
    expect(takesDocumentRoster('other', 'mine')).toBe(true);
  });
  // The two exclusions that make the merge work for the DRIVING device.
  it('merges, never replaces, for a device that is driving', () => {
    expect(takesDocumentRoster('mine', 'mine')).toBe(false);
    expect(takesDocumentRoster('unclaimed', 'mine')).toBe(false);
    expect(takesDocumentRoster(null, 'unclaimed')).toBe(false);
  });
});

describe('shouldClaimNow — a console claims on arriving at unclaimed, every time', () => {
  it('claims when it first finds the game unclaimed', () => {
    expect(shouldClaimNow(null, 'unclaimed')).toBe(true);
  });
  it('claims AGAIN when its own claim has been cleared — the reported both-devices-driving case', () => {
    expect(shouldClaimNow('mine', 'unclaimed')).toBe(true);
    expect(shouldClaimNow('other', 'unclaimed')).toBe(true);
  });
  it('never writes on an unchanged unclaimed snapshot, and never takes a held game', () => {
    expect(shouldClaimNow('unclaimed', 'unclaimed')).toBe(false);
    expect(shouldClaimNow(null, 'other')).toBe(false);
    expect(shouldClaimNow('mine', 'mine')).toBe(false);
  });
});
