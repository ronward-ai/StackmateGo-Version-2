import { describe, it, expect } from 'vitest';
import { stableStringify } from './stableJson';

describe('stableStringify', () => {
  it('the same object in another key order is the same string — a Firestore map has no order', () => {
    const a = { id: 'p1', name: 'Amy', knockouts: 2, tableAssignment: { tableIndex: 0, seatIndex: 3 } };
    const b = { tableAssignment: { seatIndex: 3, tableIndex: 0 }, knockouts: 2, name: 'Amy', id: 'p1' };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)); // the fault it replaces
  });

  it('undefined, null and a missing key are the same — a write turns one into another', () => {
    expect(stableStringify({ position: undefined })).toBe(stableStringify({ position: null }));
    expect(stableStringify({ a: 1, position: null })).toBe(stableStringify({ a: 1 }));
    expect(stableStringify([undefined])).toBe(stableStringify([null]));
  });

  it('still tells real changes apart', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });
});
