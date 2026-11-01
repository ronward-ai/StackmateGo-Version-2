import { describe, it, expect } from 'vitest';
import { generateStructure, smallBlindFor, formatMinutes, type GeneratorInput } from './blindGenerator';

const base: GeneratorInput = { startingStack: 10000, players: 12, smallestChip: 25, mode: { kind: 'duration', hours: 4 } };
const blinds = (levels: ReturnType<typeof generateStructure>['levels']) => levels.filter(l => !l.isBreak);

const variants: [string, GeneratorInput][] = [
  ['4 hours', base],
  ['2 hours, 9 players', { ...base, players: 9, mode: { kind: 'duration', hours: 2 } }],
  ['6 hours, deep', { ...base, startingStack: 30000, players: 20, mode: { kind: 'duration', hours: 6 } }],
  ['20-minute levels', { ...base, mode: { kind: 'levelLength', minutes: 20 } }],
  ['100 chips, 15-minute levels from 200', { ...base, smallestChip: 100, mode: { kind: 'levelLength', minutes: 15, startBig: 200 } }],
  ['breaks and antes', { ...base, breakEvery: 4, breakMinutes: 10, antesFrom: 5 }],
  ['big-blind ante', { ...base, antesFrom: 3, bigBlindAnte: true }],
  // A long night for a small field climbs slowly — the case where a step could
  // snap back onto the same big blind.
  ['10 hours, 6 players', { ...base, players: 6, mode: { kind: 'duration', hours: 10 } }],
  // A break after every level: the case where the last entry could be a break.
  ['a break after every level', { ...base, breakEvery: 1 }],
  // The slowest climb there is — every step wants to be smaller than the ladder
  // allows, so this is where a big blind could repeat instead of rising.
  ['24 hours, heads-up, short stacks', { ...base, startingStack: 2000, players: 2, mode: { kind: 'duration', hours: 24 } }],
];

describe.each(variants)('a generated structure (%s)', (_name, input) => {
  const g = generateStructure(input);
  const unit = input.smallestChip!;

  it('every blind and ante can be made with the smallest chip', () => {
    for (const l of blinds(g.levels)) {
      expect(l.small % unit).toBe(0);
      expect(l.big % unit).toBe(0);
      if (l.ante) expect(l.ante % unit).toBe(0);
      expect(l.small).toBeGreaterThan(0);
    }
  });

  it('the big blind always rises, and the small blind is about half of it', () => {
    const b = blinds(g.levels);
    b.slice(1).forEach((l, i) => expect(l.big).toBeGreaterThan(b[i].big));
    for (const l of b) {
      expect(l.small).toBeLessThanOrEqual(l.big / 2);
      expect(l.small).toBeGreaterThan(l.big / 2 - unit);
    }
  });

  it('never starts or ends with a break', () => {
    expect(g.levels[0].isBreak).toBeFalsy();
    expect(g.levels[g.levels.length - 1].isBreak).toBeFalsy();
  });

  it('runs on past the expected finish, so a long night does not run off the end', () => {
    const scheduledMinutes = g.levels.reduce((s, l) => s + l.duration / 60, 0);
    expect(scheduledMinutes).toBeGreaterThan(g.finishMinutes);
  });
});

describe('finish around a time', () => {
  it('lands near the time asked for', () => {
    for (const hours of [2, 3, 4, 5]) {
      const g = generateStructure({ ...base, mode: { kind: 'duration', hours }, breakEvery: 4, breakMinutes: 10 });
      expect(Math.abs(g.finishMinutes - hours * 60)).toBeLessThanOrEqual(g.levelMinutes + 10);
    }
  });

  it('starts about 100 big blinds deep and finishes near a twentieth of the chips', () => {
    const b = blinds(generateStructure(base).levels);
    expect(b[0].big).toBe(100);
    // The expected finish (before the spare levels) is around 120,000 / 20.
    expect(b.some(l => l.big >= 5000 && l.big <= 8000)).toBe(true);
  });
});

describe('level length', () => {
  it('uses the length and opening blinds given, and estimates the finish from them', () => {
    const g = generateStructure({ ...base, mode: { kind: 'levelLength', minutes: 20, startBig: 50 } });
    expect(g.levelMinutes).toBe(20);
    expect(g.levels.every(l => l.duration === 1200)).toBe(true);
    expect(blinds(g.levels)[0]).toMatchObject({ small: 25, big: 50 });
    expect(g.finishMinutes % 20).toBe(0);
  });
});

describe('breaks and antes', () => {
  const g = generateStructure({ ...base, breakEvery: 4, breakMinutes: 10, antesFrom: 5 });

  it('puts a break after every fourth level, carrying its blinds', () => {
    const firstBreak = g.levels.findIndex(l => l.isBreak);
    expect(firstBreak).toBe(4);
    expect(g.levels[firstBreak]).toMatchObject({ duration: 600, big: g.levels[3].big });
  });

  it('antes start at the level asked for, at a recognisable figure', () => {
    const b = blinds(g.levels);
    expect(b.slice(0, 4).every(l => !l.ante)).toBe(true);
    expect(b.slice(4).every(l => (l.ante || 0) > 0)).toBe(true);
    expect(b[4].ante).toBe(50); // 400/8 → 50
  });

  it('a big-blind ante is the big blind', () => {
    const bb = generateStructure({ ...base, antesFrom: 1, bigBlindAnte: true });
    expect(blinds(bb.levels).every(l => l.ante === l.big)).toBe(true);
  });
});

describe('helpers', () => {
  it('a small blind is whole chips and never zero', () => {
    expect(smallBlindFor(150, 25)).toBe(75);
    expect(smallBlindFor(300, 100)).toBe(100);
    expect(smallBlindFor(100, 100)).toBe(100);
  });

  it('formats the finish', () => {
    expect([formatMinutes(45), formatMinutes(240), formatMinutes(225)]).toEqual(['45m', '4h', '3h 45m']);
  });
});
