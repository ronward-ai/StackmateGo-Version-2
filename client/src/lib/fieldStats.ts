import { countEntries, prizePoolFor, type CountedPlayer, type RakeStructure } from './prizePool';

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
 * What the clock's strip says, read across a room: players left, the average
 * stack, the pool. A figure that means nothing yet is left out rather than
 * drawn as a zero — no pool in a free game, no average once nobody is left —
 * and a finished game shows none, because the winner is the headline then.
 */
export function clockStats(field: FieldStats, currencySymbol: string, finished: boolean): ClockStat[] {
  if (finished || field.entrants === 0) return [];
  const out: ClockStat[] = [{
    label: field.eliminated > 0 ? 'Players left' : 'Players',
    value: field.eliminated > 0 ? `${field.active}/${field.entrants}` : String(field.entrants),
  }];
  if (field.averageStack > 0) out.push({ label: 'Avg stack', value: shortChips(field.averageStack) });
  if (field.pool > 0) out.push({ label: 'Prize pool', value: `${currencySymbol}${field.pool.toLocaleString()}` });
  return out;
}
