import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LOCAL_BUCKET,
  bucketFor,
  canReadLegacy,
  claimStorageFor,
  clearScopedStorage,
  __resetStorageHealth,
  isStorageWritable,
  subscribeStorageHealth,
  isScopedKey,
  lastSignedInUid,
  readScoped,
  rememberSignedInUid,
  removeScoped,
  scopedKey,
  writeScoped,
} from './scopedStorage';

beforeEach(() => localStorage.clear());

describe('bucket naming', () => {
  it('names a bucket after the uid', () => {
    expect(scopedKey('tournamentSettings', 'alice')).toBe('tournamentSettings::alice');
  });

  it('gives a signed-out session its own bucket rather than the bare key', () => {
    expect(bucketFor(null)).toBe(LOCAL_BUCKET);
    expect(scopedKey('tournamentSettings', null)).toBe('tournamentSettings::local');
  });

  it('treats undefined as signed out', () => {
    expect(scopedKey('tournamentSettings', undefined)).toBe('tournamentSettings::local');
  });
});

describe('isScopedKey', () => {
  it('claims the listed keys', () => {
    expect(isScopedKey('tournamentPrizeStructure')).toBe(true);
    expect(isScopedKey('recentPlayers')).toBe(true);
  });

  it('claims the runtime-built league settings keys', () => {
    expect(isScopedKey('leagueSettings')).toBe(true);
    expect(isScopedKey('leagueSettings:abc123')).toBe(true);
  });

  it('leaves device-owned keys alone', () => {
    // playerDeviceId is a device identity and claimedPlayer_* belongs to the
    // phone, not to any account. Bucketing either would break seat check-in.
    expect(isScopedKey('playerDeviceId')).toBe(false);
    expect(isScopedKey('claimedPlayer_t1')).toBe(false);
    expect(isScopedKey('activeDirectorTournamentId')).toBe(false);
    expect(isScopedKey('smgo_unlocked')).toBe(false);
  });
});

describe('reading and writing', () => {
  it('keeps two accounts apart on one browser', () => {
    writeScoped('tournamentSettings', '{"a":1}', 'alice');
    writeScoped('tournamentSettings', '{"b":2}', 'bob');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"a":1}');
    expect(readScoped('tournamentSettings', 'bob')).toBe('{"b":2}');
  });

  it('does not leak one account into the other', () => {
    writeScoped('tournamentBlindLevels', '[1]', 'alice');
    expect(readScoped('tournamentBlindLevels', 'bob')).toBeNull();
  });

  it('removes only the named bucket', () => {
    writeScoped('recentPlayers', '["x"]', 'alice');
    writeScoped('recentPlayers', '["y"]', 'bob');
    removeScoped('recentPlayers', 'alice');
    expect(readScoped('recentPlayers', 'alice')).toBeNull();
    expect(readScoped('recentPlayers', 'bob')).toBe('["y"]');
  });
});

describe('storage written before buckets existed', () => {
  it('is readable, so nobody loses their setup on the deploy that ships this', () => {
    localStorage.setItem('tournamentSettings', '{"legacy":true}');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"legacy":true}');
  });

  it('loses to the account own bucket when both exist', () => {
    localStorage.setItem('tournamentSettings', '{"legacy":true}');
    writeScoped('tournamentSettings', '{"mine":true}', 'alice');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"mine":true}');
  });

  it('goes to the first account that adopts it, and no further', () => {
    // The whole point: a second account signing in must NOT inherit the first
    // one's setup all over again.
    localStorage.setItem('tournamentSettings', '{"legacy":true}');
    claimStorageFor('alice');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"legacy":true}');
    expect(canReadLegacy('bob')).toBe(false);
    expect(readScoped('tournamentSettings', 'bob')).toBeNull();
  });

  it('is never deleted by being adopted', () => {
    localStorage.setItem('tournamentSettings', '{"legacy":true}');
    claimStorageFor('alice');
    expect(localStorage.getItem('tournamentSettings')).toBe('{"legacy":true}');
  });
});

describe('claimStorageFor', () => {
  it('hands a signed-out game to the account that signs in', () => {
    // A standalone game started signed out must survive signing in — losing it
    // there is the exact failure the local mirror exists to prevent.
    writeScoped('tournamentLocalProgress', '{"players":["a","b"]}', null);
    writeScoped('tournamentLocalGameId', 'game_1', null);
    claimStorageFor('alice');
    expect(readScoped('tournamentLocalProgress', 'alice')).toBe('{"players":["a","b"]}');
    expect(readScoped('tournamentLocalGameId', 'alice')).toBe('game_1');
  });

  it('copies rather than moves, so the source is still there', () => {
    writeScoped('tournamentSettings', '{"local":true}', null);
    claimStorageFor('alice');
    expect(readScoped('tournamentSettings', null)).toBe('{"local":true}');
  });

  it('never overwrites a setup the account already has', () => {
    writeScoped('tournamentSettings', '{"mine":true}', 'alice');
    writeScoped('tournamentSettings', '{"local":true}', null);
    claimStorageFor('alice');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"mine":true}');
  });

  it('adopts per key, not all or nothing', () => {
    writeScoped('tournamentSettings', '{"mine":true}', 'alice');
    writeScoped('tournamentSettings', '{"local":true}', null);
    writeScoped('recentPlayers', '["from-local"]', null);
    claimStorageFor('alice');
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"mine":true}');
    expect(readScoped('recentPlayers', 'alice')).toBe('["from-local"]');
  });

  it('carries the runtime-built league settings keys across', () => {
    writeScoped('leagueSettings:league9', '{"points":1}', null);
    claimStorageFor('alice');
    expect(readScoped('leagueSettings:league9', 'alice')).toBe('{"points":1}');
  });

  it('remembers the uid, so a cold load reads the right bucket before Firebase resolves', () => {
    claimStorageFor('alice');
    expect(lastSignedInUid()).toBe('alice');
  });

  it('forgets the uid on sign-out without touching the buckets', () => {
    writeScoped('tournamentSettings', '{"mine":true}', 'alice');
    claimStorageFor('alice');
    rememberSignedInUid(null);
    expect(lastSignedInUid()).toBeNull();
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"mine":true}');
  });

  it('leaves a second account clean after the first has signed in and out', () => {
    // The reported bug, end to end.
    writeScoped('tournamentSettings', '{"alice":true}', 'alice');
    writeScoped('tournamentLocalProgress', '{"players":["alice-game"]}', 'alice');
    claimStorageFor('alice');
    rememberSignedInUid(null);
    claimStorageFor('bob');
    expect(readScoped('tournamentSettings', 'bob')).toBeNull();
    expect(readScoped('tournamentLocalProgress', 'bob')).toBeNull();
    expect(readScoped('tournamentSettings', 'alice')).toBe('{"alice":true}');
  });
});

describe('clearScopedStorage', () => {
  beforeEach(() => localStorage.clear());

  it('clears this account and the signed-out bucket', () => {
    writeScoped('tournamentSettings', '{"a":1}', 'alice');
    writeScoped('tournamentBlindLevels', '[1]', null);
    clearScopedStorage('alice');
    expect(readScoped('tournamentSettings', 'alice')).toBeNull();
    expect(readScoped('tournamentBlindLevels', null)).toBeNull();
  });

  it('leaves another account alone', () => {
    // Resetting your own device must not reach into a colleague's bucket on a
    // shared laptop.
    writeScoped('tournamentSettings', '{"bob":1}', 'bob');
    clearScopedStorage('alice');
    expect(readScoped('tournamentSettings', 'bob')).toBe('{"bob":1}');
  });

  it('clears pre-bucket storage and the claim, so nothing is re-adopted', () => {
    localStorage.setItem('tournamentSettings', '{"legacy":true}');
    claimStorageFor('alice');
    clearScopedStorage('alice');
    expect(localStorage.getItem('tournamentSettings')).toBeNull();
    expect(localStorage.getItem('legacySetupAdoptedBy')).toBeNull();
    expect(readScoped('tournamentSettings', 'bob')).toBeNull();
  });

  it('clears the runtime-built league settings keys, bucketed and not', () => {
    localStorage.setItem('leagueSettings:old', '{"legacy":true}');
    writeScoped('leagueSettings:league9', '{"points":1}', 'alice');
    clearScopedStorage('alice');
    expect(localStorage.getItem('leagueSettings:old')).toBeNull();
    expect(readScoped('leagueSettings:league9', 'alice')).toBeNull();
  });

  it('keeps the site gate, or resetting locks you out of your own app', () => {
    localStorage.setItem('smgo_unlocked', '1');
    clearScopedStorage('alice');
    expect(localStorage.getItem('smgo_unlocked')).toBe('1');
  });

  it('keeps the device id, which seat check-in maps claims to', () => {
    localStorage.setItem('playerDeviceId', 'device-1');
    localStorage.setItem('claimedPlayer_t1', 'p3');
    clearScopedStorage('alice');
    expect(localStorage.getItem('playerDeviceId')).toBe('device-1');
    expect(localStorage.getItem('claimedPlayer_t1')).toBe('p3');
  });

  it('works signed out, clearing the local bucket', () => {
    writeScoped('tournamentSettings', '{"local":1}', null);
    clearScopedStorage(null);
    expect(readScoped('tournamentSettings', null)).toBeNull();
  });
});

describe('storage health', () => {
  beforeEach(() => { localStorage.clear(); __resetStorageHealth(); });
  afterEach(() => vi.restoreAllMocks());

  it('starts writable', () => {
    expect(isStorageWritable()).toBe(true);
  });

  it('notices a write this device refuses', () => {
    // Quota exceeded, Safari private mode, storage disabled by policy. The
    // mirror is the safety net for a blocked browser, so if this is failing too
    // a live game exists nowhere but the tab's memory.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    writeScoped('tournamentLocalProgress', '{"players":[]}', 'alice');
    expect(isStorageWritable()).toBe(false);
  });

  it('recovers when a write lands again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => { throw new DOMException('QuotaExceededError'); });
    writeScoped('tournamentLocalProgress', '{"players":[]}', 'alice');
    expect(isStorageWritable()).toBe(false);

    setItem.mockRestore();
    writeScoped('tournamentLocalProgress', '{"players":[]}', 'alice');
    expect(isStorageWritable()).toBe(true);
  });

  it('tells subscribers when the state changes, not on every write', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    subscribeStorageHealth(listener);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    writeScoped('tournamentSettings', 'x', 'alice');
    expect(listener).toHaveBeenCalledTimes(1);
    writeScoped('tournamentSettings', 'y', 'alice');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not treat a failed REMOVE as data loss', () => {
    // Failing to clear something leaves stale data, which is untidy but loses
    // nothing. Only a failed write costs a director their game.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    removeScoped('tournamentSettings', 'alice');
    expect(isStorageWritable()).toBe(true);
  });
});
