import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAccountChangeIsALogout } from './useAccountChangeIsALogout';

/** October audit, M4. Driven across real re-renders, the way auth resolves. */
function drive(steps: Array<{ userId: string | null; isLoading: boolean }>) {
  const leave = vi.fn();
  const { rerender } = renderHook(
    ({ userId, isLoading }) => useAccountChangeIsALogout(userId, isLoading, leave),
    { initialProps: steps[0] },
  );
  for (const step of steps.slice(1)) rerender(step);
  return leave;
}

describe('useAccountChangeIsALogout', () => {
  it('leaves when the confirmed account signs out underneath this tab', () => {
    const leave = drive([
      { userId: null, isLoading: true },
      { userId: 'alice', isLoading: false },
      { userId: null, isLoading: false },
    ]);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('leaves when a different account replaces it', () => {
    const leave = drive([
      { userId: 'alice', isLoading: false },
      { userId: 'bob', isLoading: false },
    ]);
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a cold load resolving an account — that is not a change', () => {
    const leave = drive([
      { userId: null, isLoading: true },
      { userId: null, isLoading: false },
      { userId: 'alice', isLoading: false },
    ]);
    expect(leave).not.toHaveBeenCalled();
  });

  // The loop that must never happen: an expired session reloads, resolves no
  // user, and must not reload again.
  it('does nothing when no account was ever confirmed', () => {
    const leave = drive([
      { userId: null, isLoading: true },
      { userId: null, isLoading: false },
      { userId: null, isLoading: false },
    ]);
    expect(leave).not.toHaveBeenCalled();
  });

  it('does nothing while the same account re-renders, every second, all night', () => {
    const steps = Array.from({ length: 30 }, () => ({ userId: 'alice', isLoading: false }));
    expect(drive(steps)).not.toHaveBeenCalled();
  });

  it('ignores the loading flicker of the same account', () => {
    const leave = drive([
      { userId: 'alice', isLoading: false },
      { userId: null, isLoading: true },
      { userId: 'alice', isLoading: false },
    ]);
    expect(leave).not.toHaveBeenCalled();
  });
});
