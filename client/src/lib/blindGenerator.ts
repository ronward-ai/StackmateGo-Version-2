import type { BlindLevel } from '@/types';

/**
 * A blind structure built from the night rather than picked from a list.
 *
 * The presets in the Levels tab are one ladder at six speeds. This works the
 * structure out from what the director knows: the starting stack, roughly how
 * many are playing, the chips on the table, and either how long the night
 * should run or how long a level should be.
 *
 * The shape is the standard one. Start about 100 big blinds deep; finish when
 * the big blind is about a twentieth of every chip in play — by then the game is
 * all-ins, and that is when a structure has done its job. In between, the big
 * blind grows by a steady ratio, each step snapped to a number a dealer would
 * recognise and a player can make with the chips in front of them.
 *
 * It suggests and never imposes: the result is a list the director previews,
 * applies, and can still edit level by level like any other.
 */

export type GeneratorMode =
  | { kind: 'duration'; hours: number }
  | { kind: 'levelLength'; minutes: number; startBig?: number };

export interface GeneratorInput {
  startingStack: number;
  players: number;
  /** The smallest chip in play; every blind is a multiple of it. Defaults to 25. */
  smallestChip?: number;
  mode: GeneratorMode;
  /** A break after every N blind levels; 0 or absent means none. */
  breakEvery?: number;
  breakMinutes?: number;
  /** Antes from this blind level (1-based); absent means no antes. */
  antesFrom?: number;
  /** Big-blind ante: the ante equals the big blind (the BB posts for the table). */
  bigBlindAnte?: boolean;
}

export interface GeneratedStructure {
  levels: BlindLevel[];
  levelMinutes: number;
  /** About when the last "scheduled" level ends — the expected finish, breaks included. */
  finishMinutes: number;
}

/** How deep the night starts, and how shallow it ends. */
const START_DEPTH_BB = 100;
const END_FRACTION = 20;
/** Levels past the expected finish, so a long night does not run off the end. */
const SPARE_LEVELS = 3;
/** The growth a level-length night climbs by. */
const DEFAULT_RATIO = 1.35;
/** The level lengths "finish around a time" chooses between. */
const LEVEL_LENGTHS = [10, 12, 15, 20, 25, 30, 40, 45, 60];

/** Big blinds a dealer recognises: 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 of each power of ten. */
function niceLadder(unit: number, upTo: number): number[] {
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  const out = new Set<number>();
  for (let p = 1; p <= upTo * 10; p *= 10) {
    for (const s of steps) {
      const v = Math.round(s * p);
      if (v >= 2 * unit && v % unit === 0) out.add(v);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

/** The ladder value nearest a target (by ratio), never at or below `floor`. */
function snapAbove(target: number, floor: number, ladder: number[]): number {
  const above = ladder.filter(v => v > floor);
  if (!above.length) return floor * 2;
  return above.reduce((best, v) => (Math.abs(Math.log(v / target)) < Math.abs(Math.log(best / target)) ? v : best), above[0]);
}

/** A small blind of about half the big, in whole chips — never zero. */
export function smallBlindFor(big: number, unit: number): number {
  return Math.max(unit, Math.floor(big / 2 / unit) * unit);
}

/**
 * An ante: the big blind for a BB ante, else about an eighth of it — snapped to
 * the same recognisable ladder as the blinds (or the smallest chip), so it reads
 * 200 rather than 187.5, and does not keep a small chip in play for no reason.
 */
function anteFor(big: number, unit: number, bigBlindAnte: boolean, ladder: number[]): number {
  if (bigBlindAnte) return big;
  const options = [unit, ...ladder].filter(v => v < big);
  const target = big / 8;
  return options.reduce((best, v) => (Math.abs(Math.log(v / target)) < Math.abs(Math.log(best / target)) ? v : best), unit);
}

/** Big blinds from `start`, by `ratio`, up to and past `end`. */
function climb(start: number, end: number, ratio: number, ladder: number[], count?: number): number[] {
  const bigs = [start];
  while (count !== undefined ? bigs.length < count : bigs[bigs.length - 1] < end) {
    const prev = bigs[bigs.length - 1];
    bigs.push(snapAbove(prev * ratio, prev, ladder));
    if (bigs.length > 200) break; // a guard, not a structure
  }
  return bigs;
}

export function generateStructure(input: GeneratorInput): GeneratedStructure {
  const unit = input.smallestChip && input.smallestChip > 0 ? input.smallestChip : 25;
  const stack = Math.max(unit * 20, input.startingStack || 0);
  const players = Math.max(2, Math.round(input.players || 0));
  const totalChips = stack * players;
  const ladder = niceLadder(unit, totalChips);

  const end = snapAbove(totalChips / END_FRACTION, 0, ladder);
  const naturalStart = snapAbove(stack / START_DEPTH_BB, 0, ladder);
  const breakEvery = input.breakEvery && input.breakEvery > 0 ? Math.round(input.breakEvery) : 0;
  const breakMinutes = Math.max(1, Math.round(input.breakMinutes ?? 10));

  let levelMinutes: number;
  let bigs: number[];

  if (input.mode.kind === 'duration') {
    const totalMinutes = Math.max(30, input.mode.hours * 60);
    // For each level length, how many levels fit (net of breaks), and the ratio
    // that climbs start→end in that many. Pick the length whose ratio is nearest
    // a comfortable 1.35 — short levels with big jumps, or long levels with tiny
    // ones, both make a worse night than the middle.
    let best: { minutes: number; n: number; score: number } | null = null;
    for (const minutes of LEVEL_LENGTHS) {
      const perLevel = minutes + (breakEvery ? breakMinutes / breakEvery : 0);
      const n = Math.max(2, Math.round(totalMinutes / perLevel));
      const ratio = Math.pow(end / naturalStart, 1 / (n - 1));
      const score = Math.abs(Math.log(ratio / DEFAULT_RATIO));
      if (!best || score < best.score) best = { minutes, n, score };
    }
    levelMinutes = best!.minutes;
    const ratio = Math.max(1.1, Math.pow(end / naturalStart, 1 / (best!.n - 1)));
    bigs = climb(naturalStart, end, ratio, ladder, best!.n);
  } else {
    levelMinutes = Math.max(1, Math.round(input.mode.minutes));
    const start = input.mode.startBig && input.mode.startBig > 0
      ? snapAbove(input.mode.startBig, 0, ladder)
      : naturalStart;
    bigs = climb(start, end, DEFAULT_RATIO, ladder);
  }

  const scheduled = bigs.length;
  bigs = [...bigs, ...climb(bigs[bigs.length - 1], Infinity, DEFAULT_RATIO, ladder, SPARE_LEVELS + 1).slice(1)];

  const levels: BlindLevel[] = [];
  let finishMinutes = 0;
  bigs.forEach((big, i) => {
    const levelNumber = i + 1;
    const level: BlindLevel = { small: smallBlindFor(big, unit), big, duration: levelMinutes * 60 };
    if (input.antesFrom && levelNumber >= input.antesFrom) level.ante = anteFor(big, unit, !!input.bigBlindAnte, ladder);
    levels.push(level);
    if (levelNumber <= scheduled) finishMinutes += levelMinutes;
    // A break after every N levels, never after the last one.
    if (breakEvery && levelNumber % breakEvery === 0 && i < bigs.length - 1) {
      // Carrying the level's blinds, as `addBreak` does, for display.
      levels.push({ small: level.small, big: level.big, duration: breakMinutes * 60, isBreak: true });
      if (levelNumber < scheduled) finishMinutes += breakMinutes;
    }
  });

  return { levels, levelMinutes, finishMinutes };
}

/** "3h 45m", for the estimated finish. */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
