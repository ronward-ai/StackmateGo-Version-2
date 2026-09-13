/**
 * "1st", "2nd", "21st" — finishing positions, spelled once.
 *
 * There were five implementations and four were wrong past tenth. Three read
 * `['1st','2nd','3rd'][n-1] ?? \`${n}th\`` and one was a ternary chain of the
 * same shape, so a 21-player game showed **"21th"** on the info card, the
 * participant's copy of it, the Buy-in payouts panel and the exported results
 * image — while the points preview in the league dialog, which had the only
 * correct version, said "21st" on the same screen.
 *
 * Home games of 20+ are ordinary, so this was visible rather than theoretical.
 */
export function ordinal(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(Math.trunc(n));
  // 11th, 12th and 13th are the exceptions, and they repeat every hundred —
  // 111th, 112th, 113th. Checking n % 10 alone is what produced "21th"'s
  // opposite error in every implementation that tried to be clever.
  const suffix =
    abs % 100 >= 11 && abs % 100 <= 13 ? 'th'
    : abs % 10 === 1 ? 'st'
    : abs % 10 === 2 ? 'nd'
    : abs % 10 === 3 ? 'rd'
    : 'th';
  return `${Math.trunc(n)}${suffix}`;
}
