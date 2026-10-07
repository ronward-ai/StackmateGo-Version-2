import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * October audit, H3, driven through the REAL useTournament.
 *
 * From the director route, starting the next game navigates to `/?home=1`, a
 * different route, and the console is replaced in the same batch — so the
 * reset's setState never commits and the next console rebuilds itself from
 * storage alone. Whatever the next game is therefore has to be IN storage by
 * the time resetTournament returns. These tests reset, throw the hook away
 * without letting it render again, and mount a fresh one the way the home route
 * does.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
const LIVE_GAME = {
  ownerId: 'u1', name: 'Tournament', currentLevel: 3, secondsLeft: 500, isRunning: false,
  blindLevels: [{ small: 50, big: 100, duration: 1200 }],
  settings: { isSeasonTournament: true, leagueId: 'L1', seasonId: 'autumn', seasonName: 'Autumn' },
  prizeStructure: { buyIn: 20, manualPayouts: [] },
  players: [{ id: 'a', name: 'Amy', isActive: true }, { id: 'b', name: 'Bob', isActive: true }],
};
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => true, data: () => LIVE_GAME }),
  onSnapshot: () => () => {},
}));

import { useTournament } from '@/hooks/useTournament';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

async function openLiveGame() {
  const director = renderHook(() => useTournament('G'));
  await waitFor(() => expect(director.result.current.state.players).toHaveLength(2));
  return director;
}

/** Reset, and leave before React can commit it — the director-route path. */
function resetAndLeave(director: Awaited<ReturnType<typeof openLiveGame>>, options: any) {
  director.result.current.resetTournament(options);
  director.unmount();
}

describe('the next game survives the route change', () => {
  it('comes up in the season it was started in', async () => {
    const director = await openLiveGame();
    resetAndLeave(director, {
      keepStructure: true,
      settings: { isSeasonTournament: true, leagueId: 'L1', seasonId: 'spring', seasonName: 'Spring' },
    });

    const home = renderHook(() => useTournament(undefined)).result.current.state;
    expect(home.settings.seasonId).toBe('spring');
    expect(home.settings.seasonName).toBe('Spring');
    expect(home.details?.type).toBe('season');
    expect(home.players).toHaveLength(0);
  });

  it('comes up standalone when the slider said so, not as a league game', async () => {
    const director = await openLiveGame();
    resetAndLeave(director, {
      keepStructure: true,
      settings: { isSeasonTournament: false, leagueId: undefined, seasonId: undefined },
    });

    const home = renderHook(() => useTournament(undefined)).result.current.state;
    expect(home.settings.isSeasonTournament).toBe(false);
    expect(home.settings.seasonId).toBeUndefined();
    expect(home.details?.type).toBe('standalone');
  });

  it('keeps the structure it was told to keep', async () => {
    const director = await openLiveGame();
    resetAndLeave(director, { keepStructure: true });
    const home = renderHook(() => useTournament(undefined)).result.current.state;
    expect(home.levels[0].big).toBe(100);
  });

  it('a Full reset really does reset, rather than doing nothing', async () => {
    const director = await openLiveGame();
    resetAndLeave(director, { keepStructure: false });
    const home = renderHook(() => useTournament(undefined)).result.current.state;
    expect(home.levels[0].big).not.toBe(100);
    expect(home.prizeStructure.buyIn).toBe(0);
  });
});
