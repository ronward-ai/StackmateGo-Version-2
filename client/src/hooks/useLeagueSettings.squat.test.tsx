import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * October audit, H1, through the REAL useLeagueSettings, called the way
 * PlayerSection and the participant view call it: a director's CURRENT
 * settings, read by their predictable document id.
 *
 * Anybody could create that document first. With no `settings` field the hook
 * threw on its next render — the director's Players tab and every participant's
 * phone went to the error screen — and with well-formed settings the league
 * was scored by a stranger's scheme. Documents written before the rules were
 * tightened still exist, so the reader must refuse them too.
 */

const scenario: { data: any } = { data: null };

vi.mock('@/lib/firebase', () => ({ db: {}, collections: { leagueSettings: { path: 'leagueSettings' } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'director-uid' }, isAnonymous: false }) }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), getDocs: async () => ({ docs: [] }),
  addDoc: async () => ({ id: 'x' }), deleteDoc: async () => {}, setDoc: async () => {},
  serverTimestamp: () => 'ts', query: () => ({}), where: () => ({}),
  doc: (_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` }),
  onSnapshot: (ref: any, next: (s: any) => void) => {
    if (ref?.path) next({ exists: () => scenario.data !== null, data: () => scenario.data });
    else next({ docs: [] });
    return () => {};
  },
}));

import { useLeagueSettings } from '@/hooks/useLeagueSettings';

const SETTINGS = (customFormula: string) => ({
  pointsSystem: { type: 'custom', formula: { type: 'custom', customFormula } },
  statsToTrack: {}, displaySettings: {},
});

// Each test uses its own league id: lib/sharedSnapshot.ts keeps a listener
// alive for a grace period, so a reused key would replay the previous document.
beforeEach(() => { localStorage.clear(); });

describe('a squatted current-settings document', () => {
  it('with no settings in it, does not take the console down', () => {
    scenario.data = { userId: 'stranger-uid', leagueId: null };
    const { result } = renderHook(() => useLeagueSettings('director-uid', null));
    expect(result.current.settings.pointsSystem).toBeDefined();
  });

  it("with a stranger's scheme in it, does not score the league with it", () => {
    scenario.data = { userId: 'stranger-uid', leagueId: 'L', settings: SETTINGS('1000') };
    const { result } = renderHook(() => useLeagueSettings('director-uid', 'L'));
    expect(result.current.calculatePoints(5, 10)).not.toBe(1000);
  });

  it("still adopts the director's own document", () => {
    scenario.data = { userId: 'director-uid', leagueId: 'L2', settings: SETTINGS('777') };
    const { result } = renderHook(() => useLeagueSettings('director-uid', 'L2'));
    expect(result.current.calculatePoints(5, 10)).toBe(777);
  });

  it("does not cache another director's settings on this device", () => {
    scenario.data = { userId: 'director-uid', leagueId: 'L3', settings: SETTINGS('777') };
    renderHook(() => useLeagueSettings('director-uid', 'L3'));
    expect(Object.keys(localStorage).filter(k => k.startsWith('leagueSettings'))).toEqual([]);
  });
});
