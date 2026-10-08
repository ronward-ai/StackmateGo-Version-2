import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TWO CONSOLES ON ONE GAME, HANDING OVER MID-NIGHT (October 2026).
 *
 * The laptop runs the game, the phone watches; partway through, the phone takes
 * control. Every reported handover bug lived in that sequence — rebuys
 * reverting, a read-only screen stuck on a stale roster, the same rebuy
 * question popping up on the device that took over — and each fix was tested
 * one function at a time. This plays it through two REAL useTournament hooks and
 * two REAL useRebuyOffer hooks, sharing one in-memory game document.
 *
 * WHAT IS A STAND-IN, and must follow the app if it changes:
 *   - Firestore: one document and its listeners (the mock below).
 *   - Which console is asking (lib/consoleId), switched per console.
 *   - PokerTimer's writers: the players sync, the rebuysAnswered sync, the
 *     automatic claim, Take control and the one door's "may this console
 *     write" check — mirrored in `write`, `autoClaim` and `takeControl`.
 *   - `lib/pendingRoster.ts` keeps "last written" at module scope, which in the
 *     app is per TAB. Two consoles here share one module, so it holds whichever
 *     wrote last. Harmless for these sequences — only the driving console
 *     writes, and a takeover adopts the document, which beats the pending check
 *     — but it is why this file asserts nothing about echo timing.
 */

const fs = vi.hoisted(() => ({
  doc: null as any,
  listeners: [] as Array<{ console: string; cb: (snap: any) => void }>,
  current: 'laptop',
}));
const clone = (v: any) => JSON.parse(JSON.stringify(v));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _c: string, id: string) => id,
  getDoc: async () => ({ exists: () => !!fs.doc, data: () => clone(fs.doc) }),
  onSnapshot: (_ref: unknown, cb: (snap: any) => void) => {
    const entry = { console: fs.current, cb };
    fs.listeners.push(entry);
    return () => { fs.listeners = fs.listeners.filter(l => l !== entry); };
  },
}));
vi.mock('@/lib/consoleId', () => ({
  getConsoleId: () => `dev-${fs.current}#tab`,
  subscribeConsoleId: () => () => {},
}));
const authState = { user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => authState }));

import { useTournament } from '@/hooks/useTournament';
import { useRebuyOffer } from '@/hooks/useRebuyOffer';
import { controlOf, mayDrive, shouldClaim } from '@/lib/directorControl';
import { rosterPayload, markRosterWritten } from '@/lib/pendingRoster';
import { playerIdsOf } from '@/lib/seatClaims';
import { createLeague } from './leagueHarness';

const prize = { buyIn: 10, allowRebuys: true, rebuyAmount: 10, manualPayouts: [] };

function seedGame(names: string[]) {
  fs.doc = {
    ownerId: 'u1', name: 'Tournament', isPublished: true,
    currentLevel: 0, secondsLeft: 900, isRunning: false,
    blindLevels: [{ small: 25, big: 50, duration: 900 }],
    settings: { isSeasonTournament: true, leagueId: 'L1', seasonId: 'spring' },
    prizeStructure: prize,
    players: names.map((n, i) => ({ id: `p${i}`, name: n, isActive: true, knockouts: 0, rebuys: 0 })),
    controllingDeviceId: null,
  };
  fs.listeners = [];
}

/** Deliver the document to every console, each asking as itself. */
function emit() {
  for (const l of [...fs.listeners]) {
    fs.current = l.console;
    act(() => { l.cb({ exists: () => true, data: () => clone(fs.doc) }); });
  }
}

type Console = ReturnType<typeof openConsole>;

/** One console: the real hooks, as PokerTimer wires them. */
async function openConsole(name: string) {
  fs.current = name;
  const me = `dev-${name}#tab`;
  const h = renderHook(() => {
    const t = useTournament('G');
    const readOnly = !mayDrive(controlOf(t.controllingDeviceId, me));
    const offer = useRebuyOffer(t, readOnly);
    return { t, offer, readOnly };
  });
  // The initial read, then the listener's first snapshot.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  emit();
  const c = {
    name, me, h,
    get t() { return h.result.current.t; },
    get offer() { return h.result.current.offer; },
    get readOnly() { return h.result.current.readOnly; },
    id(player: string) { return c.t.state.players.find(p => p.name === player)!.id; },
    roster() { return c.t.state.players.map(p => `${p.name}:${p.isActive === false ? `out${p.position}` : 'in'}${p.rebuys ? `+${p.rebuys}` : ''}`).sort(); },
  };
  autoClaim(c);
  return c;
}

/** PokerTimer's automatic claim of a game nobody holds, once it has been read. */
function autoClaim(c: { me: string; t: any }) {
  if (c.t.hasLoadedRemoteState && shouldClaim(controlOf(fs.doc.controllingDeviceId, c.me))) {
    fs.doc.controllingDeviceId = c.me;
    emit();
  }
}

/** Take control: the transaction, forced. */
function takeControl(c: Console) {
  fs.doc.controllingDeviceId = c.me;
  emit();
}

/**
 * PokerTimer's syncs through the one door: written only by a console that may
 * drive. Returns what the door returned.
 */
function write(c: Console): 'written' | 'skipped' {
  if (!mayDrive(controlOf(fs.doc.controllingDeviceId, c.me))) return 'skipped';
  const s = c.t.state;
  fs.doc.players = clone(s.players);
  fs.doc.playerIds = playerIdsOf(s.players);
  fs.doc.isFinalTable = !!s.isFinalTable;
  fs.doc.rebuysAnswered = c.offer.answered;
  markRosterWritten(rosterPayload({ players: s.players, isFinalTable: s.isFinalTable }));
  emit();
  return 'written';
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
  markRosterWritten(null);
});

describe('handing over between two consoles mid-game', () => {
  it('the watcher tracks the game, the takeover is clean, and the league records the night once', async () => {
    seedGame(['Amy', 'Bob', 'Cat', 'Dan', 'Eve']);
    const league = createLeague();
    const laptop = await openConsole('laptop');
    const phone = await openConsole('phone');

    // The laptop claimed the game on opening it; the phone did not take it.
    expect(fs.doc.controllingDeviceId).toBe('dev-laptop#tab');
    expect(laptop.readOnly).toBe(false);
    expect(phone.readOnly).toBe(true);

    // A bust-out on the laptop: it is asked, the phone is not.
    act(() => { laptop.t.eliminatePlayer(laptop.id('Eve'), laptop.id('Amy')); });
    expect(laptop.offer.player?.name).toBe('Eve');
    act(() => { laptop.offer.answer(false); }); // "No — they are out"
    write(laptop);
    league.sync(laptop.t.state, 'G', 'spring');
    expect(phone.offer.player).toBeNull();
    expect(phone.roster()).toEqual(laptop.roster());

    // A bust-out the laptop takes a rebuy for: the phone must see him BACK IN
    // (the read-only screen used to keep him busted all night — Oct M14).
    act(() => { laptop.t.eliminatePlayer(laptop.id('Dan'), laptop.id('Bob')); });
    act(() => { laptop.offer.answer(true); });
    write(laptop);
    league.sync(laptop.t.state, 'G', 'spring');
    expect(phone.roster()).toContain('Dan:in+1');
    expect(phone.roster()).toEqual(laptop.roster());

    // The phone takes control.
    takeControl(phone);
    expect(phone.readOnly).toBe(false);
    expect(laptop.readOnly).toBe(true);
    // ...and is NOT asked about Eve, which the laptop already answered.
    expect(phone.offer.player).toBeNull();
    expect(phone.offer.failsafeFor).toBeNull();

    // The laptop, standing down, cannot change the game: its write is refused
    // and its local change is replaced by the document on the next snapshot.
    act(() => { laptop.t.eliminatePlayer(laptop.id('Bob'), laptop.id('Cat')); });
    expect(write(laptop)).toBe('skipped');
    emit();
    expect(laptop.roster()).toContain('Bob:in');

    // The phone runs the rest of the night. Its recorder starts with no memory.
    league.forgetTab();
    act(() => { phone.t.eliminatePlayer(phone.id('Cat'), phone.id('Amy')); });
    expect(phone.offer.player?.name).toBe('Cat'); // it witnessed this one
    expect(laptop.offer.player).toBeNull();
    act(() => { phone.offer.answer(false); });
    write(phone); league.sync(phone.t.state, 'G', 'spring');
    for (const [out, by] of [['Dan', 'Amy'], ['Bob', 'Amy']] as const) {
      act(() => { phone.t.eliminatePlayer(phone.id(out), phone.id(by)); });
      if (phone.offer.player) act(() => { phone.offer.answer(false); });
      write(phone); league.sync(phone.t.state, 'G', 'spring');
    }

    // Both screens agree on the finished game; the league has it once.
    expect(laptop.roster()).toEqual(phone.roster());
    expect(phone.roster().filter(r => r.includes('out1'))).toEqual(['Amy:out1']);
    const rows = league.results.filter(r => r.tournamentId === 'G');
    expect(rows).toHaveLength(5);
    expect(rows.map(r => r.position).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(rows.find(r => league.playerDocs.find(p => p.id === r.leaguePlayerId)!.name === 'Dan')!.rebuys).toBe(1);

    laptop.h.unmount(); phone.h.unmount();
  });

  // The reported bug: the phone WATCHED a bust-out arrive, the laptop's dialog
  // was still open, the phone took control — and the same dialog popped up on
  // the phone. Taking control never pops a dialog; the failsafe is the way back.
  it('taking control mid-question shows no dialog, only the failsafe', async () => {
    seedGame(['Amy', 'Bob', 'Cat', 'Dan']);
    const laptop = await openConsole('laptop');
    const phone = await openConsole('phone');
    act(() => { laptop.t.eliminatePlayer(laptop.id('Dan'), laptop.id('Amy')); });
    expect(laptop.offer.player?.name).toBe('Dan'); // the question is up on the laptop...
    write(laptop);                                  // ...unanswered, as the phone takes over
    takeControl(phone);
    expect(phone.offer.player).toBeNull();
    expect(phone.offer.failsafeFor).toBe(phone.id('Dan'));
    laptop.h.unmount(); phone.h.unmount();
  });

  it('a phone opened after the laptop died still offers the failsafe for a bust-out nobody answered', async () => {
    seedGame(['Amy', 'Bob', 'Cat']);
    const laptop = await openConsole('laptop');
    act(() => { laptop.t.eliminatePlayer(laptop.id('Cat'), laptop.id('Amy')); });
    write(laptop); // written — then the laptop dies holding the question
    laptop.h.unmount();

    const phone = await openConsole('phone');
    expect(phone.readOnly).toBe(true); // the dead laptop still holds it
    takeControl(phone);
    expect(phone.offer.player).toBeNull();               // no dialog on takeover
    expect(phone.offer.failsafeFor).toBe(phone.id('Cat')); // but the way back is there
    phone.h.unmount();
  });
});
