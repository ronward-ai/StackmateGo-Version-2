import { describe, it, expect } from 'vitest';
import { fromRestFields, fromRestValue } from './firestoreRest';

describe('fromRestFields (Oct correctness debt)', () => {
  it('decodes every kind a tournament document holds', () => {
    expect(fromRestFields({
      n: { nullValue: null },
      b: { booleanValue: true },
      i: { integerValue: '42' },
      d: { doubleValue: 1.5 },
      s: { stringValue: 'Amy' },
      t: { timestampValue: '2026-10-07T20:00:00Z' },
      a: { arrayValue: { values: [{ integerValue: '1' }, { stringValue: 'x' }] } },
      m: { mapValue: { fields: { inner: { booleanValue: false } } } },
    })).toEqual({
      n: null, b: true, i: 42, d: 1.5, s: 'Amy', t: '2026-10-07T20:00:00Z',
      a: [1, 'x'], m: { inner: false },
    });
  });

  // The drift that was live: the wake-up resync dropped timestamps.
  it('keeps a timestamp nested inside the roster', () => {
    const doc = fromRestFields({
      players: { arrayValue: { values: [{ mapValue: { fields: { eliminatedAt: { timestampValue: '2026-10-07T21:00:00Z' } } } }] } },
    });
    expect(doc.players[0].eliminatedAt).toBe('2026-10-07T21:00:00Z');
  });

  it('tolerates an empty array, an empty map and an unknown kind', () => {
    expect(fromRestValue({ arrayValue: {} })).toEqual([]);
    expect(fromRestValue({ mapValue: {} })).toEqual({});
    expect(fromRestValue({ somethingNew: 1 })).toBeNull();
  });
});
