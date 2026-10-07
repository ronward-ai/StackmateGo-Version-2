import { describe, it, expect } from 'vitest';
import { DEFAULT_PRIZE_STRUCTURE, defaultPrizeStructure } from './prizeStructure';
import { payoutsOf } from './payoutTemplates';

describe('the one default prize structure (Oct coverage)', () => {
  it('pays out through manualPayouts, never the dead `structure` field', () => {
    expect((DEFAULT_PRIZE_STRUCTURE as any).structure).toBeUndefined();
    expect(payoutsOf(DEFAULT_PRIZE_STRUCTURE).reduce((s, p) => s + p.percentage, 0)).toBe(100);
  });

  it('sets no rebuy, re-entry or late-entry window — absent means all game', () => {
    const d = DEFAULT_PRIZE_STRUCTURE as any;
    expect(d.rebuyPeriodLevels).toBeUndefined();
    expect(d.reEntryPeriodLevels).toBeUndefined();
    expect(d.lateEntryLevels).toBeUndefined();
  });

  it('hands out a copy a caller can mutate safely', () => {
    const copy = defaultPrizeStructure();
    copy.manualPayouts![0].percentage = 99;
    expect(DEFAULT_PRIZE_STRUCTURE.manualPayouts![0].percentage).toBe(60);
  });
});
