import RankLabel from '@/components/RankLabel';
import ExportSheet from './ExportSheet';
import { RANK_INK, SHEET, SHEET_TYPE, SHEET_WIDTH } from './exportStyle';

/**
 * The league standings, as a picture.
 *
 * **It is built rather than photographed, and that is the change.** The export it
 * replaces captured the LIVE table, which meant it had to fight the screen all
 * the way: reach into the DOM for `querySelector('table')?.parentElement`, unset
 * that element's `height`, `maxHeight` and `overflow` so the 400px cap did not
 * crop the rows, wait for layout, capture, and put the three inline styles back.
 * Then an `onclone` pass deleted every Lucide `<svg>` (so the title's trophy
 * vanished from the image), deleted every `<button>`, and swapped each movement
 * arrow for a hidden text twin that existed in the markup for no other reason.
 *
 * All of that was the cost of asking a screen to be a picture. Owning the markup
 * costs none of it: arrows are text because we write them as text, nothing has to
 * be stripped because nothing unwanted is rendered, and there is no height cap to
 * defeat because a sheet has no scroll container.
 *
 * It is handed its columns already resolved, from the SAME `enabledStats` +
 * `getPlayerStat` pair the table renders with and the CSV writes from. A third
 * column list is how the rake formula reached nine sites.
 */
export interface StandingsSheetRow {
  key: string;
  rank: number;
  name: string;
  /** Already formatted — money with its symbol, ROI with its percent sign. */
  cells: string[];
  movement?: 'up' | 'down' | 'same' | null;
}

interface StandingsSheetProps {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: StandingsSheetRow[];
}

const MOVEMENT: Record<'up' | 'down' | 'same', { glyph: string; color: string }> = {
  up:   { glyph: '▲', color: '#4ADE80' },
  down: { glyph: '▼', color: '#F87171' },
  same: { glyph: '–', color: SHEET.inkDim },
};

export default function StandingsSheet({ title, subtitle, columns, rows }: StandingsSheetProps) {
  const anyMovement = rows.some(r => r.movement);

  const cell: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: SHEET_TYPE.cell,
    borderBottom: `1px solid ${SHEET.rule}`,
    whiteSpace: 'nowrap',
  };

  return (
    <ExportSheet title={title} subtitle={subtitle} width={SHEET_WIDTH.standings}>
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
            <th
              style={{
                ...cell,
                fontSize: SHEET_TYPE.head,
                color: SHEET.inkDim,
                textAlign: 'right',
                width: 44,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              #
            </th>
            {anyMovement && <th style={{ ...cell, fontSize: SHEET_TYPE.head, width: 24 }} />}
            <th
              style={{
                ...cell,
                fontSize: SHEET_TYPE.head,
                color: SHEET.inkDim,
                textAlign: 'left',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Player
            </th>
            {columns.map(label => (
              <th
                key={label}
                style={{
                  ...cell,
                  fontSize: SHEET_TYPE.head,
                  color: SHEET.inkDim,
                  textAlign: 'right',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            // The top three wear the same medals as the results sheet, from the
            // same table — one picture of a night and one of a season should not
            // disagree about what first place looks like.
            const tone = row.rank === 1 ? 'gold'
              : row.rank === 2 ? 'silver'
              : row.rank === 3 ? 'bronze'
              : 'out';
            const move = row.movement ? MOVEMENT[row.movement] : null;
            return (
              <tr key={row.key}>
                <td style={{ ...cell, textAlign: 'right', width: 44 }}>
                  {/* Every rank is the same shape, because a tabular numeral
                      is — which is what the box used to be for. Only the top
                      three are coloured, and that no longer changes the column's
                      geometry halfway down the way a badge on three rows did. */}
                  <RankLabel label={row.rank} color={RANK_INK[tone]} emphasis={tone !== 'out'} />
                </td>
                {anyMovement && (
                  <td style={{ ...cell, textAlign: 'center', color: move?.color }}>
                    {move?.glyph ?? ''}
                  </td>
                )}
                <td style={{ ...cell, fontWeight: 600, color: SHEET.ink, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.name}
                </td>
                {/* Every figure in the mono face, right-aligned, which is what
                    makes a column of them readable as a column. The table on
                    screen has never done this — it is `text-xs` throughout with
                    no `font-mono` anywhere, so its digits do not line up. */}
                {row.cells.map((value, i) => (
                  <td
                    key={columns[i] ?? i}
                    className="font-mono"
                    style={{ ...cell, textAlign: 'right', color: SHEET.ink }}
                  >
                    {value}
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
