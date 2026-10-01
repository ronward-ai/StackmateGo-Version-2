import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * Driving the hook, because the predicate is trivial and the risk is not.
 *
 * What can go wrong here is not "which game do we release" — it is whether the
 * effect fires at all, and whether it fires too often. An effect inline in
 * `PokerTimer` has neither test by construction, which is the shape that let a
 * guard dialog ship unrendered with every check green.
 */
const released: Array<{ id: unknown; device: string }> = [];
const releaseLiveGameControl = vi.fn(async (id: unknown, device: string) => {
  released.push({ id, device });
  return 'released' as const;
});

vi.mock('@/lib/liveGameWrite', () => ({
  get releaseLiveGameControl() { return releaseLiveGameControl; },
}));

import { useReleaseControlOnLeave } from './useReleaseControlOnLeave';

type Harness = { id: string | null; signedIn?: boolean };

function Probe({ h }: { h: Harness }) {
  useReleaseControlOnLeave(h.id, 'd_me', h.signedIn !== false);
  return null;
}

const drive = (h: Harness) => {
  const r = render(<Probe h={h} />);
  return { to: (next: Harness) => act(() => { r.rerender(<Probe h={next} />); }) };
};

beforeEach(() => {
  released.length = 0;
  releaseLiveGameControl.mockClear();
});

describe('useReleaseControlOnLeave', () => {
  it('hands back the game it moved off, and not the one it moved to', () => {
    const { to } = drive({ id: 'game-a' });
    to({ id: 'game-b' });
    expect(released).toEqual([{ id: 'game-a', device: 'd_me' }]);
  });

  // THE COMMONEST ROUTE HERE. New Tournament makes the game local again, so
  // `consoleTournamentId()` returns null — the console is plainly no longer
  // driving the game it held, and that is a departure like any other.
  it('treats moving to NO game as leaving', () => {
    const { to } = drive({ id: 'game-a' });
    to({ id: null });
    expect(released).toEqual([{ id: 'game-a', device: 'd_me' }]);
  });

  // THE MUTANT THAT COSTS MONEY. This page re-renders once a second, because
  // that is how the clock advances. Releasing on an unchanged id would be a
  // Firestore write a second — the exact shape that once had a live game
  // writing twice a second and plausibly exhausted a day's quota in an evening.
  it('writes nothing when the game has not changed', () => {
    const { to } = drive({ id: 'game-a' });
    to({ id: 'game-a' });
    to({ id: 'game-a' });
    expect(releaseLiveGameControl).not.toHaveBeenCalled();
  });

  // THE CASE THE `previous === current` GUARD IS ACTUALLY FOR, and the one that
  // makes it more than defence. The dep array already stops the effect re-running
  // on an unchanged id — so the only way to arrive with previous === current is
  // for one of the OTHER deps to change, and signing in does exactly that while
  // the console sits on a game. Without the guard that releases the game this
  // device is driving, at the moment it starts driving it.
  it('does not release the game it is still on when the sign-in lands', () => {
    const { to } = drive({ id: 'game-a', signedIn: false });
    to({ id: 'game-a', signedIn: true });
    expect(releaseLiveGameControl).not.toHaveBeenCalled();
  });

  it('leaves nothing behind on the first game a console opens', () => {
    drive({ id: 'game-a' });
    expect(releaseLiveGameControl).not.toHaveBeenCalled();
  });

  it('starts from no game without releasing anything', () => {
    const { to } = drive({ id: null });
    to({ id: 'game-a' });
    expect(releaseLiveGameControl).not.toHaveBeenCalled();
  });

  // The rule on this write is isExistingDocOwner, so signed out it can only fail
  // noisily. Sign-out does its own release, ordered before signOut(auth).
  it('does not try while signed out', () => {
    const { to } = drive({ id: 'game-a', signedIn: false });
    to({ id: 'game-b', signedIn: false });
    expect(releaseLiveGameControl).not.toHaveBeenCalled();
  });

  it('releases each game in turn across several moves', () => {
    const { to } = drive({ id: 'game-a' });
    to({ id: 'game-b' });
    to({ id: 'game-c' });
    expect(released.map(r => r.id)).toEqual(['game-a', 'game-b']);
  });

  // Best effort: a game that cannot be handed back must not get in the way of
  // opening the next one.
  it('survives a failed release', () => {
    releaseLiveGameControl.mockRejectedValueOnce(new Error('offline'));
    const { to } = drive({ id: 'game-a' });
    expect(() => to({ id: 'game-b' })).not.toThrow();
  });
});
