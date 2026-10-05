import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * While a director's leagues load, useLeague hands out a placeholder league id.
 * useSeasons used to take it for a real league: it listened for that league's
 * seasons, found none, and tried to CREATE `seasons/pending-season-1` on every
 * load. The rules refused it, so nothing landed — but it was a failing write
 * each time. Firestore is mocked; this tests what the hook asks of it.
 */
const h = vi.hoisted(() => ({
  setDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn(),
  where: vi.fn((field: string, _op: string, value: unknown) => ({ field, value })),
}));

vi.mock('@/lib/firebase', () => ({ db: {}, collections: { seasons: { path: 'seasons' } } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), getDocs: vi.fn(), addDoc: vi.fn(), updateDoc: vi.fn(() => Promise.resolve()), deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` })),
  query: vi.fn((_c: unknown, ...clauses: unknown[]) => ({ clauses })),
  where: h.where, setDoc: h.setDoc, onSnapshot: h.onSnapshot,
}));
vi.mock('./useLeagueSettings', () => ({ useLeagueSettings: () => ({ settings: null }) }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { useSeasons } from './useSeasons';

/** Every query or document the hook listened to, answered with nothing. */
const listened = () => h.onSnapshot.mock.calls.map(([ref]: any[]) => ref.path ?? JSON.stringify(ref.clauses));

beforeEach(() => {
  h.setDoc.mockClear();
  h.where.mockClear();
  h.onSnapshot.mockReset().mockImplementation((ref: any, next: (s: any) => void) => {
    // A query answers with no documents; a document answers "does not exist".
    next(ref.clauses ? { docs: [] } : { exists: () => false, data: () => undefined });
    return () => {};
  });
});

describe('useSeasons', () => {
  /** THE MUTANT: drop the guard and the placeholder is a league again. */
  it('neither reads nor writes anything for the loading placeholder', () => {
    renderHook(() => useSeasons({ leagueId: 'pending' }));
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(listened()).toEqual([]);
  });

  // The guard must not be broader than the placeholder: a real league with no
  // seasons still gets its first one, as it always has.
  it('still creates the first season for a real league that has none', () => {
    renderHook(() => useSeasons({ leagueId: 'L1' }));
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect((h.setDoc.mock.calls[0] as any[])[0]).toEqual({ path: 'seasons/L1-season-1' });
  });
});
