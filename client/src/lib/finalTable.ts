import { freeSeatAt, tablesNeededFor } from '@/lib/seating';
import { tableOccupancy } from '@/lib/tableBreak';

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
 * So a dismissal survives only while the question is still due. Once it is not,
 * the answer is spent: whatever happens next is a new question.
 *
 * **It takes the question rather than the field size, and that generalisation
 * is load-bearing now there is more than one question.** It used to ask
 * `activeCount > seatsPerTable`, which is the right test for exactly one of
 * them: the final-table prompt only ever fires at or below one table's worth,
 * so growing past that is the only way its answer can go stale. A TABLE BREAK is
 * dismissed far above that line — sixteen left on three tables of eight — and
 * under the old test every one of those dismissals read as stale the instant it
 * was made, dropping the latch on the next render and reopening the dialog. That
 * is the "Ignore for now" loop `lib/tableBalance.ts` was written to end, rebuilt
 * with a different number.
 *
 * This is the SAME class of bug as the one the latch was added to fix, one
 * level up — that version reopened on every render, this version stayed shut
 * across a round trip. Both come of describing an event by a value that
 * repeats.
 */
export function dismissalIsStale(
  dismissedAtCount: number | null,
  questionIsDue: boolean,
): boolean {
  if (dismissedAtCount === null) return false;
  return !questionIsDue;
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
  seatsPerTable?: number,
): T[] {
  if (!snapshot || snapshot.length === 0) return players;
  const byId = new Map(snapshot.map(s => [s.playerId, s]));
  // Only players still IN go back to a chair (October audit, M15). Somebody who
  // busted AT the final table is in the snapshot — it was taken while they were
  // active — and restoring them put a busted player back in a seat, the state
  // `seatablePlayers` exists to make impossible.
  const restored = players.map(player => {
    const seat = byId.get(player.id);
    if (!seat || player.isActive === false) return player;
    return {
      ...player,
      seated: seat.seated,
      tableAssignment: seat.tableIndex === undefined || seat.seatIndex === undefined
        ? undefined
        : { tableIndex: seat.tableIndex, seatIndex: seat.seatIndex },
    };
  });

  // A player the snapshot never heard of — seated after the collapse — keeps
  // their chair unless a restored player has just been given it. Two people in
  // one chair means one of them is drawn nowhere, with no KO button; so the
  // newcomer moves to a free seat at the same table, or waits to be placed.
  const restoredIds = new Set(restored.filter(p => byId.has(p.id) && p.isActive !== false).map(p => p.id));
  const holds = (p: SeatablePlayer, t: number, s: number) =>
    p.isActive !== false && p.seated && p.tableAssignment?.tableIndex === t && p.tableAssignment?.seatIndex === s;
  let out = restored;
  for (const p of restored) {
    if (restoredIds.has(p.id) || !p.seated || !p.tableAssignment || p.isActive === false) continue;
    const { tableIndex, seatIndex } = p.tableAssignment;
    const clash = out.some(q => q.id !== p.id && restoredIds.has(q.id) && holds(q, tableIndex, seatIndex));
    if (!clash) continue;
    const others = out.filter(q => q.id !== p.id);
    const free = seatsPerTable ? freeSeatAt(others, tableIndex, seatsPerTable) : null;
    out = out.map(q => q.id === p.id
      ? (free ? { ...q, tableAssignment: free } : { ...q, seated: false, tableAssignment: undefined })
      : q);
  }
  return out;
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
export interface ConsolidationSnapshot {
  seats: SeatSnapshot[];
  tables: number;
  names?: string[];
  backgrounds?: string[];
}

export interface FinalTableState {
  isFinalTable?: boolean;
  /** What the last consolidation replaced — seats AND the table configuration. */
  preConsolidation?: ConsolidationSnapshot;
  seatsPerTable: number;
  /** How many tables the game is configured for RIGHT NOW, after the consolidation. */
  numberOfTables: number;
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
  preConsolidation: ConsolidationSnapshot | undefined;
  /**
   * The table configuration to put back, or null to leave it alone.
   *
   * Restoring the chairs without the table is not a restore: every render walks
   * `0..numberOfTables-1`, so a seat on table 3 of a two-table game is drawn
   * nowhere at all.
   */
  restoreTables: { numberOfTables: number; names?: string[]; backgrounds?: string[] } | null;
  /**
   * The seat the returning player should take, or null to leave them unseated.
   *
   * Their own chair back when the collapse is unwound, a free seat at the final
   * table when it stands.
   */
  seatForReturner: { tableIndex: number; seatIndex: number } | null;
}

export function consolidationAfterReturn<T extends SeatablePlayer>(
  players: T[],
  state: FinalTableState,
): FinalTablePatch<T> {
  const unchanged = {
    players,
    isFinalTable: !!state.isFinalTable,
    preConsolidation: state.preConsolidation,
    restoreTables: null,
    seatForReturner: null,
  };

  const outgrown = outgrowsTables(activeCount(players), state);

  // Nothing has been consolidated, so there is nothing for a returning player to
  // meet. A break leaves a snapshot without the flag, which is why this can no
  // longer key on `isFinalTable` alone.
  //
  // NOT widened to "the field outgrows the tables". That is true of any game with
  // more players than chairs, consolidated or not, and acting on it here would
  // silently add a table on an ordinary rebuy — where the app already ASKS, through
  // the Seat Players overflow offer. Three tests said so when it was tried.
  if (!state.isFinalTable && !state.preConsolidation) return unchanged;

  if (outgrown) {
    const snap = state.preConsolidation;
    const restored = restoreSeating(players, snap?.seats, state.seatsPerTable);
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
      preConsolidation: undefined,
      // The table comes back with the chairs, or the restored seating points at
      // tables the render loop no longer walks.
      // The table comes back with the chairs. WITHOUT a snapshot it is still
      // raised to what the field needs: after a break the remaining tables are
      // exactly full — sixteen on two eights — so the very next rebuy has
      // nowhere to go, and `preConsolidation` is local state that no reload of a
      // live game survives. Raising the count moves nobody and changes no seat;
      // it only makes room, which beats leaving a player standing.
      restoreTables: snap
        ? { numberOfTables: snap.tables, names: snap.names, backgrounds: snap.backgrounds }
        : { numberOfTables: tablesNeededFor(activeCount(players), state.seatsPerTable) },
      seatForReturner: free ? seat : null,
    };
  }

  // The consolidation stands, so the returning player joins the game where it is
  // actually being played rather than sitting alone at a table everyone was
  // moved off. A null falls back to unseated rather than inventing a chair.
  //
  // But their OWN chair first, when it is still part of the game and still free
  // (October audit, Low — reproduced). After a table BREAK only the broken table
  // moved, so a player busted from a table still in play had a perfectly good
  // chair waiting, and this sent them to the emptiest table instead: a rebuy is
  // chips bought in the chair they never left.
  return { ...unchanged, seatForReturner: ownChairIfStillGood(players, state) ?? seatForReturningPlayer(players, state) };
}

/**
 * The returning player's own chair, if it is on a table still in play, exists,
 * and nobody else is in it. At a final table it must be AT the final table —
 * a pre-collapse chair elsewhere is the lone-player-on-table-2 fault.
 */
function ownChairIfStillGood<T extends SeatablePlayer>(
  players: T[],
  state: FinalTableState,
): { tableIndex: number; seatIndex: number } | null {
  const seat = state.reclaimSeat;
  if (!seat) return null;
  const tables = Math.max(1, Math.floor(state.numberOfTables) || 1);
  if (seat.tableIndex < 0 || seat.tableIndex >= tables) return null;
  if (seat.seatIndex < 0 || seat.seatIndex >= state.seatsPerTable) return null;
  const others = players.filter(p => p.id !== state.returningId);
  if (state.isFinalTable && oneTableIndex(others) !== seat.tableIndex) return null;
  const taken = others.some(p =>
    p.isActive !== false && p.seated &&
    p.tableAssignment?.tableIndex === seat.tableIndex &&
    p.tableAssignment?.seatIndex === seat.seatIndex);
  return taken ? null : { tableIndex: seat.tableIndex, seatIndex: seat.seatIndex };
}

/**
 * Where a returning player sits when the consolidation STANDS.
 *
 * Two shapes, because the two consolidations leave different states behind.
 *
 * At a FINAL table the answer is `oneTableIndex` over everyone else — deliberately
 * conservative, and excluding the returner because `seatToReclaim` has already put
 * them on their pre-collapse chair, so "which one table is the field at" otherwise
 * has two answers and theirs is the wrong one.
 *
 * After a table BREAK there is more than one table in play, so the question is
 * which of them has room. The emptiest, for the same reason the break itself
 * picks the emptiest table: it is the one a seat belongs at.
 */
function seatForReturningPlayer<T extends SeatablePlayer>(
  players: T[],
  state: FinalTableState,
): { tableIndex: number; seatIndex: number } | null {
  const others = players.filter(p => p.id !== state.returningId);

  if (state.isFinalTable) {
    const table = oneTableIndex(others);
    return table === null ? null : freeSeatAt(players, table, state.seatsPerTable);
  }

  const counts = tableOccupancy(others, state.numberOfTables);
  const order = counts.map((n, t) => ({ n, t })).sort((a, b) => a.n - b.n || a.t - b.t);
  for (const { t } of order) {
    const seat = freeSeatAt(players, t, state.seatsPerTable);
    if (seat) return seat;
  }
  return null;
}

/**
 * Does the field now need MORE tables than the game is configured for?
 *
 * The generalisation of `outgrowsFinalTable`, and the test the unwind turns on.
 * Through `tablesNeededFor` rather than a second ceil, so it cannot disagree with
 * the predicate that asked for the consolidation in the first place.
 */
export function outgrowsTables(
  activeAfterRestore: number,
  { numberOfTables, seatsPerTable }: { numberOfTables: number; seatsPerTable: number },
): boolean {
  return tablesNeededFor(activeAfterRestore, seatsPerTable) > Math.max(1, Math.floor(numberOfTables) || 1);
}

export function outgrowsFinalTable(activeAfterRestore: number, seatsPerTable: number): boolean {
  return activeAfterRestore > seatsPerTable;
}
