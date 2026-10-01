import PlayerBadge from '@/components/ui/player-badge';
import type { ResultPlayerLike, ResultRow } from '@/lib/resultRows';
import ExportSheet from './ExportSheet';
import { RANK_PRINT, SHEET, SHEET_TYPE, SHEET_WIDTH } from './exportStyle';

/**
 * The finishing order, as a picture.
 *
 * It takes rows from `lib/resultRows.ts` — the same list the console renders —
 * so the image and the screen cannot disagree about a place, a payout or a chip.
 * They used to, in all three: the screen said *21th* where this said *21st*, the
 * two spelled "is the game over" differently, and the points chip here was fed a
 * buy-in of 0 where the screen was fed the fallback of 10.
 *
 * The old builder was ~130 lines of `document.createElement` and `cssText`,
 * which is why none of that was visible and why it had no test. This is
 * ordinary React with ordinary classes, because html2canvas reads computed
 * styles off a node that is in the document — the standings export has always
 * captured live Tailwind markup, so the hand-built DOM bought nothing.
 */
interface ResultsSheetProps {
  title: string;
  subtitle?: string;
  rows: ResultRow<ResultPlayerLike>[];
}

export default function ResultsSheet({ title, subtitle, rows }: ResultsSheetProps) {
  return (
    <ExportSheet title={title} subtitle={subtitle} width={SHEET_WIDTH.results}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(row => {
          const rank = RANK_PRINT[row.rankTone];
          return (
            <div
              key={String(row.player.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '11px 13px',
                background: SHEET.row,
                border: `1px solid ${SHEET.rule}`,
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <span
                  style={{
                    background: rank.bg,
                    color: rank.fg,
                    padding: '4px 9px',
                    borderRadius: 5,
                    fontSize: SHEET_TYPE.rank,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.rankLabel}
                </span>
                <span style={{ fontSize: SHEET_TYPE.name, fontWeight: 700, color: SHEET.ink }}>
                  {row.player.name}
                </span>
              </div>

              {/* The chips are the SCREEN's chips, classes and all. A second
                  palette for print is the drift `TONE_STYLES` was. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                {row.badges.map(badge => (
                  <PlayerBadge key={badge.key} badge={badge} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </ExportSheet>
  );
}
