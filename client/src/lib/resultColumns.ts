import { money } from '@/lib/currency';
import type { ResultRow, ResultPlayerLike } from '@/lib/resultRows';

/**
 * The columns a tournament's results can show, and what each one says.
 *
 * **Why a table at all.** The results were a rank badge followed by a strip of
 * chips, and the standings beside them were a grid — and the grid reads far
 * better, for a reason that is structural rather than cosmetic: every row has
 * the same shape, so the eye compares down a column. A chip strip changes width
 * and order per player and nothing lines up. This is the per-night counterpart
 * to the standings' `STAT_LABELS` + `getPlayerStat` pair.
 *
 * **It could not reuse the standings' machinery, and the reason is worth
 * knowing before anyone tries.** All of that persists through `leagueSettings`
 * documents keyed on `defaultSettingsDocId(userId, leagueId)`, and the save
 * returns early with no league — so a STANDALONE tournament could never
 * configure a column, which is exactly the game where this matters most. (The
 * `leagueId: null` path is worse than useless: it lists every settings document
 * a director owns, unfiltered.) And roughly ten of the twenty-five league stats
 * — Games, Avg. Points, Attendance, Streak, Final Tables — are aggregates over a
 * season and mean nothing about one night.
 *
 * Pure and React-free per the lib/ convention, so the console, the participant's
 * phone and the exported image all read the same accessor. Building a second
 * column list for the export is precisely how the rake formula reached nine
 * sites, and `RealTimeLeagueTable`'s own CSV already makes this trade.
 */

export type ResultColumnKey =
  | 'knockouts' | 'bounties' | 'bountyMoney'
  | 'rebuys' | 'reEntries' | 'addons'
  | 'invested' | 'prize' | 'won' | 'profit'
  | 'points' | 'seat' | 'eliminatedBy';

/**
 * A prize-structure switch a column depends on.
 *
 * **A feature switched off for the whole tournament renders nothing** — the rule
 * the Busted strip already follows, in CLAUDE.md's words, rather than a row of
 * "Rebuys are off" against every player. A game with bounties disabled prints no
 * bounty column even if the key is enabled, which is what makes a dozen
 * configurable columns usable by a director who never opens the picker.
 *
 * Keyed on the SETTING, never on the data. A rebuy column of zeros in a game
 * that allowed rebuys is information — nobody rebought — and hiding a column
 * because tonight happened to be quiet would make the same tournament print a
 * different table from one week to the next.
 */
type Requires = 'bounties' | 'rebuys' | 'reEntries' | 'addons' | 'league';

export interface ResultColumn {
  key: ResultColumnKey;
  label: string;
  /** Figures right-align so a column of them reads as a column. */
  align: 'left' | 'right';
  /** True for anything set in the mono face. */
  numeric: boolean;
  requires?: Requires;
  value: (row: ResultRow<ResultPlayerLike>, symbol: string) => string;
}

/** A dash, not a zero: a column that does not apply to this player is blank. */
const DASH = '–';

const count = (n: number) => (n > 0 ? String(n) : DASH);
const cash = (n: number, sym: string) => (n > 0 ? money(n, sym) : DASH);

/**
 * Every column, in the order the picker offers them.
 *
 * Rank and player name are deliberately absent: they are the row's identity, not
 * a statistic, exactly as `#` and Player are fixed in the standings.
 */
export const RESULT_COLUMNS: ResultColumn[] = [
  {
    key: 'knockouts', label: "KO's", align: 'right', numeric: true,
    value: r => count(r.stats.knockouts),
  },
  {
    key: 'bounties', label: 'Bounties', align: 'right', numeric: true, requires: 'bounties',
    value: r => count(r.stats.bountiesCollected),
  },
  {
    key: 'bountyMoney', label: 'Bounty', align: 'right', numeric: true, requires: 'bounties',
    value: (r, sym) => cash(r.stats.bountyMoney, sym),
  },
  {
    key: 'rebuys', label: 'Rebuys', align: 'right', numeric: true, requires: 'rebuys',
    value: r => count(r.stats.rebuys),
  },
  {
    key: 'reEntries', label: 'Re-entries', align: 'right', numeric: true, requires: 'reEntries',
    value: r => count(r.stats.reEntries),
  },
  {
    key: 'addons', label: 'Add-ons', align: 'right', numeric: true, requires: 'addons',
    value: r => count(r.stats.addons),
  },
  {
    key: 'invested', label: 'Invested', align: 'right', numeric: true,
    value: (r, sym) => cash(r.stats.invested, sym),
  },
  {
    key: 'prize', label: 'Prize', align: 'right', numeric: true,
    value: (r, sym) => cash(r.stats.prize, sym),
  },
  {
    key: 'won', label: 'Won', align: 'right', numeric: true,
    value: (r, sym) => cash(r.stats.won, sym),
  },
  {
    key: 'profit', label: 'Profit', align: 'right', numeric: true,
    // The signed form the standings already use, so one league's two tables
    // spell a figure the same way.
    value: (r, sym) => {
      const p = r.stats.profit;
      if (!p) return DASH;
      return `${p >= 0 ? '+' : ''}${money(p, sym)}`;
    },
  },
  {
    key: 'points', label: 'Points', align: 'right', numeric: true, requires: 'league',
    value: r => count(r.stats.points),
  },
  {
    key: 'seat', label: 'Seat', align: 'right', numeric: true,
    value: r => (r.stats.seat
      ? `T${r.stats.seat.tableIndex + 1}·S${r.stats.seat.seatIndex + 1}`
      : DASH),
  },
  {
    key: 'eliminatedBy', label: 'Out to', align: 'left', numeric: false,
    value: r => r.stats.eliminatedByName || DASH,
  },
];

const BY_KEY = new Map(RESULT_COLUMNS.map(c => [c.key, c]));

/**
 * What a game shows when the director has never chosen.
 *
 * Short on purpose — the standings' own default is two columns, and a wall of
 * them on first use is what makes a feature look like work. Points is in the
 * list and simply does not survive the league gate for a standalone game.
 */
export const DEFAULT_RESULT_COLUMNS: ResultColumnKey[] = ['knockouts', 'rebuys', 'points', 'won'];

export interface ColumnContext {
  prizeStructure?: {
    enableBounties?: boolean;
    allowRebuys?: boolean;
    allowReEntry?: boolean;
    allowAddons?: boolean;
  } | null;
  isLeagueMode?: boolean;
}

function available(requires: Requires | undefined, ctx: ColumnContext): boolean {
  if (!requires) return true;
  const ps = ctx.prizeStructure || {};
  switch (requires) {
    case 'bounties': return ps.enableBounties === true;
    case 'rebuys': return ps.allowRebuys === true;
    case 'reEntries': return ps.allowReEntry === true;
    case 'addons': return ps.allowAddons === true;
    case 'league': return ctx.isLeagueMode === true;
  }
}

/**
 * The columns this game actually draws, in the director's order.
 *
 * **One ordered array of enabled keys, deliberately — not the standings' pair of
 * a boolean map plus a separate order list.** Those two can disagree, and
 * visibly do: the ↑/↓ buttons there step through all twenty-five keys including
 * the disabled ones, so moving an enabled column past a block of hidden ones
 * takes several presses and appears to do nothing at all. A single array cannot
 * have that bug.
 *
 * **An unknown key is dropped rather than rendered.** Settings travel: they sync
 * to the account, ride into the tournament document and reach a participant's
 * phone, so a key written by a newer build will arrive at an older one. A column
 * nobody can resolve must be absent, never a header with an empty cell under it.
 */
export function visibleResultColumns(
  chosen: readonly string[] | null | undefined,
  ctx: ColumnContext = {},
): ResultColumn[] {
  const keys = chosen && chosen.length ? chosen : DEFAULT_RESULT_COLUMNS;
  const seen = new Set<string>();
  const out: ResultColumn[] = [];
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const col = BY_KEY.get(key as ResultColumnKey);
    if (!col) continue;
    if (!available(col.requires, ctx)) continue;
    out.push(col);
  }
  return out;
}

/**
 * Every column the picker should offer for THIS game, so a director is not shown
 * a switch for a feature they have turned off.
 */
export function offerableResultColumns(ctx: ColumnContext = {}): ResultColumn[] {
  return RESULT_COLUMNS.filter(c => available(c.requires, ctx));
}

/**
 * Move one column up or down in the stored order.
 *
 * Exported so the picker has no arithmetic of its own, and so a test can pin the
 * ends — the standings' version silently does nothing at the boundaries, which
 * reads as a dead button.
 */
export function moveColumn(
  order: readonly string[],
  key: string,
  direction: -1 | 1,
  /**
   * Which keys a swap may land on. Defaults to all of them.
   *
   * **This exists because the picker reorders the STORED array, which can hold
   * keys that are not on screen right now** — a bounty column in a game with
   * bounties switched off. Swapping blindly with the adjacent entry would then
   * trade places with something invisible and the row would not move, which is
   * exactly the league picker's fault that this module's header mocks: there the
   * arrows step through all twenty-five keys including the hidden ones, so a
   * press can appear to do nothing at all.
   *
   * So the swap skips to the nearest neighbour that is itself visible. The
   * hidden keys keep their places relative to everything else and a press always
   * moves the row the director is looking at.
   */
  canSwapWith: (key: string) => boolean = () => true,
): string[] {
  const next = [...order];
  const i = next.indexOf(key);
  if (i < 0) return next;

  let j = i + direction;
  while (j >= 0 && j < next.length && !canSwapWith(next[j])) j += direction;
  if (j < 0 || j >= next.length) return next;

  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Turn a column on or off, keeping it where it sits in the order. */
export function toggleColumn(
  order: readonly string[],
  key: ResultColumnKey,
  on: boolean,
): string[] {
  if (!on) return order.filter(k => k !== key);
  if (order.includes(key)) return [...order];

  // A newly enabled column lands at its CANONICAL position relative to the
  // columns already shown, and the existing order is otherwise left alone.
  //
  // Sorting the whole array instead would be the obvious one-liner and would
  // throw away a director's arrangement every time they ticked a box — the
  // control quietly undoing the control beside it.
  const canonical = RESULT_COLUMNS.map(c => c.key as string);
  const rank = (k: string) => {
    const i = canonical.indexOf(k);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const at = order.findIndex(k => rank(k) > rank(key));
  const next = [...order];
  next.splice(at < 0 ? next.length : at, 0, key);
  return next;
}
