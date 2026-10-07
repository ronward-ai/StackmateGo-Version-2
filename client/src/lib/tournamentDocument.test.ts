import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));

import { buildTournamentDocument } from './tournamentDocument';
import { eventNameOf, eventNameOfTournament } from './eventName';

/**
 * October audit, M18: creation must write the director's own branding and
 * never a resolved name. It froze the league's name at creation into
 * `branding.leagueName`, which reads back as an EXPLICIT event name — so the
 * console's Event Name field showed it, and a league rename never reached the
 * app bar or any player's phone.
 */
function state(branding: Record<string, unknown>) {
  return {
    currentLevel: 0, secondsLeft: 900, isRunning: false, players: [], levels: [],
    details: { localGameId: 'g1' },
    prizeStructure: { buyIn: 10, manualPayouts: [] },
    settings: { isSeasonTournament: true, leagueId: 'L1', branding },
  } as any;
}

describe('buildTournamentDocument branding', () => {
  it('writes no name the director did not type', () => {
    const doc = buildTournamentDocument(state({ leagueName: '', isVisible: true }), 'u1');
    expect(doc.settings.branding.eventName).toBeUndefined();
    expect(doc.settings.branding.leagueName || '').toBe('');
    // What the console's Event Name field would show after the snapshot merges back.
    expect(eventNameOf(doc.settings, null)).toBe('');
  });

  it('lets a league rename reach players', () => {
    const doc = buildTournamentDocument(state({}), 'u1');
    expect(eventNameOfTournament(doc as any, 'Renamed League')).toBe('Renamed League');
  });

  it('keeps an event name the director did type, and the logo', () => {
    const doc = buildTournamentDocument(state({ eventName: 'Friday Night', logoUrl: 'data:x' }), 'u1');
    expect(eventNameOfTournament(doc as any, 'Renamed League')).toBe('Friday Night');
    expect(doc.settings.branding.logoUrl).toBe('data:x');
    expect(doc.settings.branding.isVisible).toBe(true);
  });
});

import { toFirestoreValue, createDocViaRest } from './tournamentDocument';
import { fromRestValue } from './firestoreRest';
import { afterEach } from 'vitest';

describe('toFirestoreValue (Oct coverage)', () => {
  it('round-trips through the decoder', () => {
    const value = { a: 1, b: 1.5, c: 'x', d: true, e: null, f: [1, { g: 'h' }], i: { j: [] } };
    expect(fromRestValue(toFirestoreValue(value))).toEqual(value);
  });

  // The bug: NaN became `{ doubleValue: null }` in JSON and Firestore 400'd.
  it('writes a non-finite number as null, never as a doubleValue', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const encoded = JSON.parse(JSON.stringify(toFirestoreValue(bad)));
      expect(encoded).toEqual({ nullValue: null });
    }
  });

  it('writes undefined as null', () => {
    expect(toFirestoreValue(undefined)).toEqual({ nullValue: null });
  });
});

describe('createDocViaRest (Oct coverage)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  // THE arm that once cost a live game when it PATCHed instead.
  it('adopts on a 409 and writes nothing else', async () => {
    const calls: any[] = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), method: init?.method });
      return { status: 409, ok: false, json: async () => ({}) } as any;
    }) as any;
    await expect(createDocViaRest('p', 'd', 'activeTournaments', { a: 1 }, 'tok', 'game_1')).resolves.toBe('game_1');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toContain('documentId=game_1');
  });

  it('reports any other failure with the server message', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 400, ok: false, json: async () => ({ error: { message: 'Invalid value' } }) })) as any;
    await expect(createDocViaRest('p', 'd', 'c', {}, 'tok', 'x')).rejects.toThrow('Invalid value');
  });

  it('returns the generated id when none was given', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 200, ok: true, json: async () => ({ name: 'projects/p/databases/d/documents/c/abc123' }) })) as any;
    await expect(createDocViaRest('p', 'd', 'c', {}, 'tok')).resolves.toBe('abc123');
  });
});
