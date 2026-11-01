import { describe, it, expect } from 'vitest';
import {
  chipsInPlay, smallestChip, stackBreakdown, stacksAvailable, shortageNote, colourUps, colourUpLabel, colourUpNotice, type Chip,
} from './chipSet';
import type { BlindLevel } from '@/types';

const set: Chip[] = [
  { colour: 'Black', value: 1000, count: 100 },
  { colour: 'Red', value: 25, count: 100 },
  { colour: 'Green', value: 500, count: 100 },
  { colour: 'White', value: 100, count: 200 },
];
const total = (parts: ReturnType<typeof stackBreakdown>) => (parts ?? []).reduce((s, p) => s + p.chip.value * p.n, 0);

describe('chipsInPlay / smallestChip', () => {
  it('sorts smallest first and drops a chip worth nothing', () => {
    expect(chipsInPlay([...set, { colour: 'Pink', value: 0 }]).map(c => c.value)).toEqual([25, 100, 500, 1000]);
    expect(smallestChip(set)).toBe(25);
    expect(smallestChip([])).toBeNull();
    expect(smallestChip(undefined)).toBeNull();
  });
});

describe('stackBreakdown', () => {
  it('makes the stack exactly, with change for the next chip up', () => {
    const parts = stackBreakdown(10000, set)!;
    expect(total(parts)).toBe(10000);
    expect(parts.map(p => [p.chip.value, p.n])).toEqual([[25, 8], [100, 13], [500, 5], [1000, 6]]);
  });

  it('keeps a small stack exact by dropping float it cannot afford', () => {
    const parts = stackBreakdown(1500, set)!;
    expect(total(parts)).toBe(1500);
  });

  it('is null for a stack the chips cannot make, or no chips', () => {
    expect(stackBreakdown(10010, set)).toBeNull();
    // 300s and 500s share a unit of 100, but 700 still cannot be made — the
    // breakdown must say null rather than hand back 500 and call it 700.
    expect(stackBreakdown(700, [{ colour: 'Red', value: 300 }, { colour: 'Blue', value: 500 }])).toBeNull();
    expect(stackBreakdown(10000, [])).toBeNull();
  });
});

describe('how many stacks the chips make', () => {
  const parts = stackBreakdown(10000, set);

  it('is limited by the colour that runs out first', () => {
    // 100 reds at 8 a stack = 12; 200 whites at 13 = 15; greens 20; blacks 16.
    expect(stacksAvailable(parts)).toEqual({ stacks: 12, limitedBy: set[1] });
  });

  it('warns only when short, and names the colour', () => {
    expect(shortageNote(parts, 12)).toBeNull();
    expect(shortageNote(parts, 13)).toBe('Your chips make 12 starting stacks — 13 needed. The 25s (Red) run out first.');
  });

  it('cannot run short of chips nobody counted', () => {
    const uncounted = stackBreakdown(10000, set.map(c => ({ ...c, count: undefined })));
    expect(stacksAvailable(uncounted)).toBeNull();
    expect(shortageNote(uncounted, 999)).toBeNull();
  });
});

describe('colourUps', () => {
  const lvl = (small: number, big: number, ante = 0): BlindLevel => ({ small, big, ante, duration: 900 });
  const brk = (l: BlindLevel): BlindLevel => ({ ...l, isBreak: true });
  const levels = [lvl(25, 50), lvl(50, 100), lvl(75, 150), brk(lvl(75, 150)), lvl(100, 200), lvl(200, 400), lvl(500, 1000), lvl(1000, 2000)];

  it('lands on the break after the last level that needs the chip', () => {
    // 75/150 is the last to need a 25 (gcd of 100/500/1000 is 100); the break follows it.
    expect(colourUps(levels, set).get(3)).toEqual([set[1]]);
  });

  it('marks each chip once, and never the biggest', () => {
    const ups = colourUps(levels, set);
    // 100s are last needed at 200/400 (index 5) — 500/1000 needs only 500s.
    expect(ups.get(6)).toEqual([set[3]]);
    // And the 500s at 1000/2000, the last level. The 1000s, the biggest, never.
    expect(ups.get(7)).toEqual([set[2]]);
    expect([...ups.values()].flat().map(c => c.value)).toEqual([25, 100, 500]);
  });

  it('counts an ante as needing the chip', () => {
    const withAnte = [lvl(100, 200), lvl(200, 400, 25), lvl(300, 600)];
    expect(colourUps(withAnte, set).get(2)).toEqual([set[1]]);
  });

  it('says nothing for a chip needed to the end, or with no chip set', () => {
    expect(colourUps([lvl(25, 50), lvl(50, 100)], set).size).toBe(0);
    expect(colourUps(levels, []).size).toBe(0);
  });

  it('reads as a sentence', () => {
    expect(colourUpLabel([set[1], set[3]])).toBe('Colour up the 25s (Red) and 100s (White)');
  });
});

describe('colourUpNotice — what the clock says', () => {
  const lvl = (small: number, big: number): BlindLevel => ({ small, big, duration: 900 });
  const levels = [lvl(25, 50), lvl(75, 150), { ...lvl(75, 150), isBreak: true }, lvl(100, 200), lvl(200, 400)];

  it('warns on the level before, and says "now" during the break', () => {
    expect(colourUpNotice(levels, 0, set)).toBeNull();
    expect(colourUpNotice(levels, 1, set)).toBe('Colour up the 25s (Red) at the break');
    expect(colourUpNotice(levels, 2, set)).toBe('Colour up the 25s (Red) now');
    expect(colourUpNotice(levels, 3, set)).toBeNull();
  });

  it('says "before the next level" when no break falls there', () => {
    const noBreak = [lvl(25, 50), lvl(75, 150), lvl(100, 200)];
    expect(colourUpNotice(noBreak, 1, set)).toBe('Colour up the 25s (Red) before the next level');
    // On that level itself it is already done — "now" is only for a break.
    expect(colourUpNotice(noBreak, 2, set)).toBeNull();
  });

  it('says nothing without a chip set', () => {
    expect(colourUpNotice(levels, 1, undefined)).toBeNull();
  });
});
