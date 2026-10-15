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
    expect(screen.getByText(/Won by Amy/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /View results/ })).toBeTruthy();
    expect(screen.queryByText(/has not added the roster/)).toBeNull();
  });

  it('a game with no roster yet still says so', async () => {
    snapshot = { players: [] };
    open();
    await waitFor(() => expect(screen.getByText(/has not added the roster/)).toBeTruthy());
    expect(screen.queryByText('This game has finished')).toBeNull();
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
