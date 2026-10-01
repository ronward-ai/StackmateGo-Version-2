import type { ResultPlayerLike, ResultRow } from '@/lib/resultRows';
import { visibleResultColumns, type ColumnContext } from '@/lib/resultColumns';
import RankBadge from '@/components/RankBadge';
import ExportSheet from './ExportSheet';
import { RANK_PRINT, SHEET, SHEET_TYPE, SHEET_WIDTH } from './exportStyle';

/**
 * The finishing order, as a picture.
 *
 * **A table, from the same `lib/resultColumns.ts` accessor the console uses**, so
 * the image and the screen cannot disagree about a column — the trade
 * `RealTimeLeagueTable` and its CSV already make, and the reason `getPlayerStat`
 * is shared there rather than copied.
 *
 * It was a stack of rows, each a rank badge and then a ragged strip of chips.
 * Beside the standings sheet that read badly, and the reason is structural: a
 * grid lets the eye compare down a column, where a chip strip changes width and
 * order per player so nothing lines up. Reported exactly so.
 *
 * `StandingsSheet` and this now differ only in their columns, which is the
 * point: two pictures of one league that look like one product.
 *
 * `lib/playerBadges.ts` is untouched and still right where chips belong — the
 * seating view and the participant's own check-in row.
 */
interface ResultsSheetProps {
  title: string;
  subtitle?: string;
  rows: ResultRow<ResultPlayerLike>[];
  /** The chosen columns and the currency, from `state.settings`. */
  settings?: { resultColumns?: string[]; currency?: string } | null;
  columnContext?: ColumnContext;
  currencySymbol: string;
}

export default function ResultsSheet({
  title, subtitle, rows, settings, columnContext, currencySymbol,
}: ResultsSheetProps) {
  const columns = visibleResultColumns(settings?.resultColumns, columnContext);

  // The sheet grows with the table rather than being a fixed canvas, because the
  // column count is the director's choice and a fixed width would either squeeze
  // eight columns into an unreadable row or leave four floating in whitespace.
  // Floored at the standard results width so a short table still looks like a
  // sheet and not a receipt.
  const width = Math.max(SHEET_WIDTH.results, 360 + columns.length * 96);

  const cell: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: SHEET_TYPE.cell,
    borderBottom: `1px solid ${SHEET.rule}`,
    whiteSpace: 'nowrap',
  };
  const headCell: React.CSSProperties = {
    ...cell,
    fontSize: SHEET_TYPE.head,
    color: SHEET.inkDim,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  return (
    <ExportSheet title={title} subtitle={subtitle} width={width}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          background: SHEET.row,
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr style={{ background: SHEET.band }}>
            <th style={{ ...headCell, textAlign: 'center' }}>#</th>
            <th style={{ ...headCell, textAlign: 'left' }}>Player</th>
            {columns.map(col => (
              <th
                key={col.key}
                style={{ ...headCell, textAlign: col.align }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const rank = RANK_PRINT[row.rankTone];
            return (
              <tr key={String(row.player.id)}>
                <td style={{ ...cell, textAlign: 'center' }}>
                  <RankBadge label={row.rankLabel} tone={rank} />
                </td>
                <td
                  style={{
                    ...cell,
                    fontWeight: 600,
                    color: SHEET.ink,
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row.player.name}
                </td>
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={col.numeric ? 'font-mono' : undefined}
                    style={{ ...cell, textAlign: col.align, color: SHEET.ink }}
                  >
                    {col.value(row, currencySymbol)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ExportSheet>
  );
}
