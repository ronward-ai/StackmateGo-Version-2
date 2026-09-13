import { describe, it, expect } from 'vitest';
import {
  isUnlimited, limitLabel, periodLabel, canRebuy, canReEnter, addOnsOpen,
} from './entryLimits';

const rebuysOn = { allowRebuys: true };
const reEntryOn = { allowReEntry: true };

describe('isUnlimited', () => {
  it('treats zero, absent and nonsense as no limit', () => {
    expect(isUnlimited(0)).toBe(true);
    expect(isUnlimited(undefined)).toBe(true);
    expect(isUnlimited(null)).toBe(true);
    expect(isUnlimited(-1)).toBe(true);
    expect(isUnlimited(NaN)).toBe(true);
  });

  it('treats a real cap as a limit', () => {
    expect(isUnlimited(1)).toBe(false);
    expect(isUnlimited(3)).toBe(false);
  });
});

describe('canRebuy', () => {
  it('is false when rebuys are switched off, whatever the cap says', () => {
    expect(canRebuy({ allowRebuys: false, maxRebuys: 10 }, { rebuys: 0 }, 0)).toBe(false);
    expect(canRebuy(undefined, { rebuys: 0 }, 0)).toBe(false);
  });

  // THE BUG. maxRebuys 0 is how the Buy-in tab stores "unlimited"; `|| 3` made
  // it three. A director who asked for unlimited got three rebuys.
  it('lets a player rebuy forever when the cap is zero', () => {
    expect(canRebuy({ ...rebuysOn, maxRebuys: 0 }, { rebuys: 3 }, 0)).toBe(true);
    expect(canRebuy({ ...rebuysOn, maxRebuys: 0 }, { rebuys: 99 }, 0)).toBe(true);
  });

  it('lets a player rebuy forever when the cap is absent', () => {
    expect(canRebuy(rebuysOn, { rebuys: 50 }, 0)).toBe(true);
  });

  it('stops at a real cap', () => {
    const s = { ...rebuysOn, maxRebuys: 2 };
    expect(canRebuy(s, { rebuys: 0 }, 0)).toBe(true);
    expect(canRebuy(s, { rebuys: 1 }, 0)).toBe(true);
    expect(canRebuy(s, { rebuys: 2 }, 0)).toBe(false);
    expect(canRebuy(s, { rebuys: 3 }, 0)).toBe(false);
  });

  it('counts an absent rebuy count as none used', () => {
    expect(canRebuy({ ...rebuysOn, maxRebuys: 1 }, {}, 0)).toBe(true);
    expect(canRebuy({ ...rebuysOn, maxRebuys: 1 }, null, 0)).toBe(true);
  });

  // Levels are zero-indexed in state and one-indexed on screen. A period of 3
  // covers displayed levels 1, 2 and 3 — state indices 0, 1 and 2.
  it('closes the window once the rebuy period has passed', () => {
    const s = { ...rebuysOn, rebuyPeriodLevels: 3 };
    expect(canRebuy(s, { rebuys: 0 }, 0)).toBe(true);  // level 1
    expect(canRebuy(s, { rebuys: 0 }, 2)).toBe(true);  // level 3
    expect(canRebuy(s, { rebuys: 0 }, 3)).toBe(false); // level 4
  });

  it('treats a zero or absent period as all game', () => {
    expect(canRebuy({ ...rebuysOn, rebuyPeriodLevels: 0 }, { rebuys: 0 }, 40)).toBe(true);
    expect(canRebuy(rebuysOn, { rebuys: 0 }, 40)).toBe(true);
  });

  it('needs both the cap and the period', () => {
    const s = { ...rebuysOn, maxRebuys: 2, rebuyPeriodLevels: 3 };
    expect(canRebuy(s, { rebuys: 1 }, 1)).toBe(true);
    expect(canRebuy(s, { rebuys: 2 }, 1)).toBe(false); // capped
    expect(canRebuy(s, { rebuys: 1 }, 9)).toBe(false); // too late
  });
});

describe('canReEnter', () => {
  it('is false when re-entry is switched off', () => {
    expect(canReEnter({ allowReEntry: false, maxReEntries: 5 }, {}, 0)).toBe(false);
  });

  // The old `?? 99` kept the zero and read it as "none allowed", while the two
  // info cards printed a cap only when it was above zero and read the same zero
  // as "unlimited". Zero now means unlimited, the same as everywhere else.
  it('reads a zero cap as unlimited, not as none', () => {
    expect(canReEnter({ ...reEntryOn, maxReEntries: 0 }, { reEntries: 7 }, 0)).toBe(true);
  });

  it('stops at a real cap', () => {
    const s = { ...reEntryOn, maxReEntries: 1 };
    expect(canReEnter(s, { reEntries: 0 }, 0)).toBe(true);
    expect(canReEnter(s, { reEntries: 1 }, 0)).toBe(false);
  });

  it('closes the window once the re-entry period has passed', () => {
    const s = { ...reEntryOn, reEntryPeriodLevels: 4 };
    expect(canReEnter(s, {}, 3)).toBe(true);  // level 4
    expect(canReEnter(s, {}, 4)).toBe(false); // level 5
  });

  it('counts rebuys and re-entries separately', () => {
    const s = { ...reEntryOn, maxReEntries: 1 };
    expect(canReEnter(s, { rebuys: 9, reEntries: 0 }, 0)).toBe(true);
  });
});

describe('addOnsOpen', () => {
  // The opposite sense: addonAvailableLevel is when add-ons START.
  it('opens from the configured level onwards', () => {
    const s = { allowAddons: true, addonAvailableLevel: 6 };
    expect(addOnsOpen(s, 4)).toBe(false); // level 5
    expect(addOnsOpen(s, 5)).toBe(true);  // level 6
    expect(addOnsOpen(s, 20)).toBe(true);
  });

  it('opens from the start when no level is set', () => {
    expect(addOnsOpen({ allowAddons: true }, 0)).toBe(true);
    expect(addOnsOpen({ allowAddons: true, addonAvailableLevel: 0 }, 0)).toBe(true);
  });

  it('is false when add-ons are switched off', () => {
    expect(addOnsOpen({ allowAddons: false, addonAvailableLevel: 1 }, 9)).toBe(false);
  });
});

describe('labels', () => {
  it('says unlimited rather than printing a zero', () => {
    expect(limitLabel(0)).toBe('Unlimited');
    expect(limitLabel(undefined)).toBe('Unlimited');
    expect(limitLabel(3)).toBe('3');
  });

  it('says all game rather than "first 0 levels"', () => {
    expect(periodLabel(0)).toBe('All game');
    expect(periodLabel(undefined)).toBe('All game');
    expect(periodLabel(3)).toBe('First 3 levels');
  });
});
