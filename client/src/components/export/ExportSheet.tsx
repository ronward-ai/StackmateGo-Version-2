import { useState, type ReactNode } from 'react';
import { SHEET, SHEET_TYPE } from './exportStyle';

/**
 * The frame both exported images wear.
 *
 * **This is the thing neither of them had.** The results PNG was a bare stack of
 * rows; the standings PNG was a crop of the live card that happened to include
 * its own title and happened to exclude the card's border, because the capture
 * root sat INSIDE `<Card>`. Two files with nothing in common, from one app, and
 * they are what a director actually posts to the group chat.
 *
 * So: one header saying what this is and when, one footer saying what made it.
 * Everything that makes the two read as a pair lives here, once.
 *
 * **The footer carries the wordmark and the address** (requested), and the
 * wordmark is an `<img>` only because `captureSheet` now WAITS for every image
 * in the sheet before html2canvas runs. It was text before for exactly that
 * reason: an image not yet loaded comes out blank, with no second chance and no
 * error. Its size is set explicitly so the layout never depends on it loading,
 * and if it fails it falls back to the name as text.
 *
 * **It is a PNG, not `/stackmatelogo.svg`, and that is load-bearing.** The SVG
 * has a viewBox and no width or height, and html2canvas drew it as NOTHING —
 * captured for real in Chromium, the footer had the address and an empty space.
 * `stackmate-wordmark.png` (364×48, transparent) is the same wordmark rendered
 * from the SVG; a PNG has an intrinsic size and draws everywhere, iOS included.
 */
export const SITE_ADDRESS = 'stackmatego.com';

/** The wordmark's own aspect ratio (its viewBox is 1096.46 × 144.71). */
const WORDMARK_HEIGHT = 20;
const WORDMARK_WIDTH = Math.round(WORDMARK_HEIGHT * (1096.46 / 144.71));

function Wordmark() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span style={{ fontWeight: 700, flexShrink: 0 }}>StackMate Go</span>;
  return (
    <img
      src="/stackmate-wordmark.png"
      alt="StackMate Go"
      width={WORDMARK_WIDTH}
      height={WORDMARK_HEIGHT}
      style={{ display: 'block', width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

/**
 * The date a sheet is OF — the night the game was played, not the day it was
 * exported. Takes whatever the game carries (an ISO string, a number, a Date or
 * a Firestore Timestamp) and falls back to today for a game with no date yet.
 */
export function sheetDate(value: unknown, now: Date = new Date()): string {
  const v: any = value;
  const d = v == null ? null
    : v instanceof Date ? v
    : typeof v?.toDate === 'function' ? v.toDate()
    : typeof v?.seconds === 'number' ? new Date(v.seconds * 1000)
    : new Date(v);
  const when = d && !Number.isNaN(d.getTime()) ? d : now;
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface ExportSheetProps {
  /** The event, or the league. Whatever the night is called.  */
  title: string;
  /** Season and game, or the date — the line that dates the picture. */
  subtitle?: string;
  /** When the game was played; absent means today (the standings export). */
  date?: unknown;
  width: number;
  children: ReactNode;
}

export default function ExportSheet({ title, subtitle, date, width, children }: ExportSheetProps) {
  return (
    <div
      // `font-sans` rather than the inherited default: the builder this replaces
      // set `font-family: system-ui, sans-serif` on its container, so the
      // exported results image was not in the app's typeface at all — it was in
      // whatever the director's OS happened to use. On its own that made the two
      // files look unrelated before anything else did.
      className="font-sans"
      style={{
        width,
        background: SHEET.page,
        padding: 28,
        boxSizing: 'border-box',
        color: SHEET.ink,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 14,
          marginBottom: 18,
          borderBottom: `1px solid ${SHEET.rule}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: SHEET_TYPE.title,
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
            {/* The night, beside its name (requested): a picture posted to a
                group chat a week later still says when. Lighter than the
                title so the name stays the headline. */}
            <span style={{ fontWeight: 400, color: SHEET.inkDim }}> · {sheetDate(date)}</span>
          </div>
          {/* In the accent, at 600 (requested): the season and game is what
              dates the picture, and a dim grey line under the title was the
              first thing lost to a group chat's recompression. */}
          {subtitle && (
            <div style={{ fontSize: SHEET_TYPE.subtitle, color: SHEET.accent, fontWeight: 600, marginTop: 4 }}>
              {subtitle}
            </div>
          )}
        </div>
        {/* The wordmark top right (requested), where the accent rule was. */}
        <Wordmark />
      </div>

      {children}

      <div
        style={{
          marginTop: 18,
          paddingTop: 12,
          borderTop: `1px solid ${SHEET.rule}`,
          fontSize: SHEET_TYPE.foot,
          color: SHEET.inkDim,
          textAlign: 'center',
        }}
      >
        {SITE_ADDRESS}
      </div>
    </div>
  );
}
