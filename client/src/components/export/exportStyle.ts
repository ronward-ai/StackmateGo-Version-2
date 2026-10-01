import type { RankTone } from '@/lib/resultRows';

/**
 * How an exported image looks.
 *
 * **AN EXPORT IS A DIFFERENT MEDIUM FROM THE SCREEN, and treating it as one is
 * what makes this file possible.** The console is glass over a near-black page:
 * translucent panels, a blur behind them, hairlines at 9% white. That is right
 * on a tablet in a dim room and wrong in a picture, because a picture gets
 * posted to a group chat, recompressed, and looked at on somebody else's phone
 * in daylight.
 *
 * It is also not merely a preference. All three card treatments in `index.css`
 * use `backdrop-filter: blur(12px)`, and **html2canvas does not render
 * backdrop-filter at all** — it composites the translucent background straight
 * onto the canvas colour. So a captured glass card is not a slightly-worse glass
 * card; it is a nearly transparent panel over whatever the canvas was given. A
 * print style that never uses glass is the honest option rather than a
 * compromise.
 *
 * **What this deliberately does NOT redefine is the chips.** `TONES` in
 * `ui/player-badge.tsx` is the one answer to what a badge looks like, and there
 * used to be a second — `TONE_STYLES`, the same five tones spelled again as
 * inline styles, kept in step by hand, existing only because the results export
 * built plain DOM nodes rather than JSX. The sheets are real React with real
 * Tailwind classes, so that mirror is gone and must not come back: a chip reads
 * well on a flat dark panel already, and a second palette would be the drift
 * this whole change exists to end.
 *
 * What a sheet owns is therefore the FRAME, the type, the page and row colours,
 * the rank badges and the density — everything that makes the two images look
 * like one product, which is the thing neither of them had.
 */

/** The page and the panels on it. Flat, opaque, no translucency anywhere. */
export const SHEET = {
  /** The page. Darker than the console's `#1e1e1e`, so a row can sit ON it. */
  page: '#121316',
  /** A row. The old standings export set its canvas background to the very same
   *  literal as its even-row stripe, so in the image every other row dissolved
   *  into the backdrop — striping, inverted. One file owning both colours is
   *  what makes that impossible rather than unlikely. */
  row: '#1C1F24',
  /** A row that wants to stand out — the header band of a table. */
  band: '#24282E',
  /** Hairlines. Opaque, because 9% white over a flat page is nearly nothing. */
  rule: '#30353C',
  ink: '#FFFFFF',
  inkDim: '#A3ADBA',
  accent: '#F97316',
} as const;

/**
 * The medals, in print.
 *
 * Free to differ from the screen's, and they do — these are a shade deeper so
 * white and black text hold up after recompression. That freedom is exactly
 * what `rankTone` being a NAME buys: the two media agree on which places are
 * special without having to agree on a hex value.
 *
 * And the foreground is a LOOKUP, never arithmetic. The builder this replaces
 * computed `position <= 2 ? black : white`, and an active player's position is
 * 0 — which is `<= 2` — so the picture drew black text on the green badge where
 * the screen drew white. There is nowhere for that to live now.
 */
export const RANK_PRINT: Record<RankTone, { bg: string; fg: string }> = {
  gold:   { bg: '#E0A106', fg: '#11130F' },
  silver: { bg: '#C3CAD3', fg: '#11130F' },
  bronze: { bg: '#B4762A', fg: '#FFFFFF' },
  out:    { bg: '#3A2226', fg: '#E5B4B4' },
  active: { bg: '#14683C', fg: '#FFFFFF' },
};

/** Type, in px, because a sheet is measured rather than responsive. */
export const SHEET_TYPE = {
  title: 22,
  subtitle: 13,
  rank: 13,
  name: 17,
  cell: 13,
  head: 11,
  foot: 11,
} as const;

/** How wide each sheet renders. A sheet is a fixed canvas, not a layout. */
export const SHEET_WIDTH = {
  /** A row per player, so it only has to fit a name and its chips. */
  results: 760,
  /** Up to 25 columns of standings, which needs the room. */
  standings: 1040,
} as const;
