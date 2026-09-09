import { describe, it, expect } from 'vitest';
import {
  timestampMs,
  lastActivityMs,
  findCurrentLiveTournament,
  consoleTournamentId,
  LIVE_TOURNAMENT_WINDOW_MS,
} from './liveTournament';

const NOW = Date.parse('2026-01-15T22:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe('timestampMs', () => {
  it('reads an ISO string', () => {
    expect(timestampMs('2026-01-15T22:00:00.000Z')).toBe(NOW);
  });

  it('reads a Firestore Timestamp', () => {
    expect(timestampMs({ seconds: NOW / 1000, nanoseconds: 0 })).toBe(NOW);
  });

  it('reads a plain number of milliseconds', () => {
    expect(timestampMs(NOW)).toBe(NOW);
  });

  it('is 0 for anything unreadable', () => {
    expect(timestampMs(undefined)).toBe(0);
    expect(timestampMs(null)).toBe(0);
    expect(timestampMs('not a date')).toBe(0);
    expect(timestampMs({})).toBe(0);
    expect(timestampMs({ seconds: 'soon' })).toBe(0);
    expect(timestampMs(Number.NaN)).toBe(0);
  });

  // The bug this function exists for: String(Timestamp) is "[object Object]",
  // which sorts above every ISO string, so a stale game could outrank tonight's.
  it('REGRESSION: orders a Timestamp against an ISO string by actual time', () => {
    const old = { seconds: (NOW - 5 * 60_000) / 1000 };
    const recent = new Date(NOW).toISOString();
    expect(timestampMs(recent)).toBeGreaterThan(timestampMs(old));
  });
});

describe('lastActivityMs', () => {
  it('prefers whichever of updatedAt and createdAt is later', () => {
    expect(lastActivityMs({ id: 'a', createdAt: minutesAgo(300), updatedAt: minutesAgo(10) }))
      .toBe(NOW - 10 * 60_000);
    expect(lastActivityMs({ id: 'a', createdAt: minutesAgo(10), updatedAt: minutesAgo(300) }))
      .toBe(NOW - 10 * 60_000);
  });

  it('falls back to createdAt when there is no updatedAt', () => {
    expect(lastActivityMs({ id: 'a', createdAt: minutesAgo(10) })).toBe(NOW - 10 * 60_000);
  });

  it('is 0 when neither is readable', () => {
    expect(lastActivityMs({ id: 'a' })).toBe(0);
  });
});

describe('findCurrentLiveTournament', () => {
  it('is null for an account with no tournaments', () => {
    expect(findCurrentLiveTournament([], NOW)).toBeNull();
  });

  it('finds tonight’s game', () => {
    const game = { id: 'tonight', updatedAt: minutesAgo(5) };
    expect(findCurrentLiveTournament([game], NOW)).toBe(game);
  });

  it('takes the most recently active, not the most recently created', () => {
    const older = { id: 'older', createdAt: minutesAgo(400), updatedAt: minutesAgo(2) };
    const newer = { id: 'newer', createdAt: minutesAgo(60), updatedAt: minutesAgo(60) };
    expect(findCurrentLiveTournament([newer, older], NOW)?.id).toBe('older');
  });

  it('skips a game marked completed', () => {
    const done = { id: 'done', status: 'completed', updatedAt: minutesAgo(5) };
    const live = { id: 'live', updatedAt: minutesAgo(30) };
    expect(findCurrentLiveTournament([done, live], NOW)?.id).toBe('live');
    expect(findCurrentLiveTournament([done], NOW)).toBeNull();
  });

  // Nothing deletes these documents, so months-old test games are candidates.
  it('ignores anything outside the recency window', () => {
    const ancient = { id: 'ancient', updatedAt: new Date(NOW - 90 * 24 * 3600_000).toISOString() };
    expect(findCurrentLiveTournament([ancient], NOW)).toBeNull();
  });

  it('treats the window edge as stale', () => {
    const edge = { id: 'edge', updatedAt: new Date(NOW - LIVE_TOURNAMENT_WINDOW_MS).toISOString() };
    expect(findCurrentLiveTournament([edge], NOW)).toBeNull();

    const inside = {
      id: 'inside',
      updatedAt: new Date(NOW - LIVE_TOURNAMENT_WINDOW_MS + 1000).toISOString(),
    };
    expect(findCurrentLiveTournament([inside], NOW)?.id).toBe('inside');
  });

  it('ignores a document with no readable timestamps at all', () => {
    expect(findCurrentLiveTournament([{ id: 'undated' }], NOW)).toBeNull();
  });

  it('does not mutate the array it is given', () => {
    const candidates = [
      { id: 'a', updatedAt: minutesAgo(100) },
      { id: 'b', updatedAt: minutesAgo(5) },
    ];
    findCurrentLiveTournament(candidates, NOW);
    expect(candidates.map(c => c.id)).toEqual(['a', 'b']);
  });

  // The auto-save guard depends on this: a device holding a stale local roster
  // must SEE the account's live game so it joins rather than writing over it.
  it('REGRESSION: reports the live game to a device that has not read it', () => {
    const live = { id: 'live', status: 'active', createdAt: minutesAgo(120), updatedAt: minutesAgo(3) };
    expect(findCurrentLiveTournament([live], NOW)).toBe(live);
  });
});

describe('consoleTournamentId', () => {
  it('is null for a local game, however stale the held id', () => {
    // The regression: New Tournament leaves PokerTimer mounted, so the previous
    // game's id survives in state. Returning it pointed the QR at the last game.
    expect(
      consoleTournamentId({ detailsType: 'standalone', heldId: 'game_previous' })
    ).toBeNull();
    expect(
      consoleTournamentId({ detailsType: 'season', heldId: 'game_previous' })
    ).toBeNull();
  });

  it('is the details id for a database game', () => {
    expect(
      consoleTournamentId({ detailsType: 'database', detailsId: 'game_now', heldId: 'game_previous' })
    ).toBe('game_now');
  });

  it('falls back to the held id for a database game that has not filled details in yet', () => {
    expect(consoleTournamentId({ detailsType: 'database', heldId: 'game_now' })).toBe('game_now');
  });

  it('resolves a saved game whose type says league — the fields disagree by design', () => {
    // details.type is overloaded: it says "league or standalone" AND "saved to
    // Firestore", and the mode toggle writes the first over the second. A saved
    // game whose slider was flipped to League must still find its document, or
    // the syncs stop and the roster starts fighting the snapshot.
    expect(
      consoleTournamentId({ detailsType: 'season', detailsId: 'game_now', heldId: 'game_now' })
    ).toBe('game_now');
    expect(
      consoleTournamentId({ detailsType: 'standalone', detailsId: 'game_now' })
    ).toBe('game_now');
  });

  it('lets the URL win, so the director route works before the document loads', () => {
    expect(
      consoleTournamentId({ urlId: 'from_url', detailsType: 'standalone', heldId: 'game_previous' })
    ).toBe('from_url');
  });

  it('is null when there is nothing at all', () => {
    expect(consoleTournamentId({})).toBeNull();
  });

  it('accepts a numeric details id', () => {
    expect(consoleTournamentId({ detailsType: 'database', detailsId: 12345 })).toBe('12345');
  });
});
