import { describe, it, expect } from 'vitest';
import { mergePlayersFromSnapshot } from './snapshotMerge';

const p = (over: any = {}) => ({ id: 'a', name: 'Dave', isActive: true, ...over }) as any;

/**
 * CHARACTERISATION FIRST. Everything in this block asserts what the inline
 * version in `useTournament` already did, so the extraction is proven faithful
 * rather than hoped to be. These rules had no test at all before.
 */
describe('mergePlayersFromSnapshot — the existing rules', () => {
  it('keeps a LOCAL elimination over an active document entry', () => {
    const out = mergePlayersFromSnapshot([p({ isActive: false, position: 4 })], [p({ isActive: true })]);
    expect(out[0].isActive).toBe(false);
    expect((out[0] as any).position).toBe(4);
  });

  it('accepts an elimination that came from the document', () => {
    const out = mergePlayersFromSnapshot([p({ isActive: true })], [p({ isActive: false, position: 4 })]);
    expect(out[0].isActive).toBe(false);
  });

  it('takes the HIGHER of the counts that only go up', () => {
    const out = mergePlayersFromSnapshot(
      [p({ knockouts: 3, rebuys: 2, reEntries: 1 })],
      [p({ knockouts: 1, rebuys: 0, reEntries: 0 })],
    );
    expect(out[0]).toMatchObject({ knockouts: 3, rebuys: 2, reEntries: 1 });
  });

  it('does not lower a count the document happens to have higher', () => {
    const out = mergePlayersFromSnapshot([p({ knockouts: 1 })], [p({ knockouts: 5 })]);
    expect((out[0] as any).knockouts).toBe(5);
  });

  it('prefers local prizeMoney', () => {
    const out = mergePlayersFromSnapshot([p({ prizeMoney: 50 })], [p({ prizeMoney: 10 })]);
    expect((out[0] as any).prizeMoney).toBe(50);
  });

  it('APPENDS a local player the document has never heard of', () => {
    const out = mergePlayersFromSnapshot([p({ id: 'a' }), p({ id: 'b', name: 'Sam' })], [p({ id: 'a' })]);
    expect(out.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('takes a player the document has and this device does not', () => {
    const out = mergePlayersFromSnapshot([], [p({ id: 'z', name: 'New' })]);
    expect(out.map(x => x.id)).toEqual(['z']);
  });

  // A document that says nothing about players must not empty the roster.
  it('keeps the roster when the document carries no players array', () => {
    const local = [p()];
    expect(mergePlayersFromSnapshot(local, undefined)).toEqual(local);
    expect(mergePlayersFromSnapshot(local, null)).toEqual(local);
  });

  it('survives a missing local roster', () => {
    expect(mergePlayersFromSnapshot(null, [p()])).toHaveLength(1);
    expect(mergePlayersFromSnapshot(undefined, undefined)).toEqual([]);
  });
});

/**
 * THE FIX. On a takeover, none of the above may apply: this device has been
 * read-only while someone else drove, so its roster is stale rather than
 * optimistic, and every rule above would push that staleness into the live game.
 */
describe('mergePlayersFromSnapshot — adopt', () => {
  it('takes the document verbatim', () => {
    const incoming = [p({ id: 'a', knockouts: 1 })];
    expect(mergePlayersFromSnapshot([p({ id: 'a', knockouts: 9 })], incoming, { adopt: true })).toBe(incoming);
  });

  // The exact repro: KO someone on the read-only console, then take control.
  it('drops a phantom elimination made on the read-only console', () => {
    const out = mergePlayersFromSnapshot(
      [p({ isActive: false, position: 4 })],
      [p({ isActive: true })],
      { adopt: true },
    );
    expect(out[0].isActive).toBe(true);
    expect((out[0] as any).position).toBeUndefined();
  });

  it('drops inflated local counts', () => {
    const out = mergePlayersFromSnapshot([p({ knockouts: 9, rebuys: 9 })], [p({ knockouts: 1, rebuys: 0 })], { adopt: true });
    expect(out[0]).toMatchObject({ knockouts: 1, rebuys: 0 });
  });

  it('does NOT re-append a player the driving device removed', () => {
    const out = mergePlayersFromSnapshot([p({ id: 'a' }), p({ id: 'gone' })], [p({ id: 'a' })], { adopt: true });
    expect(out.map(x => x.id)).toEqual(['a']);
  });

  // Even adopting, silence is not an instruction to empty the roster.
  it('still keeps the roster when the document carries no players array', () => {
    const local = [p()];
    expect(mergePlayersFromSnapshot(local, undefined, { adopt: true })).toEqual(local);
  });
});
