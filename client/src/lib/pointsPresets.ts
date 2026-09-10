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
}

export const POINTS_PRESETS: PointsPreset[] = [
  {
    id: 'td-classic',
    name: 'Tournament Director (classic)',
    source: 'The Tournament Director',
    // Translated from that software's
    //   switch(r, 1, n*36, 2, n*24, … , 20, n, 0)
    // where r is the finish position and n the number of players. Runs of equal
    // values collapse into the two ranges at the end. pointsPresets.test.ts pins
    // every band, so an edit here cannot quietly change what a league scores.
    formula: '(f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0)',
    summary: 'Scales with the field: winner 36× the player count, down to 6× for 8th, 2× to 15th, 1× to 20th, then nothing.',
  },
];
