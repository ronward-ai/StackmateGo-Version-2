import type { BlindLevel } from '@/types';

/**
 * The director's chips — what each colour is worth and how many they own.
 *
 * Stored on `settings.chipSet`, beside `timerPiping`: it is the director's
 * equipment rather than a fact about one game, so it travels with the setup to
 * the account and, through the settings sync, into the game document — which is
 * how a player's phone can show a colour-up too. No rule to publish.
 *
 * Absent or empty means "no chip set", and everything behaves as it did before
 * this existed: the generator assumes 25s, nothing warns, nothing colours up.
 */
export interface Chip {
  /** A name from CHIP_COLOURS. */
  colour: string;
  value: number;
  /** How many the director owns. Absent means "not counted" — no shortage check. */
  count?: number;
}

/** The colours a chip set is made of. Named, so a sentence can say "the reds". */
export const CHIP_COLOURS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#F1F5F9' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Black', hex: '#18181B' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Grey', hex: '#71717A' },
  { name: 'Brown', hex: '#92400E' },
];

export function chipHex(colour: string): string {
  return CHIP_COLOURS.find(c => c.name === colour)?.hex ?? '#71717A';
}

/** The chips that count, smallest first. A chip worth nothing is not a chip. */
export function chipsInPlay(chipSet: Chip[] | null | undefined): Chip[] {
  return (chipSet ?? [])
    .filter(c => Number.isFinite(c.value) && c.value > 0)
    .slice()
    .sort((a, b) => a.value - b.value);
}

/** The smallest chip's value, or null when there is no chip set. */
export function smallestChip(chipSet: Chip[] | null | undefined): number | null {
  const chips = chipsInPlay(chipSet);
  return chips.length ? chips[0].value : null;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The finest amount these chips can make — every makeable amount is a multiple of it. */
function unitOf(chips: Chip[]): number {
  return chips.reduce((g, c) => gcd(g, c.value), 0);
}

export interface StackPart {
  chip: Chip;
  n: number;
}

/**
 * One starting stack, made of these chips — the breakdown a director counts out
 * at each seat. A sensible playing stack rather than the fewest chips: each
 * colour below the top gets enough to make change for two of the next colour up
 * (eight 25s beside the 100s, ten 100s beside the 500s), and the rest goes in
 * the biggest chips. Smaller stacks drop the float rather than come out wrong.
 *
 * Null when the stack cannot be made exactly from these chips (10,010 from 25s).
 */
export function stackBreakdown(stack: number, chipSet: Chip[] | null | undefined): StackPart[] | null {
  const chips = chipsInPlay(chipSet);
  if (!chips.length || !(stack > 0)) return null;
  if (stack % unitOf(chips) !== 0) return null;

  const counts = chips.map(() => 0);
  // The float: change for two of the next chip up, capped at half the stack.
  let floatTotal = 0;
  for (let i = 0; i < chips.length - 1; i++) {
    const n = Math.ceil((2 * chips[i + 1].value) / chips[i].value);
    if (floatTotal + n * chips[i].value > stack / 2) break;
    counts[i] = n;
    floatTotal += n * chips[i].value;
  }
  // The rest, biggest first.
  let rest = stack - floatTotal;
  for (let i = chips.length - 1; i >= 0 && rest > 0; i--) {
    const n = Math.floor(rest / chips[i].value);
    counts[i] += n;
    rest -= n * chips[i].value;
  }
  if (rest !== 0) return null;
  return chips.map((chip, i) => ({ chip, n: counts[i] })).filter(p => p.n > 0);
}

/**
 * How many whole starting stacks the counted chips make, and which colour runs
 * out first. Null when nothing is counted, or there is no breakdown to count by.
 * Colours without a count are taken as plentiful.
 */
export function stacksAvailable(breakdown: StackPart[] | null): { stacks: number; limitedBy: Chip } | null {
  if (!breakdown) return null;
  let best: { stacks: number; limitedBy: Chip } | null = null;
  for (const part of breakdown) {
    if (part.chip.count === undefined || part.chip.count === null) continue;
    const stacks = Math.floor(part.chip.count / part.n);
    if (!best || stacks < best.stacks) best = { stacks, limitedBy: part.chip };
  }
  return best;
}

/**
 * The warning, when there is one: "Your chips make 11 starting stacks — 12
 * needed. The 25s (Red) run out first." It warns and never refuses, the house
 * rule: a director short of chips will borrow, chip up or play smaller, and the
 * app's job is to have said so before the cards are out.
 */
export function shortageNote(breakdown: StackPart[] | null, stacksNeeded: number): string | null {
  const available = stacksAvailable(breakdown);
  if (!available || available.stacks >= stacksNeeded) return null;
  const c = available.limitedBy;
  return `Your chips make ${available.stacks} starting stack${available.stacks === 1 ? '' : 's'} — ${stacksNeeded} needed. The ${c.value.toLocaleString()}s (${c.colour}) run out first.`;
}

/**
 * When each small chip stops being needed — "colour up the 25s". Keyed by the
 * index in `levels` to show the reminder at: the entry straight after the last
 * blind or ante that needs that chip — which is the break, when a break follows,
 * and a colour-up is done at a break.
 *
 * Derived, never stored, so the Levels tab, the console's clock and a player's
 * phone all work it out from the same two inputs and cannot disagree. The
 * biggest chip is never coloured up — there is nothing to change it for.
 */
export function colourUps(levels: BlindLevel[], chipSet: Chip[] | null | undefined): Map<number, Chip[]> {
  const chips = chipsInPlay(chipSet);
  const out = new Map<number, Chip[]>();
  const amounts = (l: BlindLevel) => (l.isBreak ? [] : [l.small, l.big, l.ante || 0].filter(a => a > 0));
  for (let k = 0; k < chips.length - 1; k++) {
    const unit = unitOf(chips.slice(k + 1));
    // The last level that still needs this chip (or a smaller one already gone).
    let lastNeeded = -1;
    levels.forEach((l, i) => { if (amounts(l).some(a => a % unit !== 0)) lastNeeded = i; });
    // Never needed: nothing to colour up. Needed to the end: no point at which to.
    const at = lastNeeded + 1;
    if (lastNeeded < 0 || at >= levels.length) continue;
    // A break straight after the last level that needs it is `at` already.
    out.set(at, [...(out.get(at) ?? []), chips[k]]);
  }
  return out;
}

/** The sentence a colour-up reads as: "Colour up the 25s (Red)". */
export function colourUpLabel(chips: Chip[]): string {
  return `Colour up the ${chips.map(c => `${c.value.toLocaleString()}s (${c.colour})`).join(' and ')}`;
}

/**
 * What the clock says about a colour-up, if anything: during the break it falls
 * on, "Colour up the 25s (Red) now"; on the level before, "… at the break" or
 * "… before the next level". One sentence for the console and every phone.
 */
export function colourUpNotice(
  levels: BlindLevel[] | null | undefined,
  currentLevel: number,
  chipSet: Chip[] | null | undefined,
): string | null {
  if (!levels?.length) return null;
  const ups = colourUps(levels, chipSet);
  const now = ups.get(currentLevel);
  if (now && levels[currentLevel]?.isBreak) return `${colourUpLabel(now)} now`;
  const next = ups.get(currentLevel + 1);
  if (!next) return null;
  return `${colourUpLabel(next)} ${levels[currentLevel + 1]?.isBreak ? 'at the break' : 'before the next level'}`;
}
