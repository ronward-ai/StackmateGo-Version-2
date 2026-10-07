import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

let currentUid: string | null = null;
const queried: string[] = [];
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: currentUid ? { id: currentUid } : null, isAnonymous: false }),
}));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), addDoc: vi.fn(), deleteDoc: vi.fn(),
  serverTimestamp: () => null, orderBy: () => ({}),
  where: (_f: string, _op: string, v: string) => v,
  query: (_c: unknown, uid: string) => uid,
  getDocs: async (uid: string) => {
    queried.push(uid);
    return { forEach: (fn: (d: any) => void) => fn({ id: `t-${uid}`, data: () => ({ name: uid }) }) };
  },
}));

import { useTournamentTemplates } from './useTournamentTemplates';

/** October audit, Low: the list keyed on `auth.currentUser` behind empty deps. */
describe('useTournamentTemplates follows the signed-in account', () => {
  it('loads once the session arrives, and reloads for a different account', async () => {
    currentUid = null;
    const h = renderHook(() => useTournamentTemplates());
    expect(h.result.current.templates).toEqual([]);

    currentUid = 'u1';
    h.rerender();
    await waitFor(() => expect(h.result.current.templates.map(t => t.id)).toEqual(['t-u1']));

    currentUid = 'u2';
    h.rerender();
    await waitFor(() => expect(h.result.current.templates.map(t => t.id)).toEqual(['t-u2']));
    expect(queried).toEqual(['u1', 'u2']);
  });
});
