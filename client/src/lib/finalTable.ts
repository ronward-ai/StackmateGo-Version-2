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
 * Is the field ALREADY sitting at a single table?
 *
 * Derived from the seating, and that is the whole point: **a stored flag cannot
 * answer this for a game that is already under way.**
 *
 * `isFinalTable` was for a long time written nowhere but a per-device
 * localStorage mirror, and that mirror is deliberately never auto-restored for a
 * live game (see CLAUDE.md — seeding a live tournament from localStorage is the
 * hazard `hasLoadedRemoteState` exists to prevent). So for any game collapsed
 * before the flag began being persisted, a reload loses it on every device at
 * once, nothing is left holding `true` to write it, and the document stays empty
 * for good. The prompt then fires forever: 4 players on an 8-seat final table
 * satisfies every other clause by definition.
 *
 * Persisting the flag fixes games collapsed from now on. Only a derivation can
 * fix the ones already running — the same read-side normalisation trade
 * `payoutsOf()` and `bandsOf()` make, where the stored value is preferred and the
 * shape is worked out when it is absent.
 *
 * **It also answers a question the flag never could**: a tournament that has only
 * ever used ONE table has no final table to go to, and used to be asked anyway
 * on every bust-out.
 *
 * Conservative on purpose. An active player who is unseated, or seated with no
 * table, makes this FALSE — the director may not be using the seating chart at
 * all, and claiming "you are already at the final table" about a game whose
 * seats nobody has filled would suppress a question that is genuinely due.
 */
export function alreadyAtOneTable(players: SeatablePlayer[]): boolean {
  const active = players.filter(p => p.isActive !== false);
  if (active.length === 0) return false;

  let table: number | null = null;
  for (const p of active) {
    if (!p.seated) return false;
    const idx = p.tableAssignment?.tableIndex;
    if (typeof idx !== 'number') return false;
    if (table === null) table = idx;
    else if (idx !== table) return false;
  }
  return true;
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
  // The stored flag FIRST, then the seating — preferred-then-derived, the
  // payoutsOf() shape. The flag alone was never enough: it could not be read
  // back for a game collapsed before it was persisted, and asking a director
  // about the final table they are already sitting at was reported twice.
  const oneTableAlready = isFinalTable === true || alreadyAtOneTable(players);
  return active <= seatsPerTable && active > 1 && !oneTableAlready && eliminatedAtLeastOne;
}

/**
 * Has the prompt already been answered at this field size?
 *
 * "Not yet" used to last exactly until the next render that touched the roster
 * — a chip edit, a knockout, anything — because the prompt was driven straight
 * off a predicate over `state.players`. Latching the dismissal against the
 * COUNT it was dismissed at is what makes it stick while the field stays that
 * size, which is the whole job here.
 *
 * **It cannot tell you whether the question is NEW**, and must not be asked to:
 * two equal counts look identical whether the director has just dismissed the
 * prompt or dismissed it, rebought the busted player and knocked them out
 * again. A count recurs; a question does not. `dismissalIsStale` below is what
 * answers that, and the caller has to drop the latch when it says so.
 */
export function promptDismissedFor(
  dismissedAtCount: number | null,
  players: SeatablePlayer[],
): boolean {
  return dismissedAtCount !== null && dismissedAtCount === activeCount(players);
}

/**
 * Has a dismissal been overtaken by events?
 *
 * **"Not yet" answers ONE bust-out, not the tournament.** Nine players on
 * eight-seat tables: one busts, the prompt appears, the director rebuys them
 * from the dialog, and the field is nine again — so the collapse is not due at
 * all. When that player busts a second time the field is eight again, and the
 * latch, holding the number eight, silently swallowed the question. A director
 * got one prompt a night and collapsed the table by hand, which is exactly the
 * hand-arranging that `lib/seating.ts` documents the cost of.
 *
 * So a dismissal survives only while the field still fits one table. Grow back
 * past it and the answer is spent: whatever happens next is a new question.
 *
 * This is the SAME class of bug as the one the latch was added to fix, one
 * level up — that version reopened on every render, this version stayed shut
 * across a round trip. Both come of describing an event by a value that
 * repeats.
 */
export function dismissalIsStale(
  dismissedAtCount: number | null,
  players: SeatablePlayer[],
  seatsPerTable: number,
): boolean {
  if (dismissedAtCount === null) return false;
  return activeCount(players) > seatsPerTable;
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
