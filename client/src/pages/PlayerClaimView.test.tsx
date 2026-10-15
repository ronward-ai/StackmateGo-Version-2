import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router, Route } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

/**
 * Reported from a live night: scanning the QR after the game had finished said
 * "Your director has not added the roster". At the end of a game NOBODY is
 * active — the winner neither — so the check-in list, which shows only players
 * still in, was empty. A finished game says so and points at the results.
 */
let snapshot: any = null;
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _c: string, id: string) => id,
  onSnapshot: (_ref: unknown, next: (s: any) => void) => {
    queueMicrotask(() => next({ exists: () => !!snapshot, data: () => snapshot }));
    return () => {};
  },
}));
vi.mock('@/hooks/useLeagueName', () => ({ useLeagueName: () => '' }));

import PlayerClaimView from './PlayerClaimView';

function open() {
  const { hook } = memoryLocation({ path: '/tournament/G/join' });
  return render(
    <Router hook={hook}>
      <Route path="/tournament/:tournamentId/join" component={PlayerClaimView} />
    </Router>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // The REST read answers with an empty document; the listener carries the roster.
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ fields: {} }) })) as any;
});

describe('PlayerClaimView', () => {
  it('a finished game says so, names the winner and offers the results', async () => {
    snapshot = {
      settings: { branding: { eventName: 'Friday Night' } },
      players: [
        { id: 'a', name: 'Amy', isActive: false, position: 1 },
        { id: 'b', name: 'Bob', isActive: false, position: 2 },
      ],
    };
    open();
    await waitFor(() => expect(screen.getByText('This game has finished')).toBeTruthy());
    expect(screen.getByText('Won by', { exact: false }).textContent).toBe('Won by Amy');
    expect(screen.getByRole('button', { name: /View results/ })).toBeTruthy();
    expect(screen.queryByText('Nobody registered yet')).toBeNull();
    // The page says which build is running, so "nothing changed" can be checked from a phone.
    expect(screen.getByTestId('build-tag').textContent).toMatch(/^build /);
  });

  it('a game with no roster yet still says so', async () => {
    snapshot = { players: [] };
    open();
    await waitFor(() => expect(screen.getByText('Nobody registered yet')).toBeTruthy());
    expect(screen.queryByText('This game has finished')).toBeNull();
  });

  const league = { isSeasonTournament: true, leagueId: 'L1', seasonName: 'Spring 2026', gameNumber: 2, numberOfGames: 13 };

  it('a league game names the season and the game, and says register before check-in', async () => {
    snapshot = {
      settings: league,
      players: [{ id: 'a', name: 'Amy', isActive: true }, { id: 'b', name: 'Bob', isActive: true }],
    };
    open();
    await waitFor(() => expect(screen.getByText('Amy')).toBeTruthy());
    expect(screen.getByTestId('season-line').textContent).toBe('Spring 2026 · Game 2 of 13');
    expect(screen.getByText(/Registered with the tournament director\? Tap your name below to check in/)).toBeTruthy();
    expect(screen.getByText(/Register with the tournament director first/)).toBeTruthy();
  });

  it('a finished league game names the season on the finished card', async () => {
    snapshot = {
      settings: league,
      players: [
        { id: 'a', name: 'Amy', isActive: false, position: 1 },
        { id: 'b', name: 'Bob', isActive: false, position: 2 },
      ],
    };
    open();
    await waitFor(() => expect(screen.getByText('This game has finished')).toBeTruthy());
    expect(screen.getByTestId('season-line').textContent).toBe('Spring 2026 · Game 2 of 13');
  });

  /**
   * The reported document. A league night whose settings never carried the flag
   * was saved with a top-level `isSeasonTournament: false`, so the season line
   * never showed — on the finished card the director scanned after the game.
   */
  it('names the season on a league game saved with a top-level false flag', async () => {
    snapshot = {
      isSeasonTournament: false,
      settings: { leagueId: 'L1', seasonName: 'Spring 2026', gameNumber: 2, numberOfGames: 13 },
      players: [
        { id: 'a', name: 'Amy', isActive: false, position: 1 },
        { id: 'b', name: 'Bob', isActive: false, position: 2 },
      ],
    };
    open();
    await waitFor(() => expect(screen.getByText('This game has finished')).toBeTruthy());
    expect(screen.getByTestId('season-line').textContent).toBe('Spring 2026 · Game 2 of 13');
  });

  it('a standalone game shows no season line', async () => {
    snapshot = { settings: { isSeasonTournament: false, gameNumber: 2 }, players: [{ id: 'a', name: 'Amy', isActive: true }] };
    open();
    await waitFor(() => expect(screen.getByText('Amy')).toBeTruthy());
    expect(screen.queryByTestId('season-line')).toBeNull();
  });

  it('a game in progress lists the players still in', async () => {
    snapshot = {
      players: [
        { id: 'a', name: 'Amy', isActive: true },
        { id: 'b', name: 'Bob', isActive: false, position: 2 },
        { id: 'c', name: 'Cat', isActive: true },
      ],
    };
    open();
    await waitFor(() => expect(screen.getByText('Amy')).toBeTruthy());
    expect(screen.queryByText('Bob')).toBeNull();
    expect(screen.queryByText('This game has finished')).toBeNull();
  });
});
