import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, projectId: 'p', databaseId: 'd' }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isAnonymous: false, isLoading: false, isAuthenticated: true }),
}));
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: async () => ({ exists: () => false }), onSnapshot: () => () => {} }));

import { useTournament } from '@/hooks/useTournament';

/** October audit, Low: editing the structure mid-game moved the game. */
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('lastSignedInUid', 'u1');
});

function onLevelThree() {
  const h = renderHook(() => useTournament(undefined));
  act(() => {
    h.result.current.setBlindLevels([
      { small: 1, big: 2, duration: 600 },
      { small: 2, big: 4, duration: 600 },
      { small: 3, big: 6, duration: 600 },
      { small: 5, big: 10, duration: 600 },
    ] as any);
  });
  act(() => { h.result.current.skipToNextLevel(); });
  act(() => { h.result.current.skipToNextLevel(); });
  const playing = () => h.result.current.state.levels[h.result.current.state.currentLevel];
  expect(playing().big).toBe(6);
  return { h, playing };
}

describe('editing levels mid-game', () => {
  it('a break added before the current level leaves the same blinds in play', () => {
    const g = onLevelThree();
    act(() => { g.h.result.current.addBreak(10, 0); });
    expect(g.playing().big).toBe(6);
  });

  it('a break added after it changes nothing about the clock', () => {
    const g = onLevelThree();
    act(() => { g.h.result.current.addBreak(10, 2); });
    expect(g.playing().big).toBe(6);
  });

  it('removing an EARLIER level keeps a paused clock where it was', () => {
    vi.useFakeTimers();
    const g = onLevelThree();
    act(() => { g.h.result.current.startTimer(); });
    act(() => { vi.advanceTimersByTime(5000); });
    act(() => { g.h.result.current.pauseTimer(); });
    vi.useRealTimers();
    const before = g.h.result.current.state.secondsLeft;
    expect(before).toBeLessThan(600);
    act(() => { g.h.result.current.removeLevel(0); });
    expect(g.playing().big).toBe(6);
    expect(g.h.result.current.state.secondsLeft).toBe(before);
  });
});
