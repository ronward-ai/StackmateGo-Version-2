/**
 * The currency symbol to draw money in.
 *
 * `settings.currency || '£'` was spelled out at three call sites and simply not
 * asked at a fourth: the league standings hard-coded `£` in five columns and the
 * season's prize-pool figure did the same, so a director working in dollars or
 * euros saw pounds in their own league table while every other screen in the app
 * honoured their choice.
 *
 * Pure, per the lib/ convention. The fallback is the app's historical default
 * and stays, so nothing moves for a league that has never set one.
 */
export const DEFAULT_CURRENCY = '£';

export function currencyOf(settings?: { currency?: string } | null): string {
  const symbol = settings?.currency;
  return symbol && symbol.trim() ? symbol : DEFAULT_CURRENCY;
}

/** A money figure, grouped, with the symbol in front. Negatives keep the sign
 *  outside the symbol — "-£20", not "£-20". */
export function money(amount: number, symbol: string): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString()}`;
}
