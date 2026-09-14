import { describe, it, expect } from 'vitest';
import { claimedByFor, isClaimed, myPlayerId, claimFieldPath } from './seatClaims';

describe('claimedByFor', () => {
  it('reads the new claims map', () => {
    const t = { claims: { p1: 'device-a' }, players: [] };
    expect(claimedByFor(t, 'p1')).toBe('device-a');
  });

  it('falls back to the legacy player field when claims is absent', () => {
    const t = { players: [{ id: 'p1', claimedBy: 'device-a' }] };
    expect(claimedByFor(t, 'p1')).toBe('device-a');
  });

  it('falls back to the legacy field when claims exists but lacks this player', () => {
    const t = { claims: { p2: 'device-b' }, players: [{ id: 'p1', claimedBy: 'device-a' }] };
    expect(claimedByFor(t, 'p1')).toBe('device-a');
  });

  it('prefers claims over a stale legacy value for the same player', () => {
    // The migration path: a seat claimed under the old scheme is then
    // re-claimed (or released and re-claimed) under the new one. The new
    // scheme must win, or the two could disagree about who holds the seat.
    const t = { claims: { p1: 'device-new' }, players: [{ id: 'p1', claimedBy: 'device-old' }] };
    expect(claimedByFor(t, 'p1')).toBe('device-new');
  });

  it('returns undefined when nobody has claimed the seat', () => {
    expect(claimedByFor({ claims: {}, players: [{ id: 'p1' }] }, 'p1')).toBeUndefined();
    expect(claimedByFor({ players: [{ id: 'p1' }] }, 'p1')).toBeUndefined();
  });

  it('survives a null or undefined tournament', () => {
    expect(claimedByFor(null, 'p1')).toBeUndefined();
    expect(claimedByFor(undefined, 'p1')).toBeUndefined();
  });
});

describe('isClaimed', () => {
  it('is true under either scheme', () => {
    expect(isClaimed({ claims: { p1: 'device-a' } }, 'p1')).toBe(true);
    expect(isClaimed({ players: [{ id: 'p1', claimedBy: 'device-a' }] }, 'p1')).toBe(true);
  });

  it('is false when nobody has claimed it', () => {
    expect(isClaimed({ claims: {}, players: [{ id: 'p1' }] }, 'p1')).toBe(false);
  });
});

describe('myPlayerId', () => {
  it('finds the player this device claimed, via the claims map', () => {
    const t = { claims: { p1: 'device-a', p2: 'device-b' } };
    expect(myPlayerId(t, 'device-b')).toBe('p2');
  });

  // The bug this replaces: comparing a device id against a Firebase auth uid,
  // two identity spaces that could never match, so the old fallback always
  // returned nothing.
  it('falls back to the legacy player field, by device id — not by auth uid', () => {
    const t = { players: [{ id: 'p1', claimedBy: 'device-a' }] };
    expect(myPlayerId(t, 'device-a')).toBe('p1');
    expect(myPlayerId(t, 'some-firebase-uid')).toBeUndefined();
  });

  it('returns undefined with no device id', () => {
    expect(myPlayerId({ claims: { p1: 'device-a' } }, null)).toBeUndefined();
    expect(myPlayerId({ claims: { p1: 'device-a' } }, undefined)).toBeUndefined();
    expect(myPlayerId({ claims: { p1: 'device-a' } }, '')).toBeUndefined();
  });

  it('returns undefined when this device holds no seat', () => {
    expect(myPlayerId({ claims: { p1: 'device-a' } }, 'device-z')).toBeUndefined();
  });

  it('survives a null or undefined tournament', () => {
    expect(myPlayerId(null, 'device-a')).toBeUndefined();
    expect(myPlayerId(undefined, 'device-a')).toBeUndefined();
  });
});

describe('claimFieldPath', () => {
  it('builds the dotted path', () => {
    expect(claimFieldPath('p1')).toBe('claims.p1');
  });

  // Player ids are uuidv4 — hyphens throughout. The SDK's dotted-path update
  // splits only on literal '.', so a hyphen inside a segment needs no escaping
  // here; this pins that the path is built exactly as one string, not parsed.
  it('carries a UUID player id through untouched', () => {
    const id = 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c';
    expect(claimFieldPath(id)).toBe(`claims.${id}`);
  });
});
