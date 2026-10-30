import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * AN UNCHANGED GAME MUST NOT BE SAVED AGAIN (October 2026, a live league night).
 *
 * The phone saved the game about once a second, and every device redrew on every
 * save: lag, flashing, levels jumping, the Tables and Seats boxes snapping back.
 * Two things fed the loop. The players sync compared payloads with plain
 * `JSON.stringify`, which follows KEY ORDER — and a Firestore map has none, so
 * the echo of an unchanged roster serialised differently and was written again.
 * And the clock sync re-ran on every new levels ARRAY, carrying the ticking
 * `secondsLeft`, so it always wrote.
 *
 * Played through the real useTournament. Firestore is one document whose every
 * snapshot comes back with its keys REVERSED and `undefined` written as `null`,
 * the two ways a round trip changes a value without changing its meaning. The
 * syncs are mirrored from PokerTimer with the guards it really uses.
 */

const fs = vi.hoisted(() => ({ doc: null as any, listeners: [] as any[] }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, _c: string, id: string) => id,
  getDoc: async () => ({ exists: () => !!fs.doc, data: () => roundTrip(fs.doc) }),
  onSnapshot: (_r: unknown, cb: any) => { fs.listeners.push(cb); return () => {}; },
}));
vi.mock('@/lib/consoleId', () => ({ getConsoleId: () => 'dev#tab', subscribeConsoleId: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useTournament } from '@/hooks/useTournament';
import { rosterPayload, markRosterWritten, markRosterIssued, forgetRosters } from '@/lib/pendingRoster';
import { clockSyncKey } from '@/lib/stableJson';
import { sanitizeForFirestore } from '@/lib/utils';

/**
 * What a Firestore round trip does: keys in an order of its own (alternating
 * here, so no two consecutive snapshots agree), undefined as null.
 */
let trips = 0;
function roundTrip(value: any): any {
  trips += 1;
  return reorder(value, trips % 2 === 0);
}
function reorder(value: any, reverse: boolean): any {
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => reorder(v, reverse));
  const keys = Object.keys(value);
  const out: any = {};
  for (const k of reverse ? keys.reverse() : keys) out[k] = reorder(value[k], reverse);
  return out;
}

const emit = () => { for (const cb of fs.listeners) act(() => { cb({ exists: () => true, data: () => roundTrip(fs.doc) }); }); };

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('lastSignedInUid', 'u1');
  forgetRosters();
  fs.listeners = [];
  fs.doc = {
    ownerId: 'u1', currentLevel: 0, secondsLeft: 900, isRunning: false, controllingDeviceId: 'dev#tab',
    blindLevels: [{ small: 25, big: 50, ante: 0, duration: 900 }, { small: 50, big: 100, ante: 0, duration: 900 }],
    settings: { isSeasonTournament: true, tables: { numberOfTables: 2, seatsPerTable: 8 } },
    prizeStructure: { buyIn: 10, manualPayouts: [] },
    players: ['Amy', 'Bob', 'Cat', 'Dan'].map((n, i) => ({
      id: `p${i}`, name: n, isActive: true, knockouts: 0, rebuys: 0, position: undefined,
      tableAssignment: { tableIndex: i % 2, seatIndex: i },
    })),
  };
});

async function openConsole() {
  const h = renderHook(() => useTournament('G'));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  emit();
  let lastPlayers = '';
  let writes = 0;
  const c = {
    get state() { return h.result.current.state; },
    get writes() { return writes; },
    /** PokerTimer's players sync, with its real guard: skip what was last written. */
    syncPlayers() {
      const s = h.result.current.state;
      const ser = rosterPayload({ players: s.players, isFinalTable: s.isFinalTable });
      if (ser === lastPlayers) return;
      writes += 1;
      markRosterIssued('G');
      // As the door writes it: sanitizeForFirestore turns undefined into null.
      fs.doc.players = sanitizeForFirestore(s.players);
      lastPlayers = ser;
      markRosterWritten('G', ser);
      emit();
    },
    h,
  };
  return c;
}

describe('an unchanged game is not saved again', () => {
  it('echoes in another key order cause no further writes; a real change causes exactly one', async () => {
    const c = await openConsole();
    // The first sync settles the console's own copy.
    c.syncPlayers();
    c.syncPlayers();
    const settled = c.writes;

    // A dozen snapshots of an unchanged game — the clock's own saves, other
    // devices, the server filling in a timestamp. None of them is a change.
    for (let i = 0; i < 12; i++) { emit(); c.syncPlayers(); }
    expect(c.writes).toBe(settled);

    // A real change is still written, once.
    act(() => { c.h.result.current.eliminatePlayer('p3', 'p0'); });
    c.syncPlayers();
    emit();
    c.syncPlayers();
    expect(c.writes).toBe(settled + 1);
    c.h.unmount();
  });

  it('the clock sync keys the blind structure by content, so a reordered echo does not re-run it', async () => {
    const c = await openConsole();
    const before = clockSyncKey(c.state.levels);
    emit();
    const after = clockSyncKey(c.state.levels);
    expect(after).toBe(before);
    // ...while a genuine change to the structure still changes the key.
    expect(clockSyncKey([{ small: 25, big: 50, ante: 0, duration: 600 }])).not.toBe(before);
    c.h.unmount();
  });
});
