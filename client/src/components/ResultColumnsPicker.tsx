import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ChevronUp, ChevronDown } from 'lucide-react';
import {
  DEFAULT_RESULT_COLUMNS, offerableResultColumns, visibleResultColumns,
  moveColumn, toggleColumn, type ColumnContext, type ResultColumn, type ResultColumnKey,
} from '@/lib/resultColumns';

/**
 * Which columns the results table shows, and in what order.
 *
 * **It is a component rather than twenty lines inside `SettingsSection` because
 * that is the fix.** Inline there it had no test by construction, and three
 * faults shipped with `npm run check` clean and every test green — the shape
 * CLAUDE.md names: a change that type-checks and passes while being wrong on
 * screen, catchable only by driving it. Same argument `lib/tableBalance.ts` and
 * `lib/seating.ts` were extracted on.
 *
 * The three, all in those twenty lines:
 *
 * 1. **The arrows moved nothing visible.** Rows were rendered from
 *    `offerableResultColumns`, which is always CANONICAL order, so a press
 *    rewrote `settings.resultColumns` and reordered the table and the exported
 *    image while this list sat still. No feedback at all, which is why it was
 *    reported as a dead control rather than as an odd one.
 * 2. **The disabled states read backwards**, because the arrow was greyed off an
 *    index into the director's order while the row sat in canonical order — so
 *    the top row's ↑ could work and a lower row's be dead.
 * 3. **A press silently dropped configuration.** It wrote back the
 *    feature-FILTERED list, so pressing an arrow in a game with bounties off
 *    removed the bounty keys from the stored order for good.
 *
 * The rule that prevents all three: **render in the order the table will use,
 * and edit the STORED array rather than the filtered one.**
 */
interface ResultColumnsPickerProps {
  /** `settings.resultColumns` — absent means the default set. */
  value?: string[];
  /** Which columns this game can offer at all. */
  context: ColumnContext;
  onChange: (next: string[]) => void;
}

export default function ResultColumnsPicker({ value, context, onChange }: ResultColumnsPickerProps) {
  // The STORED order, which may name a column whose feature is off right now.
  // Editing this rather than the visible list is what stops a press throwing
  // those keys away.
  const stored: string[] = value && value.length ? value : [...DEFAULT_RESULT_COLUMNS];

  // What the table will actually draw, resolved exactly as the table resolves
  // it, so the picker and the table cannot disagree about what is on.
  const visible = visibleResultColumns(stored, context);
  const visibleKeys = new Set(visible.map(c => c.key as string));

  const offerable = offerableResultColumns(context);
  const off: ResultColumn[] = offerable.filter(c => !visibleKeys.has(c.key));

  const move = (key: string, direction: -1 | 1) =>
    // Skip past any stored key that is not on screen, or the press trades places
    // with something invisible and the row does not move.
    onChange(moveColumn(stored, key, direction, k => visibleKeys.has(k)));

  const toggle = (key: ResultColumnKey, on: boolean) => onChange(toggleColumn(stored, key, on));

  const row = 'flex items-center gap-2 rounded-lg border border-border/40 px-2 py-1.5';

  return (
    <div className="space-y-1" data-testid="result-columns-picker">
      {/* IN THE ORDER THE TABLE WILL USE THEM. This is the whole fix: a press
          moves the row, which is the only thing that makes the arrows read as
          working. */}
      {visible.map((col, index) => (
        <div key={col.key} className={row} data-testid={`col-row-${col.key}`}>
          <input
            type="checkbox"
            id={`col-${col.key}`}
            checked
            onChange={() => toggle(col.key, false)}
            className="h-4 w-4 accent-primary flex-shrink-0"
          />
          <Label htmlFor={`col-${col.key}`} className="flex-1 text-label cursor-pointer">
            {col.label}
          </Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={index === 0}
            aria-label={`Move ${col.label} up`}
            onClick={() => move(col.key, -1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={index === visible.length - 1}
            aria-label={`Move ${col.label} down`}
            onClick={() => move(col.key, 1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {off.length > 0 && (
        <>
          <div className="pt-2 text-caption text-muted-foreground">Not shown</div>
          {/* No arrows down here: there is nothing to order until a column is on,
              and a disabled arrow against every unticked row is the noise the
              Busted strip's own rule exists to avoid. */}
          {off.map(col => (
            <div key={col.key} className={row} data-testid={`col-row-${col.key}`}>
              <input
                type="checkbox"
                id={`col-${col.key}`}
                checked={false}
                onChange={() => toggle(col.key, true)}
                className="h-4 w-4 accent-primary flex-shrink-0"
              />
              <Label htmlFor={`col-${col.key}`} className="flex-1 text-label cursor-pointer">
                {col.label}
              </Label>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
