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
  height?: number;
  fontSize?: number;
}

export default function RankBadge({
  label, tone, className, mutedColor, minWidth = 48, height = 22, fontSize,
}: RankBadgeProps) {
  return (
    <span
      className={cn('font-mono', className)}
      data-rank-badge=""
      style={{
        display: 'inline-block',
        boxSizing: 'border-box',
        minWidth,
        height,
        // Equal to the height, which is the whole reason the text sits in the
        // middle of the box rather than near the top of it.
        lineHeight: `${height}px`,
        padding: '0 8px',
        borderRadius: 4,
        textAlign: 'center',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        ...(fontSize ? { fontSize } : null),
        ...(tone
          ? { background: tone.bg, color: tone.fg }
          : { background: 'transparent', ...(mutedColor ? { color: mutedColor } : null) }),
      }}
    >
      {label}
    </span>
  );
}
