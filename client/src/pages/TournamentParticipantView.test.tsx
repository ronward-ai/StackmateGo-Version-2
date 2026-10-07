import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

/**
 * A smoke test for the screen most people at a game look at (October audit,
 * coverage — 751 lines and no test). Driven from a mocked snapshot: the REST
 * read fails over to the listener, as it does when the network refuses it.
 */
let snapshot: any = null;
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _c: string, id: string) => id,
  onSnapshot: (_ref: unknown, next: (s: any) => void) => {
    queueMicrotask(() => next({ exists: () => !!snapshot, data: () => snapshot }));
    return () => {};
  },
  getDoc: async (id: string) => ({ exists: () => id === 'L1', data: () => ({ name: 'Fish & Chips League' }) }),
}));
const auth = { user: null, isAuthenticated: true, isAnonymous: true, isLoading: false, signInAnonymously: async () => {}, logout: async () => {} };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
const scoring = { calculatePoints: () => 0 };
vi.mock('@/hooks/useLeagueSettings', () => ({ useLeagueSettings: () => scoring }));
vi.mock('@/components/RealTimeLeagueTable', () => ({ default: () => null }));
vi.mock('@/hooks/useWakeLock', () => ({ useWakeLock: () => {} }));

import TournamentParticipantView from './TournamentParticipantView';

function open() {
  const { hook } = memoryLocation({ path: '/tournament/G' });
  return render(
    <Router hook={hook}>
      <Route path="/tournament/:tournamentId" component={TournamentParticipantView} />
    </Router>,
  );
}

const game = (over: Record<string, unknown> = {}) => ({
  ownerId: 'owner', currentLevel: 0, secondsLeft: 600, isRunning: false,
  blindLevels: [{ small: 25, big: 50, duration: 600 }, { small: 50, big: 100, duration: 600 }],
  prizeStructure: { buyIn: 10, manualPayouts: [{ position: 1, percentage: 100 }] },
  settings: { currency: '£', branding: { eventName: 'Friday Night' } },
  players: [{ id: 'a', name: 'Amy', isActive: true }, { id: 'b', name: 'Bob', isActive: true }],
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  globalThis.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
});

describe('TournamentParticipantView', () => {
  it("shows the game: the event's name, the clock and the players", async () => {
    snapshot = game();
    open();
    await waitFor(() => expect(screen.getAllByText('Amy').length).toBeGreaterThan(0));
    expect(document.title).toContain('Friday Night');
    expect(screen.getAllByText(/10:00/).length).toBeGreaterThan(0);
  });

  it('refuses a game that is not published', async () => {
    snapshot = game({ isPublished: false });
    open();
    await waitFor(() => expect(screen.getByText(/not being shared yet/)).toBeTruthy());
  });

  // M18: no event name in a league game reads the league's CURRENT name.
  it("falls back to the league's name in a league game with no event name", async () => {
    snapshot = game({ settings: { currency: '£', isSeasonTournament: true, leagueId: 'L1' } });
    open();
    await waitFor(() => expect(document.title).toContain('Fish & Chips League'));
  });
});
