export interface PrizePoolInputs {
  buyIn: number;
  playerCount: number;
  totalRebuys?: number;
  rebuyAmount?: number;
  totalAddons?: number;
  addonAmount?: number;
  totalReEntries?: number;
  reEntryRake?: boolean;
  rebuyRake?: boolean;
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

  // Re-entry/rebuy rake flags control whether those additional entries incur the house fee.
  const rakeableEntries = inputs.playerCount
    + (inputs.reEntryRake ? (inputs.totalReEntries ?? 0) : 0)
    + (inputs.rebuyRake ? (inputs.totalRebuys ?? 0) : 0);
  const rake = (inputs.rakeType ?? 'percentage') === 'percentage'
    ? Math.floor(inputs.buyIn * ((inputs.rakePercentage ?? 0) / 100)) * rakeableEntries
    : (inputs.rakeAmount ?? 0) * rakeableEntries;

  return { gross, rake, net: gross };
}
