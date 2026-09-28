import { freeSeatAt } from '@/lib/seating';

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
  return oneTableIndex(players) !== null;
}

/**
 * WHICH table the field is all sitting at, or null.
 *
 * The same walk `alreadyAtOneTable` used to do inline, returning the index
 * rather than throwing it away — because a player coming back during a final
 * table has to be seated AT that table, and `goToFinalTable` hard-coding
 * `tableIndex: 0` is not a second place to re-read that from. Two literals for
 * one fact is how `consoleTournamentId()` came to exist.
 */
export function oneTableIndex(players: SeatablePlayer[]): number | null {
  const active = players.filter(p => p.isActive !== false);
  if (active.length === 0) return null;

  let table: number | null = null;
  for (const p of active) {
    if (!p.seated) return null;
    const idx = p.tableAssignment?.tableIndex;
    if (typeof idx !== 'number') return null;
    if (table === null) table = idx;
    else if (idx !== table) return null;
  }
  return table;
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
/**
 * What the final table becomes when a player comes back into the game.
 *
 * ONE rule, THREE doors. A player re-enters the tournament by rebuy, by
 * re-entry, or by having their bust-out undone, and until now only the last of
 * those knew the final table existed. `undoBustOut` unwound the collapse when the
 * returning player no longer fitted; `processRebuy` and `processReEntry` never
 * mentioned it at all, so a rebuy during a final table left nine players on an
 * eight-seat table with one of them sitting alone on table 2.
 *
 * A rule enforced at one door out of three is not a rule, which is why this is a
 * function rather than a third copy.
 *
 * THREE OUTCOMES:
 *
 * - **Not at a final table** — nothing changes, exactly as before.
 * - **At one, and the field now OUTGROWS it** — unwind: put the pre-collapse
 *   seating back, drop the flag, clear the snapshot. The tournament is plainly
 *   not at its final table when more players are in it than that table seats.
 * - **At one, and the field still FITS** — the collapse stands and the returning
 *   player joins it. Their old chair is on a table nobody is playing at, so
 *   "the chair they never left" cannot be honoured literally; a free seat at the
 *   table the game is actually on is the nearest honest thing.
 *
 * **ORDER IS LOAD-BEARING on the unwind, and it is why this composes.** The
 * caller applies `seatToReclaim` FIRST and this runs over the top, which is how
 * `undoBustOut` already ordered it. `snapshotSeating` keeps only ACTIVE players,
 * so somebody who was already busted at the moment of the collapse is NOT in the
 * snapshot — `restoreSeating` leaves them exactly as they are, on the chair they
 * just reclaimed, which IS their real pre-collapse seat. Everyone else goes back
 * across both tables, so the lone-player-on-table-2 state cannot arise.
 */
export interface FinalTableState {
  isFinalTable?: boolean;
  preFinalTableSeating?: SeatSnapshot[];
  seatsPerTable: number;
  /**
   * Who has just come back, so the final table can be found from everyone ELSE.
   *
   * Needed because `seatToReclaim` has already put them on their pre-collapse
   * chair by the time this runs — so "which one table is the field at" has two
   * answers, and the returning player is the wrong one. Excluding them leaves
   * the collapsed field, which is the table the game is actually on.
   */
  returningId?: string;
  /**
   * The chair the returning player was sitting in BEFORE the collapse, from
   * their `seatInfo`.
   *
   * Needed because `seatToReclaim` runs before this and therefore asks its
   * question against the COLLAPSED roster, where the redraw has handed their old
   * chair to somebody else — so it returns null and they come back unseated even
   * though the unwind is about to vacate that very seat. Re-asked here, after the
   * restore, which is the only moment the answer is true.
   */
  reclaimSeat?: { tableIndex: number; seatIndex: number };
}

export interface FinalTablePatch<T> {
  players: T[];
  isFinalTable: boolean;
  preFinalTableSeating: SeatSnapshot[] | undefined;
  /**
   * The seat the returning player should take, or null to leave them unseated.
   *
   * Their own chair back when the collapse is unwound, a free seat at the final
   * table when it stands.
   */
  seatForReturner: { tableIndex: number; seatIndex: number } | null;
}

export function finalTableAfterReturn<T extends SeatablePlayer>(
  players: T[],
  state: FinalTableState,
): FinalTablePatch<T> {
  const unchanged = {
    players,
    isFinalTable: !!state.isFinalTable,
    preFinalTableSeating: state.preFinalTableSeating,
    seatForReturner: null,
  };

  if (!state.isFinalTable) return unchanged;

  if (outgrowsFinalTable(activeCount(players), state.seatsPerTable)) {
    const restored = restoreSeating(players, state.preFinalTableSeating);
    // Their own chair back, now that the restore has vacated it. "A rebuy is
    // chips bought in the chair they never left" finally survives a collapse.
    const seat = state.reclaimSeat;
    const free = seat && !restored.some(p =>
      p.id !== state.returningId &&
      p.isActive !== false &&
      p.seated &&
      p.tableAssignment?.tableIndex === seat.tableIndex &&
      p.tableAssignment?.seatIndex === seat.seatIndex
    );
    return {
      players: restored,
      isFinalTable: false,
      preFinalTableSeating: undefined,
      seatForReturner: free ? seat : null,
    };
  }

  // The collapse stands, so the returning player joins it rather than sitting
  // alone at the table everyone was moved off. A free seat is guaranteed here —
  // the field fits, and every other active player is on this table, so at most
  // seats-1 are taken — but a null falls back to unseated rather than inventing
  // a chair.
  const table = oneTableIndex(players.filter(p => p.id !== state.returningId));
  return {
    ...unchanged,
    seatForReturner: table === null ? null : freeSeatAt(players, table, state.seatsPerTable),
  };
}

export function outgrowsFinalTable(activeAfterRestore: number, seatsPerTable: number): boolean {
  return activeAfterRestore > seatsPerTable;
}
