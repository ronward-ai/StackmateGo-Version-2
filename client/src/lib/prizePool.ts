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
  const gross =
    (inputs.buyIn * inputs.playerCount) +
    ((inputs.rebuyAmount ?? 0) * (inputs.totalRebuys ?? 0)) +
    ((inputs.addonAmount ?? 0) * (inputs.totalAddons ?? 0));

  // Rake is a per-player house fee charged on top of the buy-in — does NOT reduce the prize pool.
  // Percentage rake = % of the buy-in per player × number of players.
  // Fixed rake = fixed amount per player × number of players.
  const rake = (inputs.rakeType ?? 'percentage') === 'percentage'
    ? Math.floor(inputs.buyIn * ((inputs.rakePercentage ?? 0) / 100)) * inputs.playerCount
    : (inputs.rakeAmount ?? 0) * inputs.playerCount;

  return { gross, rake, net: gross };
}
