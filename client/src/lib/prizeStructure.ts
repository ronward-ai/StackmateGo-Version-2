import type { PrizeStructure } from '@/types';

/**
 * The prize structure a game starts with, in one place.
 *
 * There were two, and they disagreed. `useTournament`'s defaults said rebuys
 * were ON, capped at 3, with a 5-level window and a 60/30/10 payout. The Buy-in
 * tab's own `useState` defaults said rebuys were OFF, uncapped, with a 3-level
 * window and a 50/30/20 payout — and its loader spelled a THIRD set of fallbacks
 * for fields absent from a stored structure (`p.maxRebuys || 0` against the
 * engine's `|| 3`). So a game run from the defaults advertised one payout split
 * on the Payouts panel and paid another, and the tab reported a cap the engine
 * did not use.
 *
 * The engine's values won, because they are what games have actually been run
 * with — the tab now displays the truth rather than a different guess.
 *
 * TWO DELIBERATE CHANGES from the old engine defaults:
 *
 *  - **No rebuy or re-entry period.** Those fields are now enforced (see
 *    lib/entryLimits.ts); they never were before. Shipping a default of 5 would
 *    have closed rebuys at level 6 on games whose directors never chose that,
 *    which is a restriction arriving as a surprise. Absent means all game, and a
 *    director who wants a window sets one.
 *  - **`maxReEntries` is absent, meaning unlimited**, matching the `?? 99` the
 *    table view used to spell — not the `0` that the Buy-in tab's own default
 *    would now read as unlimited anyway. Same answer, stated once.
 *
 * Never write `structure` — see `payoutsOf()` in lib/payoutTemplates.ts. This
 * default used to, and a game run straight from it advertised 60/30/10 and then
 * paid nobody.
 */
export const DEFAULT_PRIZE_STRUCTURE: PrizeStructure = {
  buyIn: 10,
  rebuyAmount: 10,
  addonAmount: 0,
  allowRebuys: true,
  maxRebuys: 3,
  allowAddons: false,
  allowReEntry: false,
  startingChips: 10000,
  rebuyChips: 10000,
  addonChips: 10000,
  addonAvailableLevel: 6,
  manualPayouts: [
    { position: 1, percentage: 60 },
    { position: 2, percentage: 30 },
    { position: 3, percentage: 10 },
  ],
};

/**
 * A fresh copy, so a caller mutating what it got cannot reach back into the
 * shared constant — `manualPayouts` is an array of objects and the Buy-in tab
 * edits it in place.
 */
export function defaultPrizeStructure(): PrizeStructure {
  return {
    ...DEFAULT_PRIZE_STRUCTURE,
    manualPayouts: DEFAULT_PRIZE_STRUCTURE.manualPayouts?.map(p => ({ ...p })),
  };
}
