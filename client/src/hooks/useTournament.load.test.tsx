import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The initial read of a game (October audit, correctness debt): it filled a
 * missing league or season from THIS DEVICE's settings, and dropped
 * isPublished.
 */
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
let stored: any = {};
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => true, data: () => stored }),
  onSnapshot: () => () => {},
}));

import { useTournament } from '@/hooks/useTournament';

const base = {
  ownerId: 'u1', currentLevel: 0, secondsLeft: 600, isRunning: false,
  blindLevels: [{ small: 1, big: 2, duration: 600 }],
  prizeStructure: { buyIn: 10, manualPayouts: [] },
  players: [{ id: 'a', name: 'Amy', isActive: true }],
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
  // This device last ran a game in ITS league and season.
  localStorage.setItem('tournamentSettings::u1', JSON.stringify({
    isSeasonTournament: true, leagueId: 'DEVICE_LEAGUE', seasonId: 'DEVICE_SEASON',
  }));
});

describe('loading a game', () => {
  it('takes no league or season from this device for a standalone game', async () => {
    stored = { ...base, settings: { isSeasonTournament: false } };
    const h = renderHook(() => useTournament('G'));
    await waitFor(() => expect(h.result.current.state.players).toHaveLength(1));
    const s = h.result.current.state.settings;
    expect(s.leagueId).toBeUndefined();
    expect(s.seasonId).toBeUndefined();
    expect(s.isSeasonTournament).toBe(false);
  });

  it("keeps the game's own league", async () => {
    stored = { ...base, settings: { leagueId: 'GAME_LEAGUE', seasonId: 'GAME_SEASON' } };
    const h = renderHook(() => useTournament('G'));
    await waitFor(() => expect(h.result.current.state.players).toHaveLength(1));
    expect(h.result.current.state.settings.leagueId).toBe('GAME_LEAGUE');
    expect(h.result.current.state.settings.isSeasonTournament).toBe(true);
  });

  it('carries isPublished, so an unpublished game shows no QR', async () => {
    stored = { ...base, isPublished: false, settings: {} };
    const h = renderHook(() => useTournament('G'));
    await waitFor(() => expect(h.result.current.state.players).toHaveLength(1));
    expect((h.result.current.state.details as any).isPublished).toBe(false);
  });
});

describe('storage is read once, not on every render (Oct correctness debt)', () => {
  it('does not re-read the setup when the console re-renders', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    const h = renderHook(() => useTournament(undefined));
    const setupReads = () => spy.mock.calls.filter(([k]) =>
      /^(tournamentSettings|blindLevels|prizeStructure|tournamentLocalProgress)::/.test(String(k))).length;
    const after = setupReads();
    for (let i = 0; i < 5; i++) h.rerender();
    expect(setupReads()).toBe(after);
    spy.mockRestore();
  });
});
