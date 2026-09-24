import { describe, it, expect } from 'vitest';
import {
  BALANCE_THRESHOLD, imbalance, imbalanceDismissed, imbalanceKey, type SeatedPlayer,
} from './tableBalance';

const at = (tableIndex: number, seatIndex = 0): SeatedPlayer =>
  ({ isActive: true, seated: true, tableAssignment: { tableIndex, seatIndex } });

const spread = (perTable: number[]): SeatedPlayer[] =>
  perTable.flatMap((n, table) => Array.from({ length: n }, (_, seat) => at(table, seat)));

describe('imbalance', () => {
  it('finds the gap between the fullest and emptiest table', () => {
    expect(imbalance(spread([6, 3]))).toEqual({
      overloadedTable: 0, underloadedTable: 1, gap: 3,
    });
  });

  it('says nothing about a one-player difference', () => {
    // An odd field across two tables cannot be levelled, so prompting for it
    // would fire on a table nobody can fix.
    expect(BALANCE_THRESHOLD).toBe(2);
    expect(imbalance(spread([5, 4]))).toBeNull();
  });

  it('speaks up at exactly the threshold', () => {
    expect(imbalance(spread([5, 3]))?.gap).toBe(2);
  });

  it('says nothing about a single table', () => {
    expect(imbalance(spread([8]))).toBeNull();
  });

  it('ignores busted and unseated players', () => {
    // The reported case: a bust-out is what CAUSES the imbalance, so someone
    // who has left the table must not still be counted at it.
    //
    // The busted player here KEEPS a tableAssignment on purpose. eliminatePlayer
    // clears it, but a document written by an older build — or read mid-undo —
    // may still carry one, and that is exactly what this filter defends
    // against. Testing it with the seat already cleared proves nothing.
    const players: SeatedPlayer[] = [
      ...spread([4, 4]),
      { isActive: false, seated: true, tableAssignment: { tableIndex: 0, seatIndex: 7 } },
      { isActive: false, seated: false, tableAssignment: { tableIndex: 0, seatIndex: 6 } },
      { isActive: true, seated: false, tableAssignment: { tableIndex: 0, seatIndex: 5 } },
    ];
    expect(imbalance(players)).toBeNull();
  });

  it('notices the imbalance a bust-out creates', () => {
    const before = spread([5, 4]);
    expect(imbalance(before)).toBeNull();
    const after = [...spread([5, 3]), { isActive: false, seated: false }];
    expect(imbalance(after)?.gap).toBe(2);
  });

  it('handles an empty or missing roster', () => {
    expect(imbalance([])).toBeNull();
    expect(imbalance(null)).toBeNull();
    expect(imbalance(undefined)).toBeNull();
  });

  it('names the same tables for the same shape, whatever the player order', () => {
    // The dismissal key is built from these, so they must not wobble.
    const a = imbalance(spread([2, 5, 2]));
    const shuffled = [...spread([2, 5, 2])].reverse();
    expect(imbalanceKey(a)).toBe(imbalanceKey(imbalance(shuffled)));
  });
});

describe('imbalanceKey and imbalanceDismissed', () => {
  it('stays dismissed for the same imbalance', () => {
    // "Ignore for now" was impossible to use: the dialog reopened instantly
    // because the flag that suppressed the effect was also one of its deps.
    const result = imbalance(spread([6, 3]));
    const dismissed = imbalanceKey(result);
    expect(imbalanceDismissed(dismissed, result)).toBe(true);
  });

  it('re-arms for a different imbalance, which is a new question', () => {
    const dismissed = imbalanceKey(imbalance(spread([6, 3])));
    expect(imbalanceDismissed(dismissed, imbalance(spread([7, 3])))).toBe(false);
  });

  it('is never dismissed when nothing was dismissed', () => {
    expect(imbalanceDismissed(null, imbalance(spread([6, 3])))).toBe(false);
  });

  it('has no key for a balanced table', () => {
    expect(imbalanceKey(imbalance(spread([4, 4])))).toBeNull();
    expect(imbalanceDismissed(null, null)).toBe(false);
  });
});
