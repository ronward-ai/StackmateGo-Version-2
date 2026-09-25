/**
 * When a tournament collapses to one table, and how to put it back.
 *
 * The collapse is the most destructive routine thing a director does: it moves
 * every remaining player and REDRAWS their seats at random. That is correct —
 * a final table draw is supposed to be random — but it means the arrangement
 * before it is gone unless something keeps it.
 *
 * Nothing did. `goToFinalTable` overwrote every `tableAssignment` and stored
 * nothing, so undoing the bust-out that triggered the collapse restored only
 * the busted player's own chair (via lib/seating.ts's `seatToReclaim`) and left
 * everyone else sitting wherever the redraw had put them, with the tournament
 * still marked as a final table. A director who collapsed and immediately
 * regretted it had no way back.
 *
 * Kept free of React and Firebase so the decisions can be tested without
 * either — the lib/ convention. Callers pass players they already hold.
 */

/** Only what seating decisions need. A `Player` satisfies this. */
export interface SeatablePlayer {
  id: string;
  isActive?: boolean;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
}

/** Where one player sat before the collapse. */
export interface SeatSnapshot {
  playerId: string;
  seated: boolean;
  tableIndex?: number;
  seatIndex?: number;
}

export function activeCount(players: SeatablePlayer[]): number {
  return players.filter(p => p.isActive !== false).length;
}

/**
 * Should the director be ASKED whether this is the final table?
 *
 * Asked, never told: the collapse moves everyone, and the director may be about
 * to rebuy the player who just busted — in which case the field is back to size
 * and nobody should have moved at all.
 *
 * `eliminatedAtLeastOne` is what stops it firing on the opening seating of a
 * tournament that happens to start with exactly one table's worth.
 *
 * **`<=`, NOT `===`, and that equality was a real bug.** The field passes
 * through exactly one table's worth once: with 8 seats and 9 players it is 8
 * for one bust-out and then 7, 6, 5. Answering "Not yet" — or simply being on
 * another screen for that render — meant the question was never asked again,
 * because no later count is equal to 8. A director ran a real game, got one
 * prompt, and then had to collapse the table by hand; that hand-arranging is
 * what walked into the seating bug documented in lib/seating.ts.
 *
 * Asking on every bust-out below the threshold is not nagging: each one is
 * genuinely a new question, and `promptDismissedFor` already caps it at one
 * prompt per bust-out. A director who wants to arrange it themselves says
 * "Not this game" and is not asked again.
 */
export function shouldPromptForFinalTable(
  players: SeatablePlayer[],
  seatsPerTable: number,
  isFinalTable: boolean | undefined,
): boolean {
  const active = activeCount(players);
  const eliminatedAtLeastOne = players.some(p => p.isActive === false);
  return active <= seatsPerTable && active > 1 && !isFinalTable && eliminatedAtLeastOne;
}

/**
 * Has the prompt already been answered for this many players?
 *
 * "Not yet" used to last exactly until the next render that touched the roster
 * — a chip edit, a knockout, anything — because the prompt was driven straight
 * off a predicate over `state.players`. Latching the dismissal against the
 * COUNT it was dismissed at is what makes it stick, while still re-arming if
 * the field changes size again and the question becomes live once more.
 */
export function promptDismissedFor(
  dismissedAtCount: number | null,
  players: SeatablePlayer[],
): boolean {
  return dismissedAtCount !== null && dismissedAtCount === activeCount(players);
}

/** Where everyone is sitting now, so it can be restored. */
export function snapshotSeating(players: SeatablePlayer[]): SeatSnapshot[] {
  return players
    .filter(p => p.isActive !== false)
    .map(p => ({
      playerId: p.id,
      seated: !!p.seated,
      tableIndex: p.tableAssignment?.tableIndex,
      seatIndex: p.tableAssignment?.seatIndex,
    }));
}

/**
 * Put everyone back where the snapshot says they were.
 *
 * A player not in the snapshot is left exactly as they are rather than being
 * unseated: they arrived after the collapse — a rebuy, a re-entry — and the
 * snapshot has no opinion about them. Guessing would be how a returning player
 * silently loses the chair `seatToReclaim` just gave them.
 */
export function restoreSeating<T extends SeatablePlayer>(
  players: T[],
  snapshot: SeatSnapshot[] | null | undefined,
): T[] {
  if (!snapshot || snapshot.length === 0) return players;
  const byId = new Map(snapshot.map(s => [s.playerId, s]));
  return players.map(player => {
    const seat = byId.get(player.id);
    if (!seat) return player;
    return {
      ...player,
      seated: seat.seated,
      tableAssignment: seat.tableIndex === undefined || seat.seatIndex === undefined
        ? undefined
        : { tableIndex: seat.tableIndex, seatIndex: seat.seatIndex },
    };
  });
}

/**
 * Would putting this player back leave more players than one table seats?
 *
 * The test for whether undoing a bust-out should also undo the final table. It
 * asks about the state AFTER the restore, which is why it takes the count that
 * will exist rather than the one that does.
 */
export function outgrowsFinalTable(activeAfterRestore: number, seatsPerTable: number): boolean {
  return activeAfterRestore > seatsPerTable;
}
