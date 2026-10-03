import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Firestore and auth are mocked: this tests the WIRING — when the hook reads,
// when it writes, and above all when it does NOT write. Which copy wins is
// `lib/recentPlayers.ts`'s decision and its own tests cover it.
const h = vi.hoisted(() => ({
  setDoc: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` })),
  emit: null as null | ((snap: any) => void),
  authUser: { id: 'alice' } as { id: string } | null,
  isAnonymous: false,
  isLoading: false,
}));

vi.mock('firebase/firestore', () => ({
  setDoc: h.setDoc,
  onSnapshot: h.onSnapshot,
  doc: h.doc,
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: h.authUser, isAnonymous: h.isAnonymous, isLoading: h.isLoading }),
}));

import { useRecentPlayers } from './useRecentPlayers';

const names = (list: { name: string }[]) => list.map(p => p.name);
const entries = (...n: string[]) => n.map((name, i) => ({ name, lastUsed: 1000 - i }));
const snap = (recentPlayers?: unknown) => ({
  exists: () => true,
  data: () => (recentPlayers === undefined ? { lastSeenAt: 1 } : { recentPlayers }),
});
const cached = (uid = 'alice') => JSON.parse(localStorage.getItem(`recentPlayers::${uid}`) || 'null');

beforeEach(() => {
  localStorage.clear();
  h.setDoc.mockReset().mockResolvedValue(undefined);
  h.onSnapshot.mockReset().mockImplementation((_ref: unknown, next: (s: any) => void) => {
    h.emit = next;
    return () => { h.emit = null; };
  });
  h.authUser = { id: 'alice' };
  h.isAnonymous = false;
  h.isLoading = false;
});

describe('useRecentPlayers, signed in', () => {
  it('listens to this account document, once', () => {
    renderHook(() => useRecentPlayers());
    expect(h.onSnapshot).toHaveBeenCalledTimes(1);
    expect(h.onSnapshot.mock.calls[0][0]).toEqual({ path: 'userSettings/alice' });
  });

  // THE POINT: a name added on another device arrives here without a reload.
  it('takes the account list from each snapshot, and caches it', () => {
    const { result } = renderHook(() => useRecentPlayers());

    act(() => h.emit!(snap(entries('Amy', 'Dan'))));
    expect(names(result.current.recentPlayers)).toEqual(['Amy', 'Dan']);

    act(() => h.emit!(snap(entries('Cass', 'Amy', 'Dan'))));
    expect(names(result.current.recentPlayers)).toEqual(['Cass', 'Amy', 'Dan']);
    expect(names(cached())).toEqual(['Cass', 'Amy', 'Dan']);
  });

  /**
   * THE MUTANT that matters most: a write driven by the list changing. Every
   * snapshot would then write, its own echo included — the shape that once had a
   * live game writing to Firestore twice a second. Snapshots read; only actions
   * write.
   */
  it('never writes because a snapshot arrived', async () => {
    renderHook(() => useRecentPlayers());
    act(() => h.emit!(snap(entries('Amy'))));
    act(() => h.emit!(snap(entries('Amy', 'Dan'))));
    act(() => h.emit!(snap(entries('Amy', 'Dan'))));
    await Promise.resolve();
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  /**
   * THE MUTANT: union the two. "Old Name" was removed on another device; an
   * older device signing in must not bring it back, or × only ever works on the
   * device it was pressed on.
   */
  it('lets the account list replace this device list rather than merge with it', () => {
    localStorage.setItem('recentPlayers::alice', JSON.stringify(entries('Old Name', 'Amy')));
    const { result } = renderHook(() => useRecentPlayers());

    act(() => h.emit!(snap(entries('Amy'))));

    expect(names(result.current.recentPlayers)).toEqual(['Amy']);
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  // First sign-in after this shipped: the account has nothing yet, this device
  // has months of names. They are adopted, not lost — and pushed up ONCE.
  it('adopts this device list when the account has none, pushing it up once', () => {
    localStorage.setItem('recentPlayers::alice', JSON.stringify(entries('Amy', 'Dan')));
    const { result } = renderHook(() => useRecentPlayers());

    act(() => h.emit!(snap(undefined)));
    expect(names(result.current.recentPlayers)).toEqual(['Amy', 'Dan']);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(h.setDoc.mock.calls[0][0]).toEqual({ path: 'userSettings/alice' });
    expect(names(h.setDoc.mock.calls[0][1].recentPlayers)).toEqual(['Amy', 'Dan']);
    expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });

    // The preflight writes lastSeenAt to this same document, so a snapshot that
    // still carries no list is ordinary. It must not push again.
    act(() => h.emit!(snap(undefined)));
    expect(h.setDoc).toHaveBeenCalledTimes(1);
  });

  it('adds a name: one write, merged, newest first', () => {
    const { result } = renderHook(() => useRecentPlayers());
    act(() => h.emit!(snap(entries('Amy'))));

    act(() => result.current.add('Dan'));

    expect(names(result.current.recentPlayers)).toEqual(['Dan', 'Amy']);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(names(h.setDoc.mock.calls[0][1].recentPlayers)).toEqual(['Dan', 'Amy']);
    expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });
    expect(names(cached())).toEqual(['Dan', 'Amy']);
  });

  // THE ORIGINAL REQUEST, now across devices: × removes the name from the
  // account, so the next snapshot everywhere drops it.
  it('removes a name from the account', () => {
    const { result } = renderHook(() => useRecentPlayers());
    act(() => h.emit!(snap(entries('Amy', 'Jonh Smith', 'Dan'))));

    act(() => result.current.remove('Jonh Smith'));

    expect(names(result.current.recentPlayers)).toEqual(['Amy', 'Dan']);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(names(h.setDoc.mock.calls[0][1].recentPlayers)).toEqual(['Amy', 'Dan']);
  });

  // A failed cloud write keeps the local list rather than throwing into a
  // click handler.
  it('keeps the local list when the cloud write fails', async () => {
    h.setDoc.mockRejectedValue(new Error('offline'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useRecentPlayers());
    act(() => h.emit!(snap(entries('Amy'))));

    act(() => result.current.add('Dan'));
    await Promise.resolve();

    expect(names(result.current.recentPlayers)).toEqual(['Dan', 'Amy']);
    expect(names(cached())).toEqual(['Dan', 'Amy']);
    warn.mockRestore();
  });

  it('ignores junk in the stored field rather than rendering it', () => {
    const { result } = renderHook(() => useRecentPlayers());
    act(() => h.emit!(snap([{ name: 'Amy', lastUsed: 1 }, { name: 7 }, null])));
    expect(names(result.current.recentPlayers)).toEqual(['Amy']);
  });
});

describe('useRecentPlayers, not signed in for real', () => {
  // `!user || isAnonymous` is the CLAUDE.md test. A QR visitor's anonymous
  // session has no account to follow, and must never reach this document.
  it.each([
    ['signed out', () => { h.authUser = null; }],
    ['anonymous', () => { h.isAnonymous = true; }],
  ])('%s: keeps the list on this device and never touches Firestore', (_label, setup) => {
    setup();
    localStorage.setItem('recentPlayers::local', JSON.stringify(entries('Amy')));
    const { result } = renderHook(() => useRecentPlayers());

    expect(names(result.current.recentPlayers)).toEqual(['Amy']);
    act(() => result.current.add('Dan'));

    expect(names(result.current.recentPlayers)).toEqual(['Dan', 'Amy']);
    expect(names(cached('local'))).toEqual(['Dan', 'Amy']);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  // Auth still resolving is not "signed out": subscribing then would read and
  // push for a uid that may not be the one about to arrive.
  it('waits for auth to settle before listening', () => {
    h.isLoading = true;
    renderHook(() => useRecentPlayers());
    expect(h.onSnapshot).not.toHaveBeenCalled();
  });
});
