import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * October audit, M11, through the REAL useTournament and its one-second tick:
 * a clock that was not ticking while a level ended must catch up from the end
 * time, not restart the next level from whenever it woke.
 */

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));
vi.mock('@/lib/chimes', () => ({ playLevelComplete: () => {}, playThirtySecondWarning: () => {} }));

import { useTournament } from '@/hooks/useTournament';

const LEVELS = [
  { level: 1, small: 25, big: 50, ante: 0, duration: 600 },
  { level: 2, small: 50, big: 100, ante: 0, duration: 600 },
  { level: 3, small: 100, big: 200, ante: 0, duration: 600 },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-07T20:00:00Z'));
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
  localStorage.setItem('tournamentBlindLevels::u1', JSON.stringify(LEVELS));
});
afterEach(() => { vi.useRealTimers(); });

describe('a clock that slept through the end of a level', () => {
  it('resumes the next level part-way through, on schedule', () => {
    const h = renderHook(() => useTournament(undefined));
    act(() => { h.result.current.startTimer(); });

    // The page is suspended: no ticks, while 13 minutes pass (level 1 is ten).
    vi.setSystemTime(new Date('2026-10-07T20:13:00Z'));
    act(() => { vi.advanceTimersByTime(1000); });

    const s = h.result.current.state;
    expect(s.currentLevel).toBe(1);
    // Level 2 started at 20:10, so at 20:13:01 it has 6:59 left — not 10:00.
    expect(s.secondsLeft).toBe(419);
  });

  it('passes through a whole level that elapsed while away', () => {
    const h = renderHook(() => useTournament(undefined));
    act(() => { h.result.current.startTimer(); });
    vi.setSystemTime(new Date('2026-10-07T20:25:00Z'));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(h.result.current.state.currentLevel).toBe(2);
  });
});
