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
  lateEntryLevels?: number;
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

/**
 * The zero-indexed BLIND level the clock is on — the number every window here
 * is measured in, and the one the director reads on the clock.
 *
 * `state.currentLevel` indexes `levels`, and a break is an entry in it, while
 * the clock and the Add Break picker number levels SKIPPING breaks. Handing the
 * raw index to these checks counted every break as a level, so each break
 * before the cutoff closed a rebuy, re-entry or late-entry window one level
 * early, opened add-ons one early, and the late-entry dialog said "level 6"
 * while the clock said 5 (October audit, M10). Every caller passes its index
 * through here; the "+ 1" stays inside this module, as before. During a break
 * this is the level just played, so a window "for the first 4 levels" is still
 * open in the break after level 4.
 */
export function blindLevelIndex(
  levels: ReadonlyArray<{ isBreak?: boolean }> | null | undefined,
  currentLevel: number,
): number {
  if (!levels || levels.length === 0) return currentLevel;
  const played = levels.slice(0, currentLevel + 1).filter(l => !l.isBreak).length;
  return Math.max(0, played - 1);
}

/** The window is still open. `currentLevel` is the zero-indexed BLIND level — see blindLevelIndex. */
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

/**
 * WHY a player cannot rebuy, in the words the director should read.
 *
 * The rule and its wording belong together — the same reason `limitLabel` and
 * `periodLabel` live here rather than at the four sites that print them.
 *
 * This exists because the two render sites disagreed about what to do when
 * `canRebuy` said no. The players list drew the button DISABLED and silent; the
 * seating screen HID it. One state, two treatments, and neither said anything,
 * so a director who had set rebuys to 1 and used it saw a greyed-out button on
 * one screen and nothing at all on the other, with no way to tell whether the
 * rule was working or the app was broken.
 *
 * Returns null when the player may rebuy, so a call site can read
 * `const reason = rebuyUnavailableReason(...)` and use it as both the test and
 * the label.
 *
 * Order matters: the most fundamental reason wins. "Rebuys are off" is a truer
 * answer than "the period ended" for a game that never allowed them.
 */
export function rebuyUnavailableReason(
  structure: EntryLimitStructure | null | undefined,
  player: EntryCounts | null | undefined,
  currentLevel: number,
): string | null {
  if (!structure?.allowRebuys) return 'Rebuys are off';
  if (!underCap(player?.rebuys, structure.maxRebuys)) {
    const max = structure.maxRebuys as number;
    return `Rebuys used (${player?.rebuys || 0} of ${max})`;
  }
  if (!withinPeriod(currentLevel, structure.rebuyPeriodLevels)) {
    return `Rebuy period ended (first ${structure.rebuyPeriodLevels} levels)`;
  }
  return null;
}

/**
 * The rules that apply to a rebuy RIGHT NOW, for the offer made at the bust-out.
 *
 * The positive counterpart to `rebuyUnavailableReason`, and it lives beside it
 * deliberately. `PlayerEntryActions` prints that one when a rebuy is BLOCKED; the
 * dialog prints this one when it is available. Two halves of one question, so
 * their wording has to be written once — "Rebuys used (1 of 3)" and
 * "Rebuys used 1 of 3" drifting apart is exactly what this file exists to stop.
 *
 * It replaced a sentence that explained the thing the director was NOT doing:
 * *"Later they would have to re-enter."* Reported as confusing, and fairly — at
 * the busiest moment of the night it asked them to hold a second concept, with
 * its own cap, window and price, while answering a question about a rebuy.
 *
 * **A row only appears when there is a rule to state**, which is the whole of the
 * logic here:
 *
 * - No cap and no rebuys yet: nothing. There is no limit to report and no history
 *   to report, and `1 of Unlimited` is not English.
 * - No period: nothing. "All game" is the absence of a window, not a window.
 *
 * So an unlimited, all-game tournament adds no rows at all, and one with real
 * limits shows exactly the limits it has — the same instinct that has the Busted
 * strip render nothing when rebuys are switched off for the whole tournament,
 * rather than a row of "Rebuys are off" against every name.
 */
export interface EntryRule {
  label: string;
  value: string;
}

export function rebuyRules(
  structure: EntryLimitStructure | null | undefined,
  player: EntryCounts | null | undefined,
): EntryRule[] {
  const rules: EntryRule[] = [];

  const used = player?.rebuys || 0;
  const capped = !isUnlimited(structure?.maxRebuys);
  if (capped) {
    // Worded to match rebuyUnavailableReason, which says the same thing once the
    // cap is reached.
    rules.push({ label: 'Rebuys used', value: `${used} of ${limitLabel(structure?.maxRebuys)}` });
  } else if (used > 0) {
    rules.push({ label: 'Rebuys used', value: String(used) });
  }

  if (!isUnlimited(structure?.rebuyPeriodLevels)) {
    rules.push({ label: 'Available', value: periodLabel(structure?.rebuyPeriodLevels) });
  }

  return rules;
}

/** The re-entry twin. Same shape, same ordering, same reason for existing. */
export function reEntryUnavailableReason(
  structure: EntryLimitStructure | null | undefined,
  player: EntryCounts | null | undefined,
  currentLevel: number,
): string | null {
  if (!structure?.allowReEntry) return 'Re-entries are off';
  if (!underCap(player?.reEntries, structure.maxReEntries)) {
    const max = structure.maxReEntries as number;
    return `Re-entries used (${player?.reEntries || 0} of ${max})`;
  }
  if (!withinPeriod(currentLevel, structure.reEntryPeriodLevels)) {
    return `Re-entry period ended (first ${structure.reEntryPeriodLevels} levels)`;
  }
  return null;
}

/**
 * Is late entry still open?
 *
 * There is no `allowLateEntry` switch and there should not be: adding a player
 * is always possible, because a director may genuinely need to. The window only
 * bites when it was deliberately set — the same reason
 * `DEFAULT_PRIZE_STRUCTURE` carries no rebuy or re-entry period.
 *
 * Zero and absent mean open all game, like every other limit here.
 */
export function lateEntryOpen(
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
): boolean {
  return withinPeriod(currentLevel, structure?.lateEntryLevels);
}

/**
 * Why late entry is closed, for the confirmation shown before adding anyway.
 *
 * This is a WARNING, not a refusal — the caller adds the player if the director
 * confirms. That is the difference between late entry and its siblings: a
 * rebuy past its cap is a rule the director set about the game, while someone
 * walking through the door late is a fact about the world.
 *
 * What it must not do is stay silent. Tournament Info states this window, and
 * an app that prints a window and then ignores it without comment is the exact
 * omission `rebuyPeriodLevels` and `reEntryPeriodLevels` were for years — see
 * the note at the top of this file.
 */
export function lateEntryClosedReason(
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
): string | null {
  if (lateEntryOpen(structure, currentLevel)) return null;
  return `Late entry closed at the end of level ${structure?.lateEntryLevels}`;
}
