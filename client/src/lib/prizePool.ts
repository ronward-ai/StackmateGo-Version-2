export interface PrizePoolInputs {
  buyIn: number;
  playerCount: number;
  totalRebuys?: number;
  rebuyAmount?: number;
  totalAddons?: number;
  addonAmount?: number;
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
  const buyInTotal = inputs.buyIn * inputs.playerCount;
  const gross =
    buyInTotal +
    ((inputs.rebuyAmount ?? 0) * (inputs.totalRebuys ?? 0)) +
    ((inputs.addonAmount ?? 0) * (inputs.totalAddons ?? 0));

  // Rake applies only to the initial buy-in total, not to rebuys or add-ons
  const rake = (inputs.rakeType ?? 'percentage') === 'percentage'
    ? Math.floor(buyInTotal * ((inputs.rakePercentage ?? 0) / 100))
    : (inputs.rakeAmount ?? 0);

  return { gross, rake, net: Math.max(0, gross - rake) };
}
