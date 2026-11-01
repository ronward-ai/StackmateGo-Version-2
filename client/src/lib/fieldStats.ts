import { countEntries, payoutAmount, prizePoolFor, type CountedPlayer, type RakeStructure } from './prizePool';
import { payoutsOf, type PayoutPlace } from './payoutTemplates';
import { ordinal } from './ordinal';

/**
 * The field at a glance — who is left, the average stack and what they are
 * playing for. The clock's strip and both Tournament Info cards read this, so
 * the figure across the room and the one on the card cannot disagree.
 *
 * The chip arithmetic was spelled out twice, identically, in TournamentInfoCard
 * and ParticipantTournamentInfoCard; this is that arithmetic, once.
 */
export interface FieldPlayer extends CountedPlayer {
  isActive?: boolean;
}

export interface ChipStructure extends RakeStructure {
  manualPayouts?: PayoutPlace[];
  structure?: PayoutPlace[];
  startingChips?: number;
  rebuyChips?: number;
  addonChips?: number;
}

export interface FieldStats {
  /** Everyone who has bought in. */
  entrants: number;
  /** Still in the game. */
  active: number;
  eliminated: number;
  totalChips: number;
  /** 0 when nobody is left to hold the chips. */
  averageStack: number;
  pool: number;
}

export function fieldStats(players: FieldPlayer[] = [], structure: ChipStructure = {}): FieldStats {
  const { totalRebuys, totalAddons, totalReEntries } = countEntries(players);
  // `||`, as the cards always had it: an unset stack is the 10,000 default.
  const startChips = structure.startingChips || 10000;
  const rebuyChips = structure.rebuyChips || startChips;
  const addonChips = structure.addonChips || startChips;
  const totalChips = (startChips * players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons)
    // A re-entry is a fresh stack, so it is in the chips as well as the pool
    // (October audit, M17).
    + (startChips * totalReEntries);
  const active = players.filter(p => p.isActive !== false).length;
  return {
    entrants: players.length,
    active,
    eliminated: players.length - active,
    totalChips,
    averageStack: active > 0 ? Math.floor(totalChips / active) : 0,
    pool: prizePoolFor(players, structure).net,
  };
}

/** A chip count short enough to read across a room: 950, 13k, 1.2M. */
export function shortChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

export interface ClockStat {
  label: string;
  value: string;
}

/**
 * What the clock's strip says, read across a room: players left and the average
 * stack. The money is `clockPayouts` — what each place pays, which is what a
 * table actually asks, rather than one pool figure. A figure that means nothing
 * yet is left out rather than drawn as a zero, and a finished game shows none,
 * because the winner is the headline then.
 */
/** The director's Settings → On the clock choices. Absent means shown. */
export interface ClockShows {
  clockShowPlayers?: boolean;
  clockShowAverageStack?: boolean;
  clockShowPayouts?: boolean;
}

export function clockStats(field: FieldStats, currencySymbol: string, finished: boolean, show: ClockShows = {}): ClockStat[] {
  if (finished || field.entrants === 0) return [];
  const out: ClockStat[] = [];
  if (show.clockShowPlayers !== false) out.push({
    label: field.eliminated > 0 ? 'Players left' : 'Players',
    value: field.eliminated > 0 ? `${field.active}/${field.entrants}` : String(field.entrants),
  });
  if (show.clockShowAverageStack !== false && field.averageStack > 0) out.push({ label: 'Avg stack', value: shortChips(field.averageStack) });
  return out;
}

/**
 * What each paid place is worth right now — `1st £60`, `2nd £30` — from the same
 * `payoutsOf` + `payoutAmount` the Payouts panel uses, so the clock and the panel
 * cannot name different money. A place paying nothing (a free game, an empty
 * pool) is left out; a finished game shows none.
 */
export function clockPayouts(
  field: FieldStats,
  structure: ChipStructure,
  currencySymbol: string,
  finished: boolean,
  show: ClockShows = {},
): ClockStat[] {
  if (finished || show.clockShowPayouts === false) return [];
  return payoutsOf(structure)
    .map((place, i) => ({ label: ordinal(i + 1), amount: payoutAmount(field.pool, place.percentage) }))
    .filter(p => p.amount > 0)
    .map(p => ({ label: p.label, value: `${currencySymbol}${p.amount.toLocaleString()}` }));
}
