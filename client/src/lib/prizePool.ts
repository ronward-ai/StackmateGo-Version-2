export interface PrizePoolInputs {
  buyIn: number;
  playerCount: number;
  totalRebuys?: number;
  rebuyAmount?: number;
  totalAddons?: number;
  addonAmount?: number;
  totalReEntries?: number;
  reEntryRake?: boolean;
  reEntryRakeAmount?: number;
  rebuyRake?: boolean;
  rebuyRakeAmount?: number;
  rakeType?: 'percentage' | 'fixed';
  rakePercentage?: number;
  rakeAmount?: number;
}

export interface PrizePoolResult {
  gross: number;
  rake: number;
  net: number;
}

export function calculatePrizePool(inputs: PrizePoolInputs): PrizePoolResult {
  const gross =
    (inputs.buyIn * inputs.playerCount) +
    ((inputs.rebuyAmount ?? 0) * (inputs.totalRebuys ?? 0)) +
    ((inputs.addonAmount ?? 0) * (inputs.totalAddons ?? 0)) +
    (inputs.buyIn * (inputs.totalReEntries ?? 0));

  const perEntryRake = (inputs.rakeType ?? 'percentage') === 'percentage'
    ? Math.floor(inputs.buyIn * ((inputs.rakePercentage ?? 0) / 100))
    : (inputs.rakeAmount ?? 0);

  const rake =
    perEntryRake * inputs.playerCount +
    (inputs.reEntryRake ? (inputs.totalReEntries ?? 0) * (inputs.reEntryRakeAmount ?? perEntryRake) : 0) +
    (inputs.rebuyRake ? (inputs.totalRebuys ?? 0) * (inputs.rebuyRakeAmount ?? perEntryRake) : 0);

  return { gross, rake, net: gross };
}

/**
 * The prize structure fields that decide what an entry costs.
 *
 * Structural, and every field optional, because callers pass
 * `state.prizeStructure` straight in and it may be absent on a fresh game.
 */
export interface RakeStructure {
  buyIn?: number;
  rebuyAmount?: number;
  addonAmount?: number;
  rakeType?: 'percentage' | 'fixed';
  rakePercentage?: number;
  rakeAmount?: number;
  reEntryRake?: boolean;
  reEntryRakeAmount?: number;
  rebuyRake?: boolean;
  rebuyRakeAmount?: number;
  enableBounties?: boolean;
  bountyAmount?: number;
  rebuyBounty?: boolean;
  reEntryBounty?: boolean;
}

/** The player fields the counts come from. */
export interface CountedPlayer {
  rebuys?: number;
  addons?: number;
  reEntries?: number;
}

export interface EntryCounts {
  playerCount: number;
  totalRebuys: number;
  totalAddons: number;
  totalReEntries: number;
}

/** How many entries, rebuys, add-ons and re-entries a roster represents. */
export function countEntries(players: CountedPlayer[] = []): EntryCounts {
  return players.reduce<EntryCounts>(
    (counts, p) => ({
      playerCount: counts.playerCount + 1,
      totalRebuys: counts.totalRebuys + (p.rebuys || 0),
      totalAddons: counts.totalAddons + (p.addons || 0),
      totalReEntries: counts.totalReEntries + (p.reEntries || 0),
    }),
    { playerCount: 0, totalRebuys: 0, totalAddons: 0, totalReEntries: 0 },
  );
}

export interface EntryCosts {
  /** House fee on one buy-in. */
  perEntryRake: number;
  /** House fee on one rebuy — 0 when rebuys are not raked. */
  rebuyRake: number;
  /** House fee on one re-entry — 0 when re-entries are not raked. */
  reEntryRake: number;
  /** Bounty added by one rebuy — 0 when rebuys do not carry one. */
  rebuyBounty: number;
  /** Bounty added by one re-entry — 0 when re-entries do not carry one. */
  reEntryBounty: number;
}

/**
 * What a single buy-in, rebuy or re-entry costs on top of the stake, and what it
 * adds to the bounty.
 *
 * The defaults are the load-bearing part and were previously copy-pasted at
 * every confirmation dialog and pool calculation in the app. Note they are not
 * uniform, and the asymmetry is deliberate: **re-entries are raked by default,
 * rebuys are not** — a re-entry is a fresh entry into the tournament, a rebuy is
 * not. Spelling that as `?? true` in one place and `|| false` in another, nine
 * times over, is how they drift.
 */
export function entryCosts(structure?: RakeStructure): EntryCosts {
  const ps = structure ?? {};
  const perEntryRake = (ps.rakeType || 'percentage') === 'percentage'
    ? Math.floor((ps.buyIn || 0) * ((ps.rakePercentage || 0) / 100))
    : (ps.rakeAmount || 0);

  return {
    perEntryRake,
    rebuyRake: ps.rebuyRake ? (ps.rebuyRakeAmount || perEntryRake) : 0,
    reEntryRake: (ps.reEntryRake ?? true) ? (ps.reEntryRakeAmount || perEntryRake) : 0,
    rebuyBounty: (ps.enableBounties && ps.rebuyBounty) ? (ps.bountyAmount || 0) : 0,
    reEntryBounty: (ps.enableBounties && ps.reEntryBounty !== false) ? (ps.bountyAmount || 0) : 0,
  };
}

/**
 * The pool and rake for a tournament, from its roster and prize structure.
 *
 * The single entry point for anything on screen that shows money. Every caller
 * used to derive the counts and re-spell the rake defaults itself — nine sites,
 * and one of them disagreed: `completeTournament` subtracted the rake from the
 * pool where every other site keeps it on top. Since rake is charged ON TOP of
 * the buy-in, `net === gross` here is correct and deliberate.
 */
export function prizePoolFor(
  players: CountedPlayer[] = [],
  structure?: RakeStructure,
): PrizePoolResult {
  const ps = structure ?? {};
  const counts = countEntries(players);
  const costs = entryCosts(ps);

  return calculatePrizePool({
    buyIn: ps.buyIn || 0,
    playerCount: counts.playerCount,
    totalRebuys: counts.totalRebuys,
    rebuyAmount: ps.rebuyAmount || 0,
    totalAddons: counts.totalAddons,
    addonAmount: ps.addonAmount || 0,
    totalReEntries: counts.totalReEntries,
    reEntryRake: costs.reEntryRake > 0,
    reEntryRakeAmount: costs.reEntryRake,
    rebuyRake: costs.rebuyRake > 0,
    rebuyRakeAmount: costs.rebuyRake,
    rakeType: ps.rakeType || 'percentage',
    rakePercentage: ps.rakePercentage || 0,
    rakeAmount: ps.rakeAmount || 0,
  });
}
