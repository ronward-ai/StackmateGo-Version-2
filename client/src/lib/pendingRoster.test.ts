import { describe, it, expect, beforeEach } from 'vitest';
import { markRosterWritten, markRosterIssued, markRosterSettled, rosterIsPending, rosterPayload, forgetRosters, mayWriteRoster } from './pendingRoster';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, isActive: true }));

describe('pendingRoster', () => {
  beforeEach(() => forgetRosters());

  it('reports nothing pending before the first write', () => {
    // Load-bearing: answering true here would stop the FIRST snapshot from
    // seeding the roster, which is how a resumed game would come up empty.
    expect(rosterIsPending('G', { players: players(3) })).toBe(false);
    expect(rosterIsPending('G', { players: [] })).toBe(false);
  });

  it('reports nothing pending once the written payload matches', () => {
    const roster = players(3);
    markRosterWritten('G', rosterPayload({ players: roster }));
    expect(rosterIsPending('G', { players: roster })).toBe(false);
  });

  it('reports pending while a local change has not been written', () => {
    markRosterWritten('G', rosterPayload({ players: players(3) }));
    expect(rosterIsPending('G', { players: players(4) })).toBe(true);
  });

  it('notices a change to a player rather than only to the count', () => {
    const roster = players(3);
    markRosterWritten('G', rosterPayload({ players: roster }));
    const busted = roster.map((p, i) => (i === 0 ? { ...p, isActive: false } : p));
    expect(rosterIsPending('G', { players: busted })).toBe(true);
  });

  it('clears the moment the new payload is recorded as written', () => {
    markRosterWritten('G', rosterPayload({ players: players(3) }));
    const grown = players(4);
    expect(rosterIsPending('G', { players: grown })).toBe(true);
    markRosterWritten('G', rosterPayload({ players: grown }));
    expect(rosterIsPending('G', { players: grown })).toBe(false);
  });

  it('forgets everything when a new game resets it', () => {
    markRosterWritten('G', rosterPayload({ players: players(3) }));
    expect(rosterIsPending('G', { players: players(9) })).toBe(true);
    forgetRosters();
    expect(rosterIsPending('G', { players: players(9) })).toBe(false);
  });

  it('treats an absent roster as an empty one', () => {
    markRosterWritten('G', rosterPayload({ players: [] }));
    expect(rosterIsPending('G', { players: null })).toBe(false);
    expect(rosterIsPending('G', { players: undefined })).toBe(false);
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
  beforeEach(() => forgetRosters());

  it('reports pending when only the flag has moved', () => {
    // The whole point: a collapse to the final table can leave the roster
    // looking identical while the flag has changed, and the echo of the
    // previous write must not be allowed to undo it.
    markRosterWritten('G', rosterPayload({ players: roster, isFinalTable: false }));
    expect(rosterIsPending('G', { players: roster, isFinalTable: true })).toBe(true);
  });

  it('reports nothing pending once the flag has been written', () => {
    markRosterWritten('G', rosterPayload({ players: roster, isFinalTable: true }));
    expect(rosterIsPending('G', { players: roster, isFinalTable: true })).toBe(false);
  });

  /**
   * The failure this shape exists to prevent, and it is the worse direction:
   * a writer and a reader that serialise DIFFERENTLY leave the roster pending on
   * every snapshot for the rest of the night, so the console stops applying the
   * document at all. One builder is what makes that impossible.
   */
  it('treats an absent flag and an explicit false as the same payload', () => {
    markRosterWritten('G', rosterPayload({ players: roster }));
    expect(rosterIsPending('G', { players: roster, isFinalTable: false })).toBe(false);
    expect(rosterIsPending('G', { players: roster })).toBe(false);
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
    forgetRosters();
    expect(rosterIsPending('G', roster)).toBe(false);
    markRosterIssued('G');
    expect(rosterIsPending('G', roster)).toBe(true);
    markRosterWritten('G', rosterPayload(roster));
    expect(rosterIsPending('G', roster)).toBe(false);
  });

  it('a write that does not land stops counting as in flight', () => {
    forgetRosters();
    markRosterIssued('G');
    markRosterSettled('G');
    expect(rosterIsPending('G', roster)).toBe(false);
  });

  it('a new game forgets anything in flight for the old one', () => {
    markRosterIssued('G'); markRosterIssued('G');
    forgetRosters();
    expect(rosterIsPending('G', roster)).toBe(false);
  });
});

describe('each game answers only for itself (a real league night emptied, October 2026)', () => {
  beforeEach(() => forgetRosters());
  const roster = { players: [{ id: 'a', isActive: true }] };

  it("another game's last write does not make this one pending", () => {
    markRosterWritten('A', rosterPayload(roster));
    expect(rosterIsPending('B', { players: [] })).toBe(false);
  });

  it("another game's write in flight does not make this one pending", () => {
    markRosterIssued('A');
    expect(rosterIsPending('B', { players: [] })).toBe(false);
  });

  it('a settle from before the game was forgotten changes nothing', () => {
    const gen = markRosterIssued('A');
    markRosterWritten('A', null); // a new console starts listening to A
    markRosterWritten('A', rosterPayload(roster), gen);
    expect(rosterIsPending('A', { players: [] })).toBe(false);
    markRosterSettled('A', gen);
    expect(rosterIsPending('A', { players: [] })).toBe(false);
  });
});

describe('mayWriteRoster', () => {
  const some = [{ id: 'a' }];
  it('never sends an empty roster — the database refuses one too', () => {
    expect(mayWriteRoster([], '')).toBe(false);
    expect(mayWriteRoster(undefined, '')).toBe(false);
    // It used to allow this (the last player removed); the rules now refuse a
    // roster going from players to none, so the app does not attempt it.
    expect(mayWriteRoster([], rosterPayload({ players: some }))).toBe(false);
  });
  it('always sends a roster with players in it', () => {
    expect(mayWriteRoster(some, '')).toBe(true);
  });
});
