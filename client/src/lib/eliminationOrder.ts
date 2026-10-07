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

/**
 * True when a player has been eliminated and holds a finishing position.
 *
 * **This counts the WINNER, and that is deliberate.** Position 1 is a finishing
 * position like any other, and `nextEliminationPosition` and
 * `positionsAfterReEntry` are asking who already holds a NUMBER. Excluding the
 * champion from that count would hand the next bust-out a position somebody
 * already has, which is the collision this whole module exists to fix.
 *
 * `isBustOut` below is the other question. Two predicates, and they are not the
 * same predicate.
 */
function isFinished(p: PositionedPlayer): boolean {
  return p.isActive === false && typeof p.position === 'number' && p.position > 0;
}

/**
 * Did this player BUST, rather than WIN?
 *
 * See `mostRecentlyBusted`'s header for why the exclusion is a flat
 * `position !== 1` and not "unless the game is over".
 */
export function isBustOut(p: PositionedPlayer): boolean {
  return isFinished(p) && p.position !== 1;
}

/**
 * Everyone who busted, in roster order.
 *
 * Identity-preserving — the same objects come back out, so a caller can use
 * them as React keys and hand them straight to a control.
 */
export function bustedPlayers<T extends PositionedPlayer>(
  players: T[] | null | undefined,
): T[] {
  return (players || []).filter(isBustOut);
}

/**
 * Who busted most recently?
 *
 * The LOWEST finishing position wins. Positions count down as the night goes
 * on — `nextEliminationPosition` is `players.length - alreadyPositioned`, so in
 * a nine-player game the first player out takes 9th, the next 8th — which makes
 * the SMALLEST number the freshest bust-out.
 *
 * It used to take the largest, and the comment above it argued the case
 * correctly and then concluded the opposite: "9th is knocked out before 8th —
 * so the largest number is the freshest bust-out". If 9th goes out before 8th
 * then 8th is fresher, and 8 is the smaller number. A test enshrined the same
 * contradiction in the same breath.
 *
 * So both dialogs that ask this named the WRONG PLAYER — the first person out
 * of the tournament, possibly hours earlier, rather than the bust-out that had
 * just happened. The final-table prompt offered "{name} is rebuying" about
 * them, and the uneven-tables prompt said their busting "is what left the
 * tables uneven". One of them was then offered a rebuy they had no reason to
 * want, in place of the player actually standing there.
 *
 * Filtering on `isFinished` rather than `isActive === false` is part of the
 * fix, not tidying: a busted player carrying no position would read as 0 under
 * a minimum and win every time.
 *
 * **The WINNER is not a bust-out, and that omission was a bug with teeth.**
 * `eliminatePlayer` awards the last player standing `position: 1` AND
 * `isActive: false` in one update — see `lib/gameOver.ts` — so the champion
 * satisfies `isFinished`, and 1 is the smallest number there is. The minimum
 * below therefore returned **the winner** at the end of every game, and the
 * rebuy offer opened on them: *"{Champion} is out in 1st — rebuy?"*, with a
 * persisted failsafe Rebuy button to match. On DEFAULT settings, not an edge
 * case: `DEFAULT_PRIZE_STRUCTURE` allows rebuys with no period, and `canRebuy`
 * deliberately does not ask whether the player is eliminated.
 *
 * **The exclusion is `position !== 1` flat, NOT "unless the game is over", and
 * that distinction is the fix rather than a shortcut.** Gating it on
 * `gameIsOver(players)` looks tighter and hands the champion straight back,
 * because a roster can hold a winner at position 1 with somebody active:
 *
 * - **Add a player to a finished game.** `addPlayer` is unconditional and
 *   writes `isActive: true`, and a finished game stays on screen until the next
 *   one is started — there is deliberately no End Game button.
 * - **Undo the RUNNER-UP's bust-out.** `undoBustOut` clears a false winner only
 *   when two or more players are active afterwards, and restoring 2nd place
 *   makes exactly one. The champion is left stranded, inactive at position 1.
 *
 * Bustedness is a fact about the player's own row, like `isFinished` itself, so
 * no other row can resurrect it. A roster-wide gate is also the wrong shape for
 * a per-player question — one stale entry from a Firestore round-trip would
 * flip the champion back into the set.
 *
 * "The game has FINISHED" is a separate fact, and it lives at the two sites
 * that act on it — `lib/rebuyOffer.ts`, which must not offer the runner-up a
 * rebuy into a tournament already written to history.
 *
 * Three dialogs ask this one — the final-table prompt, the uneven-tables
 * prompt, and the rebuy offer at bust-out (`lib/rebuyOffer.ts`) — plus the
 * Busted strip and the entry controls, through `bustedPlayers` and `isBustOut`.
 * It lives here so they cannot drift, and so the rule is testable away from all
 * of them.
 */
export function mostRecentlyBusted<T extends PositionedPlayer>(players: T[]): T | null {
  return bustedPlayers(players)
    .reduce<T | null>(
      (latest, p) => (!latest || (p.position as number) < (latest.position as number) ? p : latest),
      null,
    );
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
 * A player joins a game that already has finishers — late entry (October audit,
 * H7).
 *
 * The field just grew by one, so everybody already out finished one place worse
 * than they were given. Without this the next bust-out was handed a place
 * somebody already held: nine players, three out (9th, 8th, 7th), one added —
 * and the next one out was also 7th, while nobody was ever 10th. Two league
 * results at one place, one place never awarded.
 */
export function positionsAfterAdd<T extends PositionedPlayer>(players: T[]): T[] {
  if (!players.some(isFinished)) return players;
  return players.map(p => (isFinished(p) ? { ...p, position: (p.position as number) + 1 } : p));
}

/**
 * A player is taken out of the game altogether — a mistaken add, a no-show —
 * and the roster returned without them (October audit, H7).
 *
 * Everybody who finished BELOW the removed player moves up one; a player removed
 * while still in counts as above every finisher, so all of them move. Without
 * this the field shrank and the places did not: a gap, and a place number larger
 * than the field — 9th in an eight-player game — which a points formula built on
 * `p <= f` does not expect.
 */
export function positionsAfterRemove<T extends PositionedPlayer>(players: T[], removedId: string): T[] {
  const removed = players.find(p => p.id === removedId);
  if (!removed) return players;
  const slot = isFinished(removed) ? (removed.position as number) : 0;
  return players
    .filter(p => p.id !== removedId)
    .map(p => (isFinished(p) && (p.position as number) > slot
      ? { ...p, position: (p.position as number) - 1 }
      : p));
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
