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

  return { gross, rake, net: Math.max(0, gross - rake) };
}
