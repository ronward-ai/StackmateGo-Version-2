import { freeSeatAt, tablesNeededFor } from '@/lib/seating';

/**
 * Breaking a table: when the field has shrunk enough to play on fewer of them,
 * which one goes, and where its players sit instead.
 *
 * **The other half of the final table.** `lib/finalTable.ts` asks "should we
 * consolidate onto ONE table"; this asks the same question at every size above
 * it. Three tables of eight and sixteen players left is plainly a two-table
 * tournament, and the app said nothing at all — it only ever spoke up at eight.
 *
 * The mechanism half-existed and was never offered. `TablesSection` carried a
 * `breakTable(breakIdx)` behind a small icon in each table header, which a
 * director had to notice and know the meaning of. It also:
 *
 * - never lowered `settings.tables.numberOfTables`, so the table it broke went
 *   on rendering as an empty felt with all its seats;
 * - never renumbered, so breaking the middle table of three left players on
 *   table 3 while only tables 1 and 2 were meant to be in play;
 * - snapshotted nothing, so there was no undo;
 * - read `seatsPerTable` from a second source, defaulting to 9 where the
 *   component's own state defaulted to 6 — one fact, two spellings;
 * - and lived inline in a component, so it had no test and could not have one.
 *   That is the argument `lib/tableBalance.ts` and `lib/seating.ts` were both
 *   extracted on, and the reason this is a module rather than a tidier function
 *   in the same place.
 *
 * Kept free of React and Firebase, per the lib/ convention.
 */

/** Only what breaking a table needs. A `Player` satisfies it. */
export interface BreakablePlayer {
  id: string;
  isActive?: boolean;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
}

function tableCount(n: number): number {
  return Math.max(1, Math.floor(n) || 1);
}

/**
 * How many players are sitting at each table, table 0 first.
 *
 * Active and seated only — a busted player holds no chair, here as everywhere.
 * Indices outside the configured range are ignored rather than counted: a
 * player orphaned on a table that no longer exists is a real state (typing the
 * Tables field down by hand produces it) and must not make a table that IS in
 * play look occupied.
 */
export function tableOccupancy(
  players: BreakablePlayer[] | null | undefined,
  numberOfTables: number,
): number[] {
  const tables = tableCount(numberOfTables);
  const counts = new Array<number>(tables).fill(0);
  for (const p of players || []) {
    if (p.isActive === false || !p.seated) continue;
    const t = p.tableAssignment?.tableIndex;
    if (typeof t === 'number' && t >= 0 && t < tables) counts[t]++;
  }
  return counts;
}

/**
 * Which table should break?
 *
 * **The emptiest**, so the fewest people are moved — the whole point of a break
 * over a redraw. Ties go to the HIGHEST index, which is the table a director
 * added last and the one they are least attached to.
 *
 * A table with nobody on it is the ideal answer, not an excluded one: breaking
 * it moves no one and simply drops the count.
 */
export function tableToBreak(
  players: BreakablePlayer[] | null | undefined,
  numberOfTables: number,
): number | null {
  const counts = tableOccupancy(players, numberOfTables);
  if (counts.length < 2) return null;

  let chosen = 0;
  // `<=` rather than `<` is what makes a tie go to the highest index. A mutant
  // narrowing it to `<` picks the lowest, which is table 1 — the one most
  // likely to be the feature table.
  for (let t = 1; t < counts.length; t++) if (counts[t] <= counts[chosen]) chosen = t;
  return chosen;
}

/**
 * Is the field already sitting at `target` tables or fewer?
 *
 * The generalisation of `lib/finalTable.ts`'s `alreadyAtOneTable`, and
 * conservative for the same reason: an active player with no chair, or seated
 * with no table, makes this FALSE. A director who is not using the seating
 * chart must still be asked, or a question that is genuinely due gets
 * suppressed.
 */
export function alreadyAtTables(
  players: BreakablePlayer[] | null | undefined,
  target: number,
): boolean {
  const active = (players || []).filter(p => p.isActive !== false);
  if (active.length === 0) return false;

  const used = new Set<number>();
  for (const p of active) {
    if (!p.seated) return false;
    const t = p.tableAssignment?.tableIndex;
    if (typeof t !== 'number') return false;
    used.add(t);
  }
  return used.size <= target;
}

/**
 * Should the director be asked to break a table, and down to how many?
 *
 * Returns the table count to go to, or null.
 *
 * **It deliberately says nothing about the FINAL table.** `needed === 1` is
 * `shouldPromptForFinalTable`'s question, and that predicate carries things
 * this one has no business duplicating — the stored `isFinalTable` flag read
 * preferred-then-derived, and the `<=` that a real bug turned on. Two
 * predicates answering one question at overlapping sizes is how the prompt
 * would fire twice for one bust-out.
 *
 * `eliminatedAtLeastOne` is the same guard the final table uses, and for the
 * same reason: without it a tournament that simply starts with more tables than
 * it needs is asked to break one before a hand is dealt.
 *
 * `tablesNeededFor` comes from `lib/seating.ts` rather than a second ceil here.
 * It already clamps, and it is what the Seat Players dialog offers tables with,
 * so the two cannot disagree about how many a field needs.
 */
export function consolidationDue(
  players: BreakablePlayer[] | null | undefined,
  { numberOfTables, seatsPerTable }: { numberOfTables: number; seatsPerTable: number },
): number | null {
  const roster = players || [];
  const active = roster.filter(p => p.isActive !== false).length;
  if (active < 2) return null;
  if (!roster.some(p => p.isActive === false)) return null;

  const tables = tableCount(numberOfTables);
  const needed = tablesNeededFor(active, seatsPerTable);

  // The final table is a different question, asked by a different predicate.
  if (needed < 2) return null;
  if (needed >= tables) return null;
  // Nobody has to move, so there is nothing to ask about. The stray table count
  // is tidied by the action when it does run, not by nagging about it.
  if (alreadyAtTables(roster, needed)) return null;

  return needed;
}

/** Drop one entry from a per-table list — names, felts — so it moves with its table. */
export function reindexAfterBreak<T>(items: readonly T[] | undefined, brokenIndex: number): T[] {
  return (items || []).filter((_, i) => i !== brokenIndex);
}

export interface BreakResult<T> {
  players: T[];
  /** The table that was broken, for reindexing names and felts alongside. */
  broken: number;
  /** The table count afterwards. */
  tables: number;
}

/**
 * Break one table: move its players onto the others, then renumber.
 *
 * **Only the broken table's players move.** Everybody else keeps the chair they
 * were already in, which is what a cardroom does — and the difference from the
 * final table, whose full random redraw is correct precisely because a final
 * table draw is supposed to be random.
 *
 * Each one goes to the emptiest remaining table that has a free chair, recounted
 * after every placement so the load spreads instead of filling one table first.
 * `freeSeatAt` finds the chair, rather than a second empty-seat scan: **anyone
 * who cannot be placed is left `seated: false`** and never handed a seat index
 * beyond the table, which is the rule the 17-player ghost established.
 *
 * **The renumber is why breaking the middle table is safe.** `settings.tables`
 * stores a COUNT, not a set, and every render walks `0..numberOfTables-1` — so
 * "tables 1 and 3" cannot be expressed, and leaving players on index 2 of a
 * two-table game would draw them nowhere, with no KO button and out of reach of
 * Move mode. Everything above the broken index shifts down one.
 *
 * A player still carrying a stale chair at the broken table and NOT moved — a
 * busted one, who holds no chair anywhere — is unseated rather than shifted, so
 * the index they keep cannot come to mean a different table.
 */
export function breakTable<T extends BreakablePlayer>(
  players: T[],
  { numberOfTables, seatsPerTable, broken }: { numberOfTables: number; seatsPerTable: number; broken: number },
): BreakResult<T> {
  const tables = tableCount(numberOfTables);
  const seats = Math.max(1, Math.floor(seatsPerTable) || 1);
  const brokenIdx = Math.max(0, Math.min(tables - 1, Math.floor(broken) || 0));

  const onBroken = (p: BreakablePlayer) => p.tableAssignment?.tableIndex === brokenIdx;
  const moving = players.filter(p => p.isActive !== false && p.seated && onBroken(p));

  // Everyone on that table comes off first — including a busted player holding a
  // stale chair — so freeSeatAt below cannot hand out a seat it is still in.
  let updated: T[] = players.map(p =>
    onBroken(p) ? { ...p, seated: false, tableAssignment: undefined } : p
  );

  const remaining: number[] = [];
  for (let t = 0; t < tables; t++) if (t !== brokenIdx) remaining.push(t);

  for (const player of moving) {
    const counts = tableOccupancy(updated, tables);
    // Recounted each time, or everybody lands on whichever table was emptiest
    // when the break started.
    const order = [...remaining].sort((a, b) => counts[a] - counts[b] || a - b);

    let seat: { tableIndex: number; seatIndex: number } | null = null;
    for (const t of order) {
      const found = freeSeatAt(updated, t, seats);
      if (found) { seat = found; break; }
    }
    if (!seat) continue; // Unseated, honestly. Never a chair that does not exist.

    const taken = seat;
    updated = updated.map(p => p.id === player.id
      ? { ...p, seated: true, tableAssignment: taken }
      : p);
  }

  const shifted = updated.map(p => {
    const t = p.tableAssignment?.tableIndex;
    if (typeof t !== 'number' || t <= brokenIdx) return p;
    return { ...p, tableAssignment: { tableIndex: t - 1, seatIndex: p.tableAssignment!.seatIndex } };
  });

  return { players: shifted, broken: brokenIdx, tables: Math.max(1, tables - 1) };
}
