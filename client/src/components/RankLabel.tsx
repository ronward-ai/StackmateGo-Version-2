import { cn } from '@/lib/utils';

/**
 * A finishing place, as a numeral.
 *
 * **It was a filled box, and the box is what did not fit.** `bg-yellow-500`,
 * `bg-gray-300`, `bg-amber-600`, `bg-red-900` and `bg-green-600` were the only
 * solid colour blocks anywhere in this app — a vocabulary that is otherwise
 * uniformly a 10% fill, a 30% border and bright text (`TONES` in
 * `ui/player-badge.tsx`, `TournamentStatusChip`, the blind-levels break marker,
 * every section tint). So the loudest thing on either table was attached to the
 * least interesting fact in the row, and it was reported as not fitting.
 *
 * **The app already marks these three places**, one card away: the Payouts panel
 * in `TournamentInfoCard` uses `text-yellow-400 / text-gray-300 /
 * text-amber-600` with everything below in `text-muted-foreground`. The results
 * table had invented a second answer to a question that was already answered.
 *
 * ## The box was solving a problem that was already solved
 *
 * It arrived to stop the column going ragged — `1st` narrow, `21st` wider — and a
 * `minWidth` was the cure. But `.font-mono` sets `tabular-nums` app-wide, so a
 * mono numeral in a table cell lines up down the column with no box at all,
 * exactly as every stat column already does. The uniformity is in the typeface.
 *
 * ## Two things carried over, both load-bearing
 *
 * **No line-height, no height, no padding, no flex.** Settled by capturing six
 * variants through the real html2canvas: ANY explicit line-height, and both
 * inline-flex centrings, draw a label low and out of place. A browser renders all
 * six correctly, which is why it can only ever be checked in the canvas. Nothing
 * here sets one, and nothing here should.
 *
 * **The colour is a LOOKUP on a named tone, never arithmetic on the position.**
 * The builder these sheets replaced computed `position <= 2 ? black : white`, and
 * an active player's position is 0 — so the picture drew black text on the green
 * badge where the screen drew white. `rankTone` returning a NAME is what buys the
 * two media their own palettes: the screen passes `className`, the sheets pass
 * `color`.
 *
 * `emphasis` is weight rather than hue, and it is free: JetBrains Mono is loaded
 * at 500 and 700 only, so the podium is marked twice over without a third weight
 * to download.
 */
interface RankLabelProps {
  label: string | number;
  /** An explicit colour, for the exported sheets. */
  color?: string;
  /** Tailwind colours, for the screen. */
  className?: string;
  /** The podium: heavier, as well as coloured. */
  emphasis?: boolean;
  fontSize?: number;
}

export default function RankLabel({
  label, color, className, emphasis, fontSize,
}: RankLabelProps) {
  return (
    <span
      className={cn('font-mono', className)}
      data-rank-label=""
      style={{
        fontWeight: emphasis ? 700 : 500,
        whiteSpace: 'nowrap',
        ...(color ? { color } : null),
        ...(fontSize ? { fontSize } : null),
      }}
    >
      {label}
    </span>
  );
}
