import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A REBUY TAKEN WHILE THE BUST-OUT'S WRITE IS STILL IN FLIGHT (October 2026,
 * found reproducing a report of rebuys missing from a night).
 *
 * Firestore echoes every write back to this console at once and acknowledges it
 * later. A snapshot arriving between the two carries the document as the
 * server is about to have it — which may be BEHIND the screen. lib/pendingRoster.ts
 * is what stops that echo applying, and it treated "nothing acknowledged yet"
 * as "nothing pending": with the first roster write of a page (after a load or
 * reload) still in flight, the echo of the rebuy-answer write put a rebought
 * player straight back out, rebuy count and all.
 *
 * Played through the real useTournament and useRebuyOffer. The writes are
 * mirrored from PokerTimer's players sync: issued (markRosterIssued), echoed at
 * once, and acknowledged (markRosterWritten) only when the test says.
 */

const fs = vi.hoisted(() => ({ doc: null as any, listeners: [] as any[] }));
const clone = (v: any) => JSON.parse(JSON.stringify(v));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, _c: string, id: string) => id,
  getDoc: async () => ({ exists: () => !!fs.doc, data: () => clone(fs.doc) }),
  onSnapshot: (_r: unknown, cb: any) => { fs.listeners.push(cb); return () => {}; },
}));
vi.mock('@/lib/consoleId', () => ({ getConsoleId: () => 'dev#tab', subscribeConsoleId: () => () => {} }));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useTournament } from '@/hooks/useTournament';
import { useRebuyOffer } from '@/hooks/useRebuyOffer';
import { rosterPayload, markRosterWritten, markRosterIssued } from '@/lib/pendingRoster';

const emit = () => { for (const cb of fs.listeners) act(() => { cb({ exists: () => true, data: () => clone(fs.doc) }); }); };

async function openConsole() {
  const h = renderHook(() => { const t = useTournament('G'); return { t, offer: useRebuyOffer(t, false) }; });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  emit();
  let lastPlayers = '';
  const unacked: Array<() => void> = [];
  const c = {
    get t() { return h.result.current.t; },
    get offer() { return h.result.current.offer; },
    id: (n: string) => h.result.current.t.state.players.find(p => p.name === n)!.id,
    dan: () => h.result.current.t.state.players.find(p => p.name === 'Dan')!,
    /** PokerTimer's players sync: issued, echoed at once, acknowledged later. */
    writePlayers({ ack = true } = {}) {
      const s = h.result.current.t.state;
      const ser = rosterPayload({ players: s.players, isFinalTable: s.isFinalTable });
      if (ser === lastPlayers) return;
      markRosterIssued();
      fs.doc.players = clone(s.players);
      emit();
      const done = () => { lastPlayers = ser; markRosterWritten(ser); };
      if (ack) done(); else unacked.push(done);
    },
    /** Any OTHER write whose echo carries the document's current roster. */
    writeSomethingElse() { emit(); },
    ackAll() { while (unacked.length) unacked.shift()!(); },
    h,
  };
  return c;
}

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('lastSignedInUid', 'u1');
  markRosterWritten(null);
  fs.listeners = [];
  fs.doc = {
    ownerId: 'u1', currentLevel: 0, secondsLeft: 900, isRunning: false, controllingDeviceId: 'dev#tab',
    blindLevels: [{ small: 25, big: 50, duration: 900 }],
    settings: { isSeasonTournament: true },
    prizeStructure: { buyIn: 10, allowRebuys: true, rebuyAmount: 10, manualPayouts: [] },
    players: ['Amy', 'Bob', 'Cat', 'Dan'].map((n, i) => ({ id: `p${i}`, name: n, isActive: true, knockouts: 0, rebuys: 0 })),
  };
});

describe('a rebuy while the bust-out is still being written', () => {
  it('survives an echo when it is the first write since the page loaded (the reproduced loss)', async () => {
    const c = await openConsole();
    act(() => { c.t.eliminatePlayer(c.id('Dan'), c.id('Amy')); });
    c.writePlayers({ ack: false });        // the bust-out: sent, not yet acknowledged
    act(() => { c.offer.answer(true); });  // Rebuy, from the pop-up
    c.writeSomethingElse();                // e.g. the rebuy-answer write's echo: Dan still busted
    expect(c.dan()).toMatchObject({ isActive: true, rebuys: 1 });
    c.ackAll(); c.writePlayers();
    expect(fs.doc.players.find((p: any) => p.name === 'Dan')).toMatchObject({ isActive: true, rebuys: 1 });
    c.h.unmount();
  });

  it('survives it mid-game too', async () => {
    const c = await openConsole();
    act(() => { c.t.eliminatePlayer(c.id('Cat'), c.id('Amy')); });
    c.writePlayers();
    act(() => { c.offer.answer(false); });
    act(() => { c.t.eliminatePlayer(c.id('Dan'), c.id('Amy')); });
    c.writePlayers({ ack: false });
    act(() => { c.offer.answer(true); });
    c.writeSomethingElse();
    c.ackAll(); c.writePlayers();
    expect(c.dan()).toMatchObject({ isActive: true, rebuys: 1 });
    c.h.unmount();
  });

  it('a resumed game still seeds from the document, with nothing in flight', async () => {
    fs.doc.players[3] = { ...fs.doc.players[3], isActive: false, position: 4 };
    const c = await openConsole();
    expect(c.dan()).toMatchObject({ isActive: false, position: 4 });
    c.h.unmount();
  });
});
