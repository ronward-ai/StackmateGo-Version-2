import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  GoogleAuthProvider: class {},
  signInWithPopup: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(), sendPasswordResetEmail: vi.fn(),
  signInAnonymously: vi.fn(), signOut: vi.fn(),
}));

import { useAuth } from './useAuth';

/**
 * October audit, Low: the participant view lists `signInAnonymously` in an
 * effect's deps, so a fresh function per render re-ran that effect every
 * render and could mint a second anonymous identity.
 */
describe('useAuth actions are stable across renders', () => {
  it('returns the same function each render', () => {
    const h = renderHook(() => useAuth());
    const first = h.result.current;
    h.rerender();
    const second = h.result.current;
    for (const k of ['login', 'loginWithEmail', 'registerWithEmail', 'resetPassword', 'signInAnonymously', 'logout'] as const) {
      expect(second[k], k).toBe(first[k]);
    }
  });
});
