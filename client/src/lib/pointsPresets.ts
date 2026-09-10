/**
 * Custom-formula presets: ready-made scoring schemes.
 *
 * These are NOT points system types. The type dropdown lists KINDS of scoring —
 * logarithmic, square root, linear, fixed, custom — and a specific formula is an
 * instance of the last one, not a sibling of the others. So presets live beside
 * the director's own saved formulas, loaded by the same button.
 *
 * A preset is a starting point. Loading one drops it into the formula field,
 * where it can be edited like anything typed by hand.
 *
 * Each one says what it does and what it suits. Nothing else: a director
 * choosing how their league scores does not need to know where a formula came
 * from, and the app is not the place to advertise anyone.
 */
export interface PointsPreset {
  id: string;
  /** Named for what it DOES, like the built-in schemes. */
  name: string;
  formula: string;
  /** What it pays, in words — the thing worth checking before trusting it. */
  summary: string;
  /** The league it suits, so the choice can be made without doing the sums. */
  bestFor: string;
}

export const POINTS_PRESETS: PointsPreset[] = [
  {
    id: 'field-bands',
    name: 'Scales with the field',
    // Fixed multipliers of the field size, in bands. The runs of equal values
    // collapse into the two ranges at the end: 9th-15th all pay 2p, 16th-20th
    // all pay p. pointsPresets.test.ts pins every band, so an edit here cannot
    // quietly change what a league scores.
    formula: '(f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0)',
    summary: 'Winner takes 36× the number of players, down to 6× for 8th, 2× to 15th and 1× to 20th.',
    bestFor: 'A league where a busy night should be worth more than a quiet one, and only the top twenty score.',
  },
  {
    id: 'sqrt-field',
    name: 'Rewards the bigger night',
    // round(10 * sqrt(p) / sqrt(f)) - 9. The -9 is what makes last place score
    // exactly 1 rather than 10: at f === p the ratio is 1, so the bracket is 10
    // whatever the field size.
    formula: '(Math.round(10 * Math.sqrt(p) / Math.sqrt(f)) - 9)',
    summary: 'A big field is worth more, and the drop from first to second is steep. Last place always scores 1.',
    bestFor: 'A league where everyone who turns up should take something away, however the night goes.',
  },
  {
    id: 'cost-weighted',
    name: 'Rebuys cost you',
    // buy-in * sqrt(players / total cost) / (1 + finish), scaled by 100.
    //
    // The scaling is because this app floors to whole points: unscaled, a field
    // of twelve scores 8, 5, 4, 3, 2, 2, 1, 1… and half the field ties. The
    // ORDER is identical either way — it is the resolution that changes.
    //
    // The only scheme here that reads `c`, which is why the scoring had to be
    // given the player's total cost first: with c at 0 this divided by zero.
    formula: '(100 * b * Math.sqrt(p / c) / (1 + f))',
    summary: 'Rewards a big field and a big buy-in, and takes points off for every rebuy and add-on.',
    bestFor: 'A league where surviving on your first buy-in should count for something.',
  },
];
