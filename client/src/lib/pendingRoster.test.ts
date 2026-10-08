import { describe, it, expect, beforeEach } from 'vitest';
import { markRosterWritten, markRosterIssued, markRosterSettled, rosterIsPending, rosterPayload } from './pendingRoster';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, isActive: true }));

describe('pendingRoster', () => {
  beforeEach(() => markRosterWritten(null));

  it('reports nothing pending before the first write', () => {
    // Load-bearing: answering true here would stop the FIRST snapshot from
    // seeding the roster, which is how a resumed game would come up empty.
    expect(rosterIsPending({ players: players(3) })).toBe(false);
    expect(rosterIsPending({ players: [] })).toBe(false);
  });

  it('reports nothing pending once the written payload matches', () => {
    const roster = players(3);
    markRosterWritten(rosterPayload({ players: roster }));
    expect(rosterIsPending({ players: roster })).toBe(false);
  });

  it('reports pending while a local change has not been written', () => {
    markRosterWritten(rosterPayload({ players: players(3) }));
    expect(rosterIsPending({ players: players(4) })).toBe(true);
  });

  it('notices a change to a player rather than only to the count', () => {
    const roster = players(3);
    markRosterWritten(rosterPayload({ players: roster }));
    const busted = roster.map((p, i) => (i === 0 ? { ...p, isActive: false } : p));
    expect(rosterIsPending({ players: busted })).toBe(true);
  });

  it('clears the moment the new payload is recorded as written', () => {
    markRosterWritten(rosterPayload({ players: players(3) }));
    const grown = players(4);
    expect(rosterIsPending({ players: grown })).toBe(true);
    markRosterWritten(rosterPayload({ players: grown }));
    expect(rosterIsPending({ players: grown })).toBe(false);
  });

  it('forgets everything when a new game resets it', () => {
    markRosterWritten(rosterPayload({ players: players(3) }));
    expect(rosterIsPending({ players: players(9) })).toBe(true);
    markRosterWritten(null);
    expect(rosterIsPending({ players: players(9) })).toBe(false);
  });

  it('treats an absent roster as an empty one', () => {
    markRosterWritten(rosterPayload({ players: [] }));
    expect(rosterIsPending({ players: null })).toBe(false);
    expect(rosterIsPending({ players: undefined })).toBe(false);
  });
});

/**
 * `isFinalTable` rides in the same payload as the roster, because it is written
 * by the same effect — the final-table redraw changes the seats and the flag in
 * one `setState`. These pin the two halves that would each break the fix
 * silently.
 */
describe('pendingRoster — the final-table flag rides along', () => {
  const roster = [{ id: 'a', isActive: true }];
  beforeEach(() => markRosterWritten(null));

  it('reports pending when only the flag has moved', () => {
    // The whole point: a collapse to the final table can leave the roster
    // looking identical while the flag has changed, and the echo of the
    // previous write must not be allowed to undo it.
    markRosterWritten(rosterPayload({ players: roster, isFinalTable: false }));
    expect(rosterIsPending({ players: roster, isFinalTable: true })).toBe(true);
  });

  it('reports nothing pending once the flag has been written', () => {
    markRosterWritten(rosterPayload({ players: roster, isFinalTable: true }));
    expect(rosterIsPending({ players: roster, isFinalTable: true })).toBe(false);
  });

  /**
   * The failure this shape exists to prevent, and it is the worse direction:
   * a writer and a reader that serialise DIFFERENTLY leave the roster pending on
   * every snapshot for the rest of the night, so the console stops applying the
   * document at all. One builder is what makes that impossible.
   */
  it('treats an absent flag and an explicit false as the same payload', () => {
    markRosterWritten(rosterPayload({ players: roster }));
    expect(rosterIsPending({ players: roster, isFinalTable: false })).toBe(false);
    expect(rosterIsPending({ players: roster })).toBe(false);
  });

  it('builds one string for both sides', () => {
    expect(rosterPayload({ players: roster, isFinalTable: true }))
      .toBe(rosterPayload({ players: roster, isFinalTable: true }));
    expect(rosterPayload({ players: roster, isFinalTable: true }))
      .not.toBe(rosterPayload({ players: roster, isFinalTable: false }));
  });
});

describe('a write in flight is pending (October 2026)', () => {
  const roster = { players: [{ id: 'a', name: 'Amy', isActive: true }] as any[], isFinalTable: false };

  it('is pending while a write is in flight, even before anything has landed', () => {
    markRosterWritten(null);
    expect(rosterIsPending(roster)).toBe(false);
    markRosterIssued();
    expect(rosterIsPending(roster)).toBe(true);
    markRosterWritten(rosterPayload(roster));
    expect(rosterIsPending(roster)).toBe(false);
  });

  it('a write that does not land stops counting as in flight', () => {
    markRosterWritten(null);
    markRosterIssued();
    markRosterSettled();
    expect(rosterIsPending(roster)).toBe(false);
  });

  it('a new game forgets anything in flight for the old one', () => {
    markRosterIssued(); markRosterIssued();
    markRosterWritten(null);
    expect(rosterIsPending(roster)).toBe(false);
  });
});
