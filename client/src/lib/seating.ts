import type { Player } from '@/types';

/**
 * Can a player have their old seat back?
 *
 * A rebuy is chips bought in the chair the player never left, so they belong
 * back in it. `eliminatePlayer` stores where they were sitting as `seatInfo`
 * for exactly this, and the undo-elimination path already restored it — but
 * `processRebuy` cleared `seated` and `tableAssignment` instead, so the director
 * had to seat them again and the seating put one player at an empty second
 * table.
 *
 * The one thing that has to be checked is whether the seat is still free: a
 * table balance or a check-in may have put someone else in it while they were
 * out, and two players in one chair is worse than an unseated one.
 *
 * Pure, per the lib/ convention.
 */
export interface Seat {
  tableIndex: number;
  seatIndex: number;
}

export function seatToReclaim(player: Player, players: Player[]): Seat | null {
  const seat = player.seatInfo;
  if (!seat || typeof seat.tableIndex !== 'number' || typeof seat.seatIndex !== 'number') {
    return null;
  }

  // Only a player still IN the game holds a seat. Someone eliminated may carry a
  // stale tableAssignment, and that must not lock the chair.
  const taken = players.some(p =>
    p.id !== player.id &&
    p.isActive !== false &&
    p.seated &&
    p.tableAssignment?.tableIndex === seat.tableIndex &&
    p.tableAssignment?.seatIndex === seat.seatIndex
  );

  return taken ? null : { tableIndex: seat.tableIndex, seatIndex: seat.seatIndex };
}

/**
 * The players who may be given a chair.
 *
 * **A busted player has no seat.** `eliminatePlayer` sets `seated: false` and
 * `tableAssignment: undefined`, which is the whole reason the Busted strip had
 * to exist — a player leaves the grid the instant they go out. Every part of
 * the app honours that except the one that hands out seats.
 *
 * `SeatPlayersDialog` was given the entire roster and filtered only on
 * `seated`, so eliminated players appeared as tickable rows and Select All
 * took them; `seatPlayersManually` then set `seated: true` on whatever it was
 * handed. A director collapsing to a final table by hand — which is what the
 * broken final-table prompt left them doing — dropped the dead back into
 * chairs, and the seat offers a busted player only a REBUY, so the only way
 * out was to put them back in the tournament for real.
 *
 * Both the dialog and the seating call this. Two gates for one rule is
 * deliberate: a check in the dialog alone is walked around by the next caller,
 * which is exactly why `attemptAddPlayer` is the single route for adding a
 * player.
 */
export function seatablePlayers<T extends { isActive?: boolean }>(players: T[]): T[] {
  return players.filter(p => p.isActive !== false);
}
