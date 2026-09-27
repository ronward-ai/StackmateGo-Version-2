import { describe, it, expect, beforeEach } from 'vitest';
import { markRosterWritten, rosterIsPending } from './pendingRoster';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, isActive: true }));

describe('pendingRoster', () => {
  beforeEach(() => markRosterWritten(null));

  it('reports nothing pending before the first write', () => {
    // Load-bearing: answering true here would stop the FIRST snapshot from
    // seeding the roster, which is how a resumed game would come up empty.
    expect(rosterIsPending(players(3))).toBe(false);
    expect(rosterIsPending([])).toBe(false);
  });

  it('reports nothing pending once the written payload matches', () => {
    const roster = players(3);
    markRosterWritten(JSON.stringify(roster));
    expect(rosterIsPending(roster)).toBe(false);
  });

  it('reports pending while a local change has not been written', () => {
    markRosterWritten(JSON.stringify(players(3)));
    expect(rosterIsPending(players(4))).toBe(true);
  });

  it('notices a change to a player rather than only to the count', () => {
    const roster = players(3);
    markRosterWritten(JSON.stringify(roster));
    const busted = roster.map((p, i) => (i === 0 ? { ...p, isActive: false } : p));
    expect(rosterIsPending(busted)).toBe(true);
  });

  it('clears the moment the new payload is recorded as written', () => {
    markRosterWritten(JSON.stringify(players(3)));
    const grown = players(4);
    expect(rosterIsPending(grown)).toBe(true);
    markRosterWritten(JSON.stringify(grown));
    expect(rosterIsPending(grown)).toBe(false);
  });

  it('forgets everything when a new game resets it', () => {
    markRosterWritten(JSON.stringify(players(3)));
    expect(rosterIsPending(players(9))).toBe(true);
    markRosterWritten(null);
    expect(rosterIsPending(players(9))).toBe(false);
  });

  it('treats an absent roster as an empty one', () => {
    markRosterWritten(JSON.stringify([]));
    expect(rosterIsPending(null)).toBe(false);
    expect(rosterIsPending(undefined)).toBe(false);
  });
});
