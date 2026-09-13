/**
 * Who may buy back in, and until when.
 *
 * There is one rule and it is stated here once: **zero means unlimited**, for
 * both the cap and the period. An absent value means the same thing.
 *
 * That rule existed only in the Buy-in tab's head before. `maxRebuys` was read
 * at three sites, each spelling the fallback `|| 3` — and `0` is exactly how the
 * Buy-in tab stores "unlimited", with an `∞` placeholder and a summary line
 * reading `Max: {maxRebuys || 'unlimited'}`. `0 || 3` is `3`, so **a director who
 * set rebuys to unlimited got three.** Re-entries had the mirror bug with a
 * different operator, `maxReEntries ?? 99`, which keeps the zero and therefore
 * read it as "none allowed" — while the two info cards printed a cap only when
 * it was above zero and therefore read the same zero as "unlimited".
 *
 * One number, three meanings, four files. Hence one module.
 *
 * The periods are new here in a second sense: `rebuyPeriodLevels` and
 * `reEntryPeriodLevels` were edited in the Buy-in tab, saved, reloaded, and
 * printed as a promise — "Available during first 3 levels" — that nothing in the
 * app ever checked. Their sibling `addonAvailableLevel` WAS enforced, which is
 * what makes the other two an omission rather than a decision. The engine also
 * never enforced `maxReEntries` at all; only the table view's button hid.
 *
 * LEVELS ARE ZERO-INDEXED in state and one-indexed on screen. Everything here
 * takes the raw `state.currentLevel` and does the `+ 1` internally, so no caller
 * has to remember — the add-on check at the one site that already worked spelled
 * it `(state.currentLevel + 1) >= addonAvailableLevel` inline, which is precisely
 * the kind of detail that gets copied wrong on the fourth call site.
 */

/** Only the fields that decide entry limits. Keeps callers free to pass a whole
 *  PrizeStructure, or a partial one, or the participant view's structural copy. */
export interface EntryLimitStructure {
  allowRebuys?: boolean;
  maxRebuys?: number;
  rebuyPeriodLevels?: number;
  allowReEntry?: boolean;
  maxReEntries?: number;
  reEntryPeriodLevels?: number;
  allowAddons?: boolean;
  addonAvailableLevel?: number;
}

/** Only the counts. A `Player` satisfies it; so does `{}`. */
export interface EntryCounts {
  rebuys?: number;
  reEntries?: number;
}

/**
 * Zero, negative and absent all mean "no limit".
 *
 * Negative is folded in deliberately: a number input that has been cleared and
 * retyped can pass through `-0` or a stray minus, and "unlimited" is the safer
 * reading of a nonsense cap than "none allowed".
 */
export function isUnlimited(limit: number | null | undefined): boolean {
  return limit === null || limit === undefined || !Number.isFinite(limit) || limit <= 0;
}

/** How a cap should be described in the interface. One spelling, four call sites. */
export function limitLabel(limit: number | null | undefined): string {
  return isUnlimited(limit) ? 'Unlimited' : String(limit);
}

/** How a period should be described. */
export function periodLabel(levels: number | null | undefined): string {
  return isUnlimited(levels) ? 'All game' : `First ${levels} levels`;
}

/** `used` is still under `max`, where an unlimited max is never reached. */
function underCap(used: number | null | undefined, max: number | null | undefined): boolean {
  if (isUnlimited(max)) return true;
  return (used || 0) < (max as number);
}

/** The window is still open. `currentLevel` is the zero-indexed state value. */
function withinPeriod(currentLevel: number, periodLevels: number | null | undefined): boolean {
  if (isUnlimited(periodLevels)) return true;
  return currentLevel + 1 <= (periodLevels as number);
}

/**
 * May this player rebuy?
 *
 * Does NOT ask whether they are eliminated — that is the caller's business and
 * differs by site: `processRebuy` checks `isActive !== false` itself, while the
 * table view tests it to decide whether to draw a button at all.
 */
export function canRebuy(
  structure: EntryLimitStructure | null | undefined,
  player: EntryCounts | null | undefined,
  currentLevel: number,
): boolean {
  if (!structure?.allowRebuys) return false;
  return underCap(player?.rebuys, structure.maxRebuys)
    && withinPeriod(currentLevel, structure.rebuyPeriodLevels);
}

/** May this player re-enter? */
export function canReEnter(
  structure: EntryLimitStructure | null | undefined,
  player: EntryCounts | null | undefined,
  currentLevel: number,
): boolean {
  if (!structure?.allowReEntry) return false;
  return underCap(player?.reEntries, structure.maxReEntries)
    && withinPeriod(currentLevel, structure.reEntryPeriodLevels);
}

/**
 * Are add-ons open?
 *
 * Note the sense is the opposite of the other two: `addonAvailableLevel` is when
 * add-ons START, not when they stop. An absent or zero value means "from the
 * beginning", which is what the previous `?? 1` spelling achieved.
 */
export function addOnsOpen(
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
): boolean {
  if (!structure?.allowAddons) return false;
  const from = structure.addonAvailableLevel;
  if (isUnlimited(from)) return true;
  return currentLevel + 1 >= (from as number);
}
