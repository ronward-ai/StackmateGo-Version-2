import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerEntryActions from './PlayerEntryActions';

/**
 * The component had no test. What this pins is the rule that a FINISHED game
 * takes no new entries, at the one implementation of re-entering someone — the
 * runner-up re-entered after the final hand would move the winner from 1st to
 * 2nd. The actions in useTournament refuse it as well; this is the screen not
 * offering what the action would refuse.
 */
const structure: any = { buyIn: 10, allowReEntry: true, allowRebuys: true, rebuyAmount: 10 };
const runnerUp: any = { id: 'dave', name: 'Dave', isActive: false, position: 2, reEntries: 0, rebuys: 0 };
const winner: any = { id: 'amy', name: 'Amy', isActive: false, position: 1, reEntries: 0, rebuys: 0 };

const renderFor = (player: any, gameOver?: boolean) => render(
  <PlayerEntryActions
    player={player}
    failsafeFor={player.id}
    prizeStructure={structure}
    currentLevel={0}
    onRebuy={vi.fn()}
    onReEntry={vi.fn()}
    gameOver={gameOver}
  />,
);

describe('PlayerEntryActions', () => {
  it('offers a busted player a way back while the game is being played', () => {
    renderFor(runnerUp);
    expect(screen.getByText('Re-entry')).toBeTruthy();
    expect(screen.getByText('Rebuy')).toBeTruthy();
  });

  /**
   * THE MUTANT: ignore `gameOver`. Re-entering the runner-up after the final
   * hand runs positionsAfterReEntry and leaves nobody holding 1st. And it is
   * ABSENT, not disabled — a fact about the whole game, said once where Add
   * Player used to be, not a greyed button against every name.
   */
  it('offers nothing at all once the game is over', () => {
    const { container } = renderFor(runnerUp, true);
    expect(screen.queryByText('Re-entry')).toBeNull();
    expect(screen.queryByText('Rebuy')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  // The winner was already refused, game over or not.
  it('offers the winner nothing either way', () => {
    renderFor(winner, false);
    expect(screen.queryByText('Re-entry')).toBeNull();
    renderFor(winner, true);
    expect(screen.queryByText('Re-entry')).toBeNull();
  });
});
