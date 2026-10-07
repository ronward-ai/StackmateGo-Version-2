import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The local mirror across the two routes, driven through the REAL useTournament
 * (October audit, C1).
 *
 * A device that RESUMED a live game — the director route, every handover, every
 * second device — filed that game's mirror under the device's own local id. The
 * home route then restored it as a brand-new local game with the live game's
 * roster, and the auto-save saved that as a second document and pinned it.
 *
 * Driven through the hook rather than only the lib, because the fault was in
 * which id the hook asked for, and a lib test cannot see that.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));

const LIVE_GAME = {
  ownerId: 'u1', name: 'Tournament', currentLevel: 3, secondsLeft: 500, isRunning: false,
  blindLevels: [{ small: 1, big: 2, duration: 900 }],
  settings: { isSeasonTournament: true, leagueId: 'L1', seasonId: 'S1' },
  prizeStructure: { buyIn: 10, manualPayouts: [] },
  players: [
    { id: 'a', name: 'Amy', isActive: false, position: 3 },
    { id: 'b', name: 'Bob', isActive: true },
    { id: 'c', name: 'Cat', isActive: true },
  ],
};

vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => true, data: () => LIVE_GAME }),
  onSnapshot: () => () => {},
}));

import { useTournament } from '@/hooks/useTournament';

const MIRROR = 'tournamentLocalProgress::u1';
const LOCAL_ID = 'tournamentLocalGameId::u1';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

describe('a resumed live game, then the home route', () => {
  it('files the mirror under the GAME, never mints a local id, and home does not resurrect it', async () => {
    // Opened by its document, on a device that never created it.
    const director = renderHook(() => useTournament('G'));
    await waitFor(() => expect(director.result.current.state.players.length).toBe(3));

    const mirror = JSON.parse(localStorage.getItem(MIRROR)!);
    expect(mirror.localGameId).toBe('G');
    expect(mirror.dbTournamentId).toBe('G');
    // Opening a database game must not mint — and so store — a local id.
    expect(localStorage.getItem(LOCAL_ID)).toBeNull();
    director.unmount();

    // Later, the same device lands on "/".
    const home = renderHook(() => useTournament(undefined));
    const s = home.result.current.state;
    expect(s.details?.type).not.toBe('database');
    expect(s.players).toHaveLength(0);
    expect(s.details?.localGameId).not.toBe('G');

    // And the empty new game did not throw the live game's copy away.
    expect(JSON.parse(localStorage.getItem(MIRROR)!).players).toHaveLength(3);
  });

  // The shape the old build left on every such device: a live game's roster
  // under the device's own local id. It must not come back as a new game.
  it('refuses a mirror an older build filed under the device\'s own id', () => {
    localStorage.setItem(LOCAL_ID, 'game_device');
    localStorage.setItem(MIRROR, JSON.stringify({
      localGameId: 'game_device', dbTournamentId: 'G',
      players: LIVE_GAME.players, currentLevel: 3, secondsLeft: 500, isRunning: false,
    }));
    const home = renderHook(() => useTournament(undefined));
    expect(home.result.current.state.players).toHaveLength(0);
  });

  // The one shape that SHOULD restore: a game created here and saved from the
  // home route, refreshed on /?home=1. Its local id IS its document id.
  it('still restores a game this device saved from home', () => {
    localStorage.setItem(LOCAL_ID, 'G');
    localStorage.setItem(MIRROR, JSON.stringify({
      localGameId: 'G', dbTournamentId: 'G',
      players: LIVE_GAME.players, currentLevel: 3, secondsLeft: 500, isRunning: false,
    }));
    const home = renderHook(() => useTournament(undefined));
    expect(home.result.current.state.players).toHaveLength(3);
    expect(home.result.current.state.details?.localGameId).toBe('G');
  });
});
