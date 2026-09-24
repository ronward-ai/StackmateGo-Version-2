/**
 * Whether the tables are uneven enough to be worth saying so, and what a
 * dismissal of that prompt is latched against.
 *
 * The detection used to live inline in `TablesSection`, where it could not be
 * tested at all — and the prompt built on it had a bug that made it impossible
 * to dismiss. `tableBalanceDialogOpen` was BOTH the effect's early-return guard
 * and one of its dependencies, so pressing "Ignore for now" set it false, the
 * dependency changed, the effect re-ran, the guard no longer blocked, the
 * imbalance was of course still there — because ignoring an imbalance does not
 * fix it — and the dialog reopened immediately. A director trying to go and
 * rebuy the player whose bust-out caused the imbalance could not get past it.
 *
 * A flag that both suppresses an effect and is watched by it is a loop. The
 * dismissal is latched against WHAT WAS DISMISSED instead — see `imbalanceKey`.
 */

/** Only what balance decisions need. A `Player` satisfies it. */
export interface SeatedPlayer {
  isActive?: boolean;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number };
}

export interface Imbalance {
  overloadedTable: number;
  underloadedTable: number;
  /** How many more players the fullest table has than the emptiest. */
  gap: number;
}

/**
 * Two or more players' difference between the fullest and emptiest table.
 *
 * Two is the threshold because ONE is not an imbalance: with an odd number of
 * players across two tables somebody has to sit at the bigger one, and
 * prompting for that would fire on a table that cannot be balanced.
 */
export const BALANCE_THRESHOLD = 2;

export function imbalance(players: SeatedPlayer[] | null | undefined): Imbalance | null {
  const seated = (players ?? []).filter(p => p.seated && p.isActive !== false && p.tableAssignment);
  if (seated.length < 2) return null;

  const counts = new Map<number, number>();
  for (const player of seated) {
    const table = player.tableAssignment!.tableIndex;
    counts.set(table, (counts.get(table) ?? 0) + 1);
  }
  if (counts.size < 2) return null;

  let fullest = -1, emptiest = -1, most = -Infinity, fewest = Infinity;
  // Ascending table order, so the same imbalance always names the same tables
  // and the dismissal key below is stable.
  for (const table of [...counts.keys()].sort((a, b) => a - b)) {
    const n = counts.get(table)!;
    if (n > most) { most = n; fullest = table; }
    if (n < fewest) { fewest = n; emptiest = table; }
  }

  const gap = most - fewest;
  if (gap < BALANCE_THRESHOLD) return null;
  return { overloadedTable: fullest, underloadedTable: emptiest, gap };
}

/**
 * What a dismissal remembers, so "Ignore for now" stays ignored.
 *
 * Keyed on the imbalance itself rather than on a bare "dismissed" boolean: the
 * same imbalance stays dismissed however many times the roster is touched, and
 * a DIFFERENT one re-arms the prompt, because that is a new question the
 * director has not answered yet.
 */
export function imbalanceKey(result: Imbalance | null | undefined): string | null {
  if (!result) return null;
  return `${result.overloadedTable}>${result.underloadedTable}:${result.gap}`;
}

/** Has this exact imbalance already been waved away? */
export function imbalanceDismissed(
  dismissedKey: string | null,
  result: Imbalance | null | undefined,
): boolean {
  const key = imbalanceKey(result);
  return key !== null && dismissedKey === key;
}
