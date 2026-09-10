/**
 * Custom-formula presets: known scoring schemes, ready to load.
 *
 * These are NOT points system types. The type dropdown lists KINDS of scoring —
 * logarithmic, square root, linear, fixed, custom — and a specific formula is an
 * instance of the last one, not a sibling of the others. So presets live beside
 * the director's own saved formulas, loaded by the same button.
 *
 * A preset is a starting point. Loading one drops it into the formula field,
 * where it can be edited like anything typed by hand.
 */
export interface PointsPreset {
  id: string;
  name: string;
  /** Where it comes from, so a director can recognise their own scheme. */
  source: string;
  formula: string;
  /** What it pays, in words — the thing worth checking before trusting it. */
  summary: string;
  /** Where it comes from, for a director migrating from other software. */
  note?: string;
}

export const POINTS_PRESETS: PointsPreset[] = [
  {
    id: 'td-classic',
    // Named for what it DOES, like the built-in schemes. It was "Tournament
    // Director (classic)", which put another product's name in the interface and
    // told a director nothing about how their league would score. The provenance
    // is worth one line — it helps someone migrating recognise their own scheme
    // — but it is not the headline.
    name: 'Scales with the field',
    source: 'The Tournament Director',
    // Translated from that software's
    //   switch(r, 1, n*36, 2, n*24, … , 20, n, 0)
    // where r is the finish position and n the number of players. Runs of equal
    // values collapse into the two ranges at the end. pointsPresets.test.ts pins
    // every band, so an edit here cannot quietly change what a league scores.
    formula: '(f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0)',
    summary: 'Winner takes 36× the number of players, down to 6× for 8th, 2× to 15th and 1× to 20th. A big night is worth more than a quiet one.',
    note: 'Carried over from The Tournament Director software.',
  },
];
