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
