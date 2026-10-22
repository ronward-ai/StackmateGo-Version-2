import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * OPENING ANOTHER GAME IN THE SAME TAB MUST NOT EMPTY IT (October 2026, a real
 * league's game 3).
 *
 * The roster of a finished league night was found as `players: []` 0.4s after a
 * console claimed it — reopened inside the app (History, the season bar, the
 * other-live-game banner), which is a client-side navigation: the page is not
 * reloaded, so lib/pendingRoster.ts's module-scope memory still held the
 * PREVIOUS game's last-written roster. The new game's first snapshot then read
 * as "this device has a change not yet written", kept the console's empty
 * roster, and the players sync wrote `[]` over the real night.
 *
 * Played through the real useTournament: game A is driven and written, its
 * console unmounts (the director route remounts per game), game B mounts and its
 * listener answers before the initial read does.
 */

const fs = vi.hoisted(() => ({
  docs: {} as Record<string, any>,
  listeners: [] as Array<{ id: string; cb: (snap: any) => void }>,
  holdReads: false,
  heldReads: [] as Array<() => void>,
}));
const clone = (v: any) => JSON.parse(JSON.stringify(v));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, _c: string, id: string) => id,
  getDoc: (id: string) => new Promise(resolve => {
    const answer = () => resolve({ exists: () => !!fs.docs[id], data: () => clone(fs.docs[id]) });
    if (fs.holdReads) fs.heldReads.push(answer); else answer();
  }),
  onSnapshot: (id: string, cb: (snap: any) => void) => {
    const entry = { id, cb };
    fs.listeners.push(entry);
    return () => { fs.listeners = fs.listeners.filter(l => l !== entry); };
  },
}));
vi.mock('@/lib/consoleId', () => ({ getConsoleId: () => 'dev#tab', subscribeConsoleId: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useTournament } from '@/hooks/useTournament';
import { rosterPayload, markRosterWritten, markRosterIssued, mayWriteRoster, forgetRosters } from '@/lib/pendingRoster';

const emit = (id: string) => {
  for (const l of fs.listeners.filter(x => x.id === id)) {
    act(() => { l.cb({ exists: () => true, data: () => clone(fs.docs[id]) }); });
  }
};

function game(names: string[]) {
  return {
    ownerId: 'u1', currentLevel: 0, secondsLeft: 900, isRunning: false, controllingDeviceId: null,
    blindLevels: [{ small: 25, big: 50, duration: 900 }],
    settings: { isSeasonTournament: true },
    prizeStructure: { buyIn: 10, manualPayouts: [] },
    players: names.map((n, i) => ({ id: `${n}-${i}`, name: n, isActive: true, knockouts: 0, rebuys: 0 })),
  };
}

/** One console on one game, with PokerTimer's players sync mirrored. */
function openConsole(id: string) {
  const h = renderHook(() => useTournament(id));
  let lastSynced = '';
  return {
    h,
    get t() { return h.result.current; },
    /** The players sync: through the same guards PokerTimer uses. */
    writePlayers() {
      const s = h.result.current.state;
      if (!h.result.current.hasLoadedRemoteState) return;
      const ser = rosterPayload({ players: s.players, isFinalTable: s.isFinalTable });
      if (ser === lastSynced) return;
      if (!mayWriteRoster(s.players, lastSynced)) return;
      markRosterIssued(id);
      fs.docs[id].players = clone(s.players);
      lastSynced = ser;
      markRosterWritten(id, ser);
      emit(id);
    },
  };
}

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('lastSignedInUid', 'u1');
  forgetRosters();
  fs.listeners = []; fs.heldReads = []; fs.holdReads = false;
  fs.docs = {
    A: game(['Amy', 'Bob', 'Cat']),
    B: game(['Dan', 'Eve', 'Fay', 'Gus']),
  };
});

describe('opening another game in the same tab', () => {
  it("does not keep an empty roster over the game's own, nor write one", async () => {
    // Tonight's game, driven and written on this tab.
    const a = openConsole('A');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    emit('A');
    act(() => { a.t.eliminatePlayer(a.t.state.players[2].id, a.t.state.players[0].id); });
    a.writePlayers();
    a.h.unmount();

    // Reopen game B: the listener answers before the initial read.
    fs.holdReads = true;
    const b = openConsole('B');
    emit('B');
    expect(b.t.state.players.map(p => p.name)).toEqual(['Dan', 'Eve', 'Fay', 'Gus']);
    b.writePlayers();
    expect(fs.docs.B.players).toHaveLength(4);

    fs.heldReads.forEach(r => r());
    await act(async () => { await Promise.resolve(); });
    expect(b.t.state.players).toHaveLength(4);
    b.h.unmount();
  });

  it("a late settle from the game just left does not hold the new game's roster", async () => {
    markRosterIssued('A'); // A's write still in flight as the console moves on
    fs.holdReads = true;
    const b = openConsole('B');
    emit('B');
    markRosterWritten('A', rosterPayload({ players: [] }));
    emit('B');
    expect(b.t.state.players).toHaveLength(4);
    b.h.unmount();
  });

  it('reopening the SAME game after another device changed it shows the game as it is now', async () => {
    const a = openConsole('A');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    emit('A');
    a.writePlayers();
    a.h.unmount();

    // The phone adds a player while this tab is elsewhere.
    fs.docs.A.players.push({ id: 'Hal-9', name: 'Hal', isActive: true, knockouts: 0, rebuys: 0 });

    fs.holdReads = true;
    const again = openConsole('A');
    emit('A');
    expect(again.t.state.players.map(p => p.name)).toContain('Hal');
    again.h.unmount();
  });
});
