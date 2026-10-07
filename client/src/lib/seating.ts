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

/**
 * The lowest free seat at one table, or null when it is full.
 *
 * **`seatToReclaim` cannot answer this, and that is the bug it caused.** It asks
 * one question — is any other active, seated player on this exact (table, seat)?
 * It knows nothing of which tables are in USE. So after a final-table collapse
 * moves everybody onto one table, a returning player's `seatInfo` naming table 2
 * matches nobody, reads as "free", and they are seated alone at an empty table
 * while the game is played elsewhere. Reported from a real game: nine players,
 * one busted, collapse to the final table, rebuy — and he landed on table 2 by
 * himself.
 *
 * A chair being unoccupied is not the same as it being part of the game.
 *
 * Seat ZERO is a free seat. The `?? null` rather than `|| null` is deliberate:
 * `seating.test.ts` already carries a case named for that trap, because 0 is
 * falsy and this is exactly the shape that gets it wrong.
 */
export interface SeatedLike {
  isActive?: boolean;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
}

export function freeSeatAt(
  // Structural, not `Player`, so `lib/finalTable.ts` can pass its own
  // `SeatablePlayer` without either module widening its idea of a player.
  players: SeatedLike[],
  tableIndex: number,
  seatsPerTable: number,
): Seat | null {
  for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
    const taken = players.some(p =>
      p.isActive !== false &&
      p.seated &&
      p.tableAssignment?.tableIndex === tableIndex &&
      p.tableAssignment?.seatIndex === seatIndex
    );
    if (!taken) return { tableIndex, seatIndex };
  }
  return null;
}

export function seatToReclaim(
  player: Player,
  players: Player[],
  tables?: { numberOfTables?: number; seatsPerTable?: number } | null,
): Seat | null {
  const seat = player.seatInfo;
  if (!seat || typeof seat.tableIndex !== 'number' || typeof seat.seatIndex !== 'number') {
    return null;
  }

  // A chair on a table that is no longer in play, or past the end of one, is not
  // a chair (October audit, M15). After a table break — or a lowered Tables or
  // Seats field — a busted player's remembered seat could name table 3 of a
  // two-table game, and a rebuy or an undo put them there: seated, drawn
  // nowhere, with no KO button. The ghost again, by another door. Unseated is
  // honest; the director places them.
  if (tables?.numberOfTables && seat.tableIndex >= tables.numberOfTables) return null;
  if (tables?.seatsPerTable && seat.seatIndex >= tables.seatsPerTable) return null;

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

/**
 * Is everyone who could be sitting already sitting?
 *
 * The Seating tab's primary action does two jobs — place people who have no
 * chair, and redraw the chairs of people who do — and its label said both:
 * "Seat / Randomize". At a final table, where every remaining player is already
 * seated, half of that label describes nothing, and the half a director wants
 * in that moment is the one they have to read past.
 *
 * Busted players are not counted, here as everywhere: they hold no chair, so
 * they can never make this false. Without that, one knocked-out player would
 * keep the button saying "Seat" for the rest of the night.
 *
 * False for an empty field: there is nobody to have seated, and "Randomize"
 * over an empty table would be nonsense.
 */
export function allSeated<T extends { isActive?: boolean; seated?: boolean }>(players: T[]): boolean {
  const seatable = seatablePlayers(players);
  return seatable.length > 0 && seatable.every(p => p.seated === true);
}

/**
 * WHICH chairs a seating actually hands out.
 *
 * Extracted from `TablesSection`'s `seatPlayersManually`, and the extraction is
 * the fix rather than tidying: the defect lived in code with no test and no way
 * to have one — inline in a component, not exported — which is the same argument
 * `lib/tableBalance.ts` was pulled out on.
 *
 * **The bug it ends.** The seater called `planSeating`, used only `perTable`, and
 * threw `overflow` away. With 17 players on 2 tables of 8 the seat list held 16
 * entries, and the caller's fallback — `shuffledSeats[i] || { tableIndex: 0,
 * seatIndex: i }` — FABRICATED a chair for the seventeenth: seat 16 on table 1,
 * twice beyond the eight that exist. The grid draws seats 0–7, so he became a
 * ghost: `seated: true`, invisible, no KO button, unreachable by Move mode. The
 * header's `9/8 seated · -1 empty` was a faithful rendering of that.
 *
 * So this returns only seats that EXIST, and the caller leaves anyone it could
 * not place `seated: false` — a state the whole app already understands, unlike
 * a chair that is not there.
 *
 * **It also heals a game already in that state.** A player sitting at a seat index
 * beyond `seatsPerTable` is not treated as holding a chair, so the next Seat
 * Players frees the ghost. Normalised on read, the `payoutsOf()` trade: no stored
 * game is rewritten.
 */
export function assignSeats(
  count: number,
  /** `${tableIndex}-${seatIndex}` for chairs held by players OUTSIDE this selection. */
  occupied: ReadonlySet<string>,
  plan: SeatingPlan,
  { numberOfTables, seatsPerTable }: { numberOfTables: number; seatsPerTable: number },
): Seat[] {
  const tables = Math.max(1, Math.floor(numberOfTables) || 1);
  const seatsEach = Math.max(1, Math.floor(seatsPerTable) || 1);
  const wanted = Math.max(0, Math.floor(count) || 0);
  const seats: Seat[] = [];

  if (plan.perTable.length <= 1) {
    // Everybody who fits on one table goes to one table — the branch
    // planSeating's own test protects.
    for (let s = 0; s < seatsEach && seats.length < wanted; s++) {
      if (!occupied.has(`0-${s}`)) seats.push({ tableIndex: 0, seatIndex: s });
    }
    // Table 1's chairs may be taken by players outside the selection, so spill.
    if (seats.length < wanted) {
      for (let t = 0; t < tables && seats.length < wanted; t++) {
        for (let s = 0; s < seatsEach && seats.length < wanted; s++) {
          if (!occupied.has(`${t}-${s}`)) seats.push({ tableIndex: t, seatIndex: s });
        }
      }
    }
    return seats;
  }

  let placed = 0;
  for (let t = 0; t < tables && placed < wanted; t++) {
    const need = plan.perTable[t] ?? 0;
    let got = 0;
    for (let s = 0; s < seatsEach && got < need && placed < wanted; s++) {
      if (!occupied.has(`${t}-${s}`)) { seats.push({ tableIndex: t, seatIndex: s }); got++; placed++; }
    }
  }
  // A table's share can be short of free chairs — its seats are held by players
  // outside the selection — so whoever that left over takes any free chair that
  // remains rather than standing (October audit, Low). The even split above is
  // a preference; nobody stands while a chair is empty.
  if (seats.length < wanted) {
    const taken = new Set(seats.map(x => `${x.tableIndex}-${x.seatIndex}`));
    for (let t = 0; t < tables && seats.length < wanted; t++) {
      for (let s = 0; s < seatsEach && seats.length < wanted; s++) {
        const key = `${t}-${s}`;
        if (!occupied.has(key) && !taken.has(key)) { seats.push({ tableIndex: t, seatIndex: s }); taken.add(key); }
      }
    }
  }
  return seats;
}

/**
 * The chairs held by seated players outside `exclude` — the `occupied` that
 * `planSeating` and `assignSeats` take, spelled once for the seater and the
 * dialog that describes it. A seat index beyond the table holds no chair: it is
 * the ghost `assignSeats` exists to free.
 */
export function occupiedChairs(
  players: readonly { id: string; seated?: boolean; tableAssignment?: { tableIndex: number; seatIndex: number } }[],
  exclude: ReadonlySet<string>,
  seatsPerTable: number,
): Set<string> {
  const occupied = new Set<string>();
  for (const p of players) {
    if (!p.seated || !p.tableAssignment || exclude.has(p.id)) continue;
    if (p.tableAssignment.seatIndex >= seatsPerTable) continue;
    occupied.add(`${p.tableAssignment.tableIndex}-${p.tableAssignment.seatIndex}`);
  }
  return occupied;
}

/**
 * The table names for a given count, grown or trimmed from whatever exists.
 *
 * Here rather than in a component because **two places now add a table**: the
 * Seating tab's Tables field, and the "Add a table" offer that both seaters make
 * when the field will not fit. A second spelling of "Table {n}" is how a game
 * ends up with one table called `Table 3` and another called nothing.
 */
export function tableNamesFor(existing: readonly string[] | undefined, n: number): string[] {
  const prev = existing || [];
  const count = Math.max(1, Math.floor(n) || 1);
  return count > prev.length
    ? [...prev, ...Array.from({ length: count - prev.length }, (_, i) => `Table ${prev.length + i + 1}`)]
    : prev.slice(0, count);
}

/**
 * How many tables it takes to seat this many, for the "Add a table" offer.
 *
 * Clamped to 20 to match the Tables field's own maximum — offering a count the
 * input would refuse is worse than offering none.
 */
export function tablesNeededFor(count: number, seatsPerTable: number): number {
  const seats = Math.max(1, Math.floor(seatsPerTable) || 1);
  const wanted = Math.max(0, Math.floor(count) || 0);
  return Math.min(20, Math.max(1, Math.ceil(wanted / seats)));
}

/** How a set of players spreads across the configured tables. */
export interface SeatingPlan {
  /** How many players land on each table, table 0 first. */
  perTable: number[];
  /** How many cannot be seated at all, because the tables are full. */
  overflow: number;
}

/**
 * How many players land on each table, for a given number to seat.
 *
 * The Seat Players dialog printed a line describing this and **computed it from
 * constants**: `maxTables = 3` and `maxSeatsPerTable = 6`, hard-coded, with the
 * director's real configuration never passed to the dialog at all. It then
 * chose its own "optimal" table count, which is not what seating does. So the
 * sentence under the list was right only by coincidence — and at a final table,
 * where the answer is always "one table", it usually was not.
 *
 * Two places deriving one fact, which is how the rake formula reached nine
 * sites. `seatPlayersManually` takes its split from here too.
 *
 * **The `count <= seatsPerTable` branch is the important one.** Everybody who
 * fits on one table goes to one table — that is the final table, the case a
 * director looks at this screen for — rather than being divided across the
 * tables the game started with.
 */
export function planSeating(
  count: number,
  { numberOfTables, seatsPerTable }: { numberOfTables: number; seatsPerTable: number },
  /**
   * Chairs held by players OUTSIDE the selection (October audit, Low). Seat
   * Selected planned against every chair in the room, so with table 1 full and
   * ten selected across three eight-seat tables it promised ten and seated six.
   * Only chairs that exist count — see `occupiedChairs`.
   */
  occupied: ReadonlySet<string> = new Set(),
): SeatingPlan {
  const tables = Math.max(1, Math.floor(numberOfTables) || 1);
  const seats = Math.max(1, Math.floor(seatsPerTable) || 1);
  const wanted = Math.max(0, Math.floor(count) || 0);

  let held = 0;
  occupied.forEach(key => {
    const [t, s] = key.split('-').map(Number);
    if (t >= 0 && t < tables && s >= 0 && s < seats) held++;
  });
  const capacity = tables * seats - held;
  const seatable = Math.min(wanted, capacity);
  const overflow = wanted - seatable;

  if (seatable === 0) return { perTable: [], overflow };

  // One table's worth stays on one table.
  if (seatable <= seats) return { perTable: [seatable], overflow };

  const base = Math.floor(seatable / tables);
  const extra = seatable % tables;
  const perTable: number[] = [];
  for (let t = 0; t < tables; t++) {
    const n = base + (t < extra ? 1 : 0);
    if (n > 0) perTable.push(n);
  }
  return { perTable, overflow };
}

type SeatHolder = {
  id: string;
  isActive?: boolean;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
};

/**
 * Who would be left in a chair that no longer exists if the table
 * configuration became `cfg` (October audit, Low).
 *
 * Lowering Tables or Seats/Table mid-game had no guard: a player on table 3
 * of a game cut to two tables, or in seat 9 of tables cut to eight, stayed
 * `seated: true` at a chair the grid never draws — the ghost `assignSeats`
 * exists to free, made by the settings field instead.
 */
export function strandedBy<T extends SeatHolder>(
  players: readonly T[],
  { numberOfTables, seatsPerTable }: { numberOfTables: number; seatsPerTable: number },
): T[] {
  return players.filter(p =>
    p.isActive !== false && p.seated && p.tableAssignment &&
    (p.tableAssignment.tableIndex >= numberOfTables || p.tableAssignment.seatIndex >= seatsPerTable));
}

/**
 * Move everyone `strandedBy` would strand into a free chair of the new
 * configuration, nobody else moving; anyone there is no chair for is left
 * UNSEATED rather than in a chair that does not exist. Returns the roster and
 * how many could not be placed.
 */
export function reseatStranded<T extends SeatHolder>(
  players: readonly T[],
  cfg: { numberOfTables: number; seatsPerTable: number },
): { players: T[]; unseated: number } {
  const stranded = strandedBy(players, cfg);
  if (stranded.length === 0) return { players: [...players], unseated: 0 };
  const ids = new Set(stranded.map(p => p.id));
  const occupied = occupiedChairs(players, ids, cfg.seatsPerTable);
  // occupiedChairs bounds seats, not tables: drop chairs on tables that go.
  for (const key of Array.from(occupied)) {
    if (Number(key.split('-')[0]) >= cfg.numberOfTables) occupied.delete(key);
  }
  const plan = planSeating(stranded.length, cfg, occupied);
  const seats = assignSeats(stranded.length, occupied, plan, cfg);
  let i = 0;
  const next = players.map(p => {
    if (!ids.has(p.id)) return p;
    const seat = seats[i++];
    return seat
      ? { ...p, seated: true, tableAssignment: seat }
      : { ...p, seated: false, tableAssignment: undefined };
  });
  return { players: next, unseated: Math.max(0, stranded.length - seats.length) };
}
