import { describe, it, expect } from 'vitest';
import { sanitizeForFirestore } from './utils';

/** Every write passes through this, and it had no test (October audit, coverage). */
describe('sanitizeForFirestore', () => {
  it('turns undefined into null — it does NOT strip it', () => {
    // Writing null OVERWRITES what Firestore held, where an absent key would
    // leave it alone; CLAUDE.md records the difference mattering.
    expect(sanitizeForFirestore({ a: undefined, b: 1 })).toEqual({ a: null, b: 1 });
    expect(sanitizeForFirestore(undefined)).toBeNull();
  });

  it('recurses through arrays and nested objects', () => {
    expect(sanitizeForFirestore({ players: [{ id: 'a', seat: undefined }], m: { n: { o: undefined } } }))
      .toEqual({ players: [{ id: 'a', seat: null }], m: { n: { o: null } } });
  });

  it("preserves Firestore's sentinel objects and Dates untouched", () => {
    const sentinel = { _methodName: 'deleteField' };
    const when = new Date('2026-10-07T00:00:00Z');
    const out = sanitizeForFirestore({ claims: sentinel, at: when });
    expect(out.claims).toBe(sentinel);
    expect(out.at).toBe(when);
  });

  it('leaves primitives alone', () => {
    expect(sanitizeForFirestore(0)).toBe(0);
    expect(sanitizeForFirestore('')).toBe('');
    expect(sanitizeForFirestore(false)).toBe(false);
  });
});
