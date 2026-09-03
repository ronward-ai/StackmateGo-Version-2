/**
 * Finishing positions, and what a re-entry does to them.
 *
 * THE BUG THIS EXISTS TO FIX
 *
 * The next finishing position used to be derived by counting the players who
 * already held one:
 *
 *   const alreadyPositioned = players.filter(p => !p.isActive && p.position).length;
 *   const newPosition = players.length - alreadyPositioned;
 *
 * A re-entry or rebuy clears the returning player's `position` without touching
 * anybody else's, so that count dropped by one and the next elimination was
 * handed a number another player already held. Ten players, three out at
 * 10/9/8, the 10th-place finisher re-enters, and the next bust is assigned 8 —
 * colliding with the player already sitting there. Since the position is what
 * gets recorded as the league result, two players end up credited with the same
 * finish: the same points and the same payout percentage.
 *
 * THE MODEL
 *
 * A re-entry voids the player's earlier finish and vacates the slot below
 * everyone who busted after them. Those players each move one position WORSE.
 * With A 10th, B 9th and C 8th, A re-entering makes B 10th and C 9th, leaving
 * 8 free for the next bust. Positions stay unique, and the final standings
 * reflect the order players were *finally* eliminated in — which is what a
 * re-entry tournament means.
 */

/** The player fields these functions need. Structural, so the app's fuller
 *  Player type satisfies it without this module importing anything. */
export interface PositionedPlayer {
  id: string;
  isActive?: boolean;
  position?: number;
  rebuys?: number;
  reEntries?: number;
  knockouts?: number;
}

/** True when a player has been eliminated and holds a finishing position. */
function isFinished(p: PositionedPlayer): boolean {
  return p.isActive === false && typeof p.position === 'number' && p.position > 0;
}

/**
 * The position to award the player being eliminated right now.
 *
 * Callers pass the roster as it stands BEFORE the elimination is applied, with
 * the busting player still active.
 */
export function nextEliminationPosition(players: PositionedPlayer[]): number {
  const alreadyPositioned = players.filter(isFinished).length;
  return Math.max(1, players.length - alreadyPositioned);
}

/**
 * Apply a re-entry or rebuy to the roster's finishing positions.
 *
 * Clears the returning player's position and shifts everyone who finished after
 * them (a numerically smaller position) one place worse, so the slot the
 * returning player vacated is not left occupied twice.
 *
 * Returns a new array; players who do not move are returned by identity, so a
 * caller can tell who actually changed.
 */
export function positionsAfterReEntry<T extends PositionedPlayer>(
  players: T[],
  playerId: string,
): T[] {
  const returning = players.find(p => p.id === playerId);

  // Nothing to renumber if they never held a finishing position — a rebuy
  // taken by a player who is still in their seat, for instance.
  if (!returning || typeof returning.position !== 'number' || returning.position <= 0) {
    return players;
  }

  const vacated = returning.position;

  return players.map(p => {
    if (p.id === playerId) return { ...p, position: undefined };
    if (isFinished(p) && (p.position as number) < vacated) {
      return { ...p, position: (p.position as number) + 1 };
    }
    return p;
  });
}

/**
 * The ids of players whose position `positionsAfterReEntry` would change,
 * excluding the returning player.
 *
 * Their league results were already written with the old position, so the
 * caller has to have them re-recorded. Kept here so the rule lives in one
 * place rather than being re-derived at the call site.
 */
export function playersShiftedByReEntry<T extends PositionedPlayer>(
  players: T[],
  playerId: string,
): string[] {
  const returning = players.find(p => p.id === playerId);
  if (!returning || typeof returning.position !== 'number' || returning.position <= 0) {
    return [];
  }
  const vacated = returning.position;
  return players
    .filter(p => p.id !== playerId && isFinished(p) && (p.position as number) < vacated)
    .map(p => p.id);
}

/**
 * Do these two rosters agree on everything an undo depends on?
 *
 * Undoing a rebuy or re-entry restores a whole players array, so it must only
 * be applied while nothing else has happened since.
 *
 * Reference equality is too strict: the tournament syncs through Firestore, so
 * an echo of the director's own write can replace the array with a new but
 * identical one, which would make a valid undo refuse. Comparing nothing is too
 * weak — undoing after a genuine change would discard that change silently.
 *
 * So compare the fields a return to the table actually moves. A later
 * elimination, knockout, rebuy, re-entry or roster edit changes at least one.
 */
export function rostersMatchForUndo(a: PositionedPlayer[], b: PositionedPlayer[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((p, i) => {
    const q = b[i];
    return !!q
      && p.id === q.id
      && p.isActive === q.isActive
      && p.position === q.position
      && (p.rebuys || 0) === (q.rebuys || 0)
      && (p.reEntries || 0) === (q.reEntries || 0)
      && (p.knockouts || 0) === (q.knockouts || 0);
  });
}
