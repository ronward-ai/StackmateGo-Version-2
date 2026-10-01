import { cn } from '@/lib/utils';

/**
 * A finishing place, in a box.
 *
 * **Reported as the badges looking janky in both exported images, and it was two
 * separate faults wearing one symptom.**
 *
 * The badge was an inline `<span>` with horizontal padding and no width, so it
 * was sized by its own text: `1st` narrow, `11th` wider, `21st` wider again. Six
 * players is six different widths with ragged edges down the one column a reader
 * runs their eye along.
 *
 * And it was an INLINE box with vertical padding, which is a different fault with
 * the same cause. Vertical padding on a non-replaced inline element does not grow
 * the line box — that is the spec, not a quirk — so the background spilled above
 * and below the line and the text sat wherever the font metrics left it rather
 * than centred in its pill. `inline-block` with an explicit height and a matching
 * line-height is what actually centres it, in a browser and in a canvas alike.
 *
 * ## minWidth, not width
 *
 * The default clears FOUR characters, not three: 46px fitted `1st` but `21st`
 * spilled to 47.3 and the column still stepped by a pixel. Measured in a real
 * browser rather than reasoned about, because that is the only way a 1.3px step
 * gets noticed.
 *
 * The longest label here is not an ordinal — it is **`Active`**, for a game
 * exported while it is still being played. A width that fits that would make
 * `1st` enormous; a MINIMUM makes every ordinal identical and lets the one odd
 * label grow past it. JetBrains Mono is fixed-pitch, so `1st` and `21st` differ
 * by exactly one character and a minimum settles both.
 *
 * ## The geometry is shared; the colour is deliberately not
 *
 * `components/export/exportStyle.ts` records why the print palette and the screen
 * palette differ on purpose, and that is what `rankTone` returning a NAME rather
 * than a colour buys. So this owns the BOX and nothing else: the screen passes
 * its Tailwind tone through `className`, the sheets pass `tone` from
 * `RANK_PRINT`. One geometry, two palettes, and no second colour table.
 *
 * A `tone` of null is a transparent box of the same size — which is what lets the
 * standings column keep one shape all the way down without inventing a medal for
 * ninth place.
 */
interface RankBadgeProps {
  label: string | number;
  /** Explicit colours, for the exported sheets. */
  tone?: { bg: string; fg: string } | null;
  /** Tailwind colours, for the screen. */
  className?: string;
  /** Colour of a null-tone box's text. Defaults to inheriting. */
  mutedColor?: string;
  minWidth?: number;
  /** Vertical padding. The box's height derives from this and the font size. */
  padY?: number;
  fontSize?: number;
}

export default function RankBadge({
  label, tone, className, mutedColor, minWidth = 48, padY = 4, fontSize,
}: RankBadgeProps) {
  return (
    <span
      className={cn('font-mono', className)}
      data-rank-badge=""
      style={{
        display: 'inline-block',
        boxSizing: 'border-box',
        minWidth,
        // NO explicit line-height, and NOT flex. This was settled by capturing
        // six variants through the real html2canvas and looking: `height` +
        // matching `lineHeight`, `lineHeight: 1`, `lineHeight: 1.2` and both
        // inline-flex centrings ALL drew the label low, half out of the fill.
        // Only an inline-block with padding and line-height left at `normal`
        // centres — so the box's height is the font's own line box plus the
        // padding, which is identical for every label because both are.
        //
        // A browser centres all six correctly, which is exactly why this cannot
        // be checked on screen: the fault only exists in the canvas. Verify any
        // change here by capturing the PNG, never by screenshotting the DOM.
        padding: `${padY}px 8px`,
        borderRadius: 4,
        textAlign: 'center',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...(fontSize ? { fontSize } : null),
        // `undefined` and `null` mean DIFFERENT things here, and collapsing them
        // into one truthiness check is what broke the screen badges: the console
        // passes its colours as a className and no tone, so the else branch set
        // `background: 'transparent'` INLINE — which beats a Tailwind class. Every
        // fill disappeared, and gold and silver are the only two tones carrying
        // `text-black`, so first and second went black on a dark row.
        //
        //   undefined -> say nothing; the className owns the colours (screen)
        //   null      -> an explicitly empty box, same size as a medal (standings)
        //   a tone    -> paint it (the sheets)
        ...(tone === undefined
          ? null
          : tone === null
            ? { background: 'transparent', ...(mutedColor ? { color: mutedColor } : null) }
            : { background: tone.bg, color: tone.fg }),
      }}
    >
      {label}
    </span>
  );
}
