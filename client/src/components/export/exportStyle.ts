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
 * the rank ink and the density — everything that makes the two images look
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
 * The medals, in print — as INK, not as a fill.
 *
 * The badge these replace was a filled block, which was the only solid colour
 * surface either image had; `components/RankLabel.tsx` records why that did not
 * fit. What survives is the part that was right: the print palette is free to
 * differ from the screen's, and does, because a picture gets recompressed and
 * looked at in daylight. These are deeper than the screen's `text-yellow-400`
 * and friends so they hold up as text on `SHEET.row` rather than as a block.
 *
 * That freedom is exactly what `rankTone` being a NAME buys: the two media agree
 * on which places are special without having to agree on a hex value.
 *
 * And it is a LOOKUP, never arithmetic. The builder this replaces computed
 * `position <= 2 ? black : white`, and an active player's position is 0 — which
 * is `<= 2` — so the picture drew black where the screen drew white. There is
 * nowhere for that to live now.
 */
export const RANK_INK: Record<RankTone, string> = {
  gold:   '#E8B33C',
  silver: '#C3CAD3',
  bronze: '#C98A3F',
  /** Everybody else who busted: the same dim ink the rest of the sheet uses. */
  out:    '#A3ADBA',
  /** Still in, and the one label that is a word. The app's single accent. */
  active: '#F97316',
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
