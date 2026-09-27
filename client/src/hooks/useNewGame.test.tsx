import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

/**
 * The guard's DEFERRAL is what these cover, and specifically the continuation.
 *
 * Three of the five call sites do more work immediately after starting a game —
 * switching league, writing the season, forcing standalone. If the guard defers
 * only the reset, those writes land on a game that was never reset: a league and
 * season recorded against the night that is still running. That half-applied
 * state is invisible from a screenshot, which is the whole reason it is tested
 * here rather than driven in a browser.
 */

const setLocation = vi.fn();
vi.mock('wouter', () => ({ useLocation: () => [null, setLocation] }));

let opened: string[] = [];
vi.mock('@/hooks/useOpenLiveGame', () => ({ useOpenLiveGame: () => (id: string) => opened.push(id) }));

import { useNewGame } from './useNewGame';

const GAME = { id: 'g5', settings: { gameNumber: 5, branding: { eventName: 'Fish & Chips' } } } as any;

function Harness({ blockedBy, after }: { blockedBy: any; after?: () => void }) {
  const tournament = { resetTournament } as any;
  const { startNewGame, newGameGuard } = useNewGame(tournament, blockedBy);
  return (
    <div>
      <button onClick={() => startNewGame({ keepStructure: true }, after)}>go</button>
      {newGameGuard}
    </div>
  );
}

const resetTournament = vi.fn();
const clickText = (re: RegExp) => {
  const btn = [...document.querySelectorAll('button')].find(b => re.test(b.textContent || ''));
  if (!btn) throw new Error(`no button matching ${re}`);
  act(() => { (btn as HTMLButtonElement).click(); });
};

beforeEach(() => {
  resetTournament.mockClear();
  setLocation.mockClear();
  opened = [];
  document.body.innerHTML = '';
});

describe('useNewGame without another live game', () => {
  it('starts immediately, and runs the continuation', () => {
    const after = vi.fn();
    render(<Harness blockedBy={null} after={after} />);
    clickText(/^go$/);
    expect(resetTournament).toHaveBeenCalledWith({ keepStructure: true });
    expect(setLocation).toHaveBeenCalledWith('/?home=1');
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('asks nothing', () => {
    render(<Harness blockedBy={null} />);
    clickText(/^go$/);
    expect(screen.queryByText(/already running a game/i)).toBeNull();
  });
});

describe('useNewGame when another device is running a game', () => {
  it('starts NOTHING until the director answers', () => {
    const after = vi.fn();
    render(<Harness blockedBy={GAME} after={after} />);
    clickText(/^go$/);
    expect(resetTournament).not.toHaveBeenCalled();
    expect(setLocation).not.toHaveBeenCalled();
    // The half-applied state this exists to prevent.
    expect(after).not.toHaveBeenCalled();
    expect(screen.getByText(/already running a game/i)).toBeTruthy();
  });

  it('names the other game rather than saying "a game"', () => {
    render(<Harness blockedBy={GAME} />);
    clickText(/^go$/);
    expect(document.body.textContent).toMatch(/Game 5 \(Fish & Chips\)/);
  });

  it('Cancel starts nothing at all', () => {
    const after = vi.fn();
    render(<Harness blockedBy={GAME} after={after} />);
    clickText(/^go$/);
    clickText(/^Cancel$/);
    expect(resetTournament).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  // The point of the whole continuation: proceeding must apply BOTH halves, or
  // the league and season are written against a game that was never reset.
  it('proceeding runs the reset AND the continuation, in that order', () => {
    const order: string[] = [];
    resetTournament.mockImplementation(() => order.push('reset'));
    setLocation.mockImplementation(() => order.push('navigate'));
    render(<Harness blockedBy={GAME} after={() => order.push('after')} />);
    clickText(/^go$/);
    clickText(/Start a new one anyway/);
    expect(order).toEqual(['reset', 'navigate', 'after']);
  });

  it('keeps the caller\'s keepStructure choice across the deferral', () => {
    function KeepFalse() {
      const { startNewGame, newGameGuard } = useNewGame({ resetTournament } as any, GAME);
      return <div><button onClick={() => startNewGame({ keepStructure: false })}>go</button>{newGameGuard}</div>;
    }
    render(<KeepFalse />);
    clickText(/^go$/);
    clickText(/Start a new one anyway/);
    expect(resetTournament).toHaveBeenCalledWith({ keepStructure: false });
  });

  // Warns, never refuses: two genuine tournaments in one evening is normal.
  it('always offers a way through', () => {
    render(<Harness blockedBy={GAME} />);
    clickText(/^go$/);
    expect(screen.getByText(/Start a new one anyway/)).toBeTruthy();
  });

  it('"Open that game" opens it and starts nothing', () => {
    const after = vi.fn();
    render(<Harness blockedBy={GAME} after={after} />);
    clickText(/^go$/);
    clickText(/Open that game/);
    expect(opened).toEqual(['g5']);
    expect(resetTournament).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
});
