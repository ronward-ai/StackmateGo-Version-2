import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import RankLabel from '@/components/RankLabel';
import type { RankTone, ResultRow, ResultPlayerLike } from '@/lib/resultRows';
import { visibleResultColumns, type ColumnContext } from '@/lib/resultColumns';
import { currencyOf } from '@/lib/currency';

/**
 * The finishing order, as a table.
 *
 * **It was a rank badge followed by a strip of chips, and the standings beside
 * it were a grid.** The grid reads better for a structural reason rather than a
 * cosmetic one: every row has the same shape, so the eye runs down a column. A
 * chip strip changes width and order per player, so nothing lines up and a
 * reader has to parse each row separately. Reported exactly that way — the
 * league table "reads much easier because it has definitive columns".
 *
 * Which columns is the director's choice, from `lib/resultColumns.ts`, stored on
 * `settings.resultColumns`. The console, the participant's phone and the
 * exported image all read that one list.
 *
 * ## The column order is a decision, not a layout
 *
 * **rank · name · actions · stats**, and the actions sit third on purpose. This
 * table scrolls sideways on a phone, exactly as the standings do, and the KO
 * button is the most-pressed control of the night — anything to the right of the
 * fold can be scrolled out of reach at the moment a director is busiest. Rank
 * and name are narrow, so putting the controls immediately after them keeps them
 * on screen at any width while the configurable columns are what move.
 *
 * `PlayerSectionReadOnly` passes no `actions` and simply has no such column.
 */

/**
 * Tone to colour, on screen — **the Payouts panel's own colours**, so the two
 * cannot disagree about what first place looks like. `TournamentInfoCard` has
 * marked 1st/2nd/3rd this way all along; the filled medals this replaces were a
 * second answer to a question already answered one card up the page.
 *
 * `active` takes the app's single accent rather than a sixth green —
 * `bg-green-600` fought money-green and Broadcasting green, and `Active` is the
 * one label here that is a word rather than a place.
 *
 * The exported image has its own palette in `components/export/exportStyle.ts`,
 * which is what `rankTone` being a NAME rather than a colour buys.
 */
const RANK_INK: Record<RankTone, string> = {
  gold:   'text-yellow-400',
  silver: 'text-gray-300',
  bronze: 'text-amber-600',
  out:    'text-muted-foreground',
  active: 'text-primary',
};

/** The podium is marked by weight as well as hue. */
const PODIUM: RankTone[] = ['gold', 'silver', 'bronze'];

interface ResultsTableProps<T extends ResultPlayerLike> {
  rows: ResultRow<T>[];
  /** `state.settings` — the chosen columns and the currency. */
  settings?: { resultColumns?: string[]; currency?: string } | null;
  /** Decides which columns this game can show at all. */
  columnContext?: ColumnContext;
  /** Per-player controls. Absent on a read-only screen, and then so is the column. */
  actions?: (row: ResultRow<T>) => ReactNode;
  /** A row the viewer should be able to pick out — their own, on a phone. */
  highlightId?: string | null;
  className?: string;
}

export default function ResultsTable<T extends ResultPlayerLike>({
  rows, settings, columnContext, actions, highlightId, className,
}: ResultsTableProps<T>) {
  const columns = visibleResultColumns(settings?.resultColumns, columnContext);
  const symbol = currencyOf(settings);

  const head = 'text-caption text-muted-foreground font-medium border-r border-border last:border-r-0 whitespace-nowrap';
  const cell = 'text-caption py-2 border-r border-border last:border-r-0 whitespace-nowrap';

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden', className)}>
      {/* The cap goes on the primitive's OWN wrapper, which is the scroll
          container a sticky header resolves against — the standings carried
          `sticky top-0` for months against a box that never scrolled. */}
      <Table wrapperClassName="max-h-[460px]" className="w-full">
        <TableHeader className="bg-muted sticky top-0 z-10">
          <TableRow>
            <TableHead className={cn(head, 'w-10 text-right px-2 text-white')}>#</TableHead>
            <TableHead className={cn(head, 'px-2 text-left text-white')}>Player</TableHead>
            {actions && <TableHead className={cn(head, 'px-1 w-px')} />}
            {columns.map(col => (
              <TableHead
                key={col.key}
                className={cn(head, 'px-2 text-white', col.align === 'right' ? 'text-right' : 'text-left')}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow
              key={String(row.player.id)}
              className={cn(
                index % 2 === 0 ? 'bg-white/[0.02]' : '',
                String(row.player.id) === String(highlightId) ? 'bg-primary/10' : '',
                'transition-colors',
              )}
            >
              <TableCell className={cn(cell, 'w-10 text-right px-2')}>
                {/* A numeral, not a box. `.font-mono` carries `tabular-nums`
                    app-wide, so the column stays straight on its own — which is
                    all the box was ever for. */}
                <RankLabel
                  label={row.rankLabel}
                  className={RANK_INK[row.rankTone]}
                  emphasis={PODIUM.includes(row.rankTone)}
                />
              </TableCell>
              <TableCell
                className={cn(cell, 'px-2 font-medium text-white max-w-[9rem] truncate')}
                title={row.player.name}
              >
                {row.player.name}
              </TableCell>
              {actions && (
                <TableCell className={cn(cell, 'px-1')}>
                  <div className="flex items-center gap-1">{actions(row)}</div>
                </TableCell>
              )}
              {columns.map(col => (
                <TableCell
                  key={col.key}
                  className={cn(
                    cell,
                    'px-2',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    // Every figure in the mono face, which is what makes a
                    // column of them readable AS a column.
                    col.numeric ? 'font-mono' : '',
                  )}
                >
                  {col.value(row as ResultRow<ResultPlayerLike>, symbol)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
