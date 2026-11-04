import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Go Live at a venue whose Wi-Fi blocks Google's sign-in servers failed with
 * `auth/network-request-failed`, because creation FORCED a fresh token on every
 * press. The token the device already holds is valid for an hour and just as
 * accepted, so creation asks for it without forcing — a refresh happens only
 * when it has actually expired.
 */
const h = vi.hoisted(() => ({ getIdToken: vi.fn(async () => 'tok') }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { getIdToken: h.getIdToken } }) }));

import { createTournamentDocument } from './tournamentDocument';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('createTournamentDocument', () => {
  it('uses the token the device holds rather than forcing a refresh', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 409, ok: false, json: async () => ({}) })) as any;
    const state = {
      currentLevel: 0, secondsLeft: 900, isRunning: false, players: [], levels: [],
      details: { localGameId: 'g1' }, prizeStructure: { buyIn: 10, manualPayouts: [] }, settings: {},
    } as any;
    await expect(createTournamentDocument(state, 'u1', true)).resolves.toBe('g1');
    expect(h.getIdToken).toHaveBeenCalledTimes(1);
    expect(h.getIdToken.mock.calls[0]).not.toContain(true);
  });
});
