import { useMemo, useState } from 'react';
import { PencilLine, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { ordinal } from '@/lib/ordinal';
import {
  editRowsFrom, validateEdit, editWarnings, knockoutsFrom,
  type EditRow, type EditablePlayer, type BustThen,
} from '@/lib/resultsEdit';

const THEN_LABEL: Record<BustThen, string> = { rebuy: 'Rebuy', reEntry: 'Re-entry', out: 'Out' };
const selectClass = 'h-8 rounded-md border border-border bg-background px-2 text-label';

/**
 * The results editor — `lib/resultsEdit.ts` owns every rule; this only draws
 * the draft. A night is each player's busts: who knocked them out each time
 * and what followed. Knockouts are shown, never typed, because they are
 * counted from the busts. Nothing is touched until Save.
 */
export default function ResultsEditor({
  players,
  prizeStructure,
  isRunning = false,
  onSave,
}: {
  players: EditablePlayer[];
  prizeStructure?: { enableBounties?: boolean; bountyType?: string } | null;
  isRunning?: boolean;
  onSave: (rows: EditRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);

  const errors = useMemo(() => validateEdit(rows), [rows]);
  const warnings = useMemo(() => editWarnings(rows, prizeStructure), [rows, prizeStructure]);
  const kos = useMemo(() => knockoutsFrom(rows), [rows]);

  const update = (id: string, change: (r: EditRow) => EditRow) =>
    setRows(rs => rs.map(r => (r.id === id ? change(r) : r)));

  const setPlace = (id: string, value: string) => update(id, r => {
    const place = value === '' ? null : Number(value);
    const earlier = r.busts.filter(b => b.then !== 'out');
    const out = r.busts.find(b => b.then === 'out');
    // A finisher other than the winner was knocked out by somebody; nobody else was.
    const busts = place !== null && place !== 1 ? [...earlier, out ?? { by: null, then: 'out' as const }] : earlier;
    return { ...r, place, busts };
  });

  const n = rows.length;

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setRows(editRowsFrom(players));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <PencilLine className="h-3.5 w-3.5" />
          Edit results
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Edit results</DialogTitle>
          <DialogDescription>
            Set each player's place and every time they were knocked out — who did it, and whether
            they rebought, re-entered or were out. Knockouts are counted from these.
          </DialogDescription>
        </DialogHeader>

        {isRunning && (
          <p className="text-label text-amber-400">
            The clock is running. Saving changes the game as it is being played.
          </p>
        )}

        <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
          {rows.map(r => (
            <div key={r.id} className="rounded-lg border border-border/40 p-3" data-row={r.name}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium truncate">{r.name}</span>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-caption text-muted-foreground font-mono">{kos.get(r.id) ?? 0} KO</span>
                  <select
                    aria-label={`${r.name}'s place`}
                    className={selectClass}
                    value={r.place ?? ''}
                    onChange={e => setPlace(r.id, e.target.value)}
                  >
                    <option value="">Still in</option>
                    {Array.from({ length: n }, (_, i) => i + 1).map(p => (
                      <option key={p} value={p}>{ordinal(p)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {r.busts.length > 0 && (
                <ol className="mt-2 space-y-1.5">
                  {r.busts.map((b, i) => (
                    <li key={i} className="flex items-center gap-2 text-label">
                      <span className="text-muted-foreground w-24 flex-shrink-0">Busted by</span>
                      <select
                        aria-label={`${r.name} bust ${i + 1} hitman`}
                        className={selectClass}
                        value={b.by ?? ''}
                        onChange={e => update(r.id, row => ({
                          ...row,
                          busts: row.busts.map((x, j) => (j === i ? { ...x, by: e.target.value || null } : x)),
                        }))}
                      >
                        <option value="">Unknown</option>
                        {rows.filter(o => o.id !== r.id).map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      <span className="text-muted-foreground">then</span>
                      {b.then === 'out' ? (
                        <span>{THEN_LABEL.out}</span>
                      ) : (
                        <select
                          aria-label={`${r.name} bust ${i + 1} then`}
                          className={selectClass}
                          value={b.then}
                          onChange={e => update(r.id, row => ({
                            ...row,
                            busts: row.busts.map((x, j) => (j === i ? { ...x, then: e.target.value as BustThen } : x)),
                          }))}
                        >
                          <option value="rebuy">{THEN_LABEL.rebuy}</option>
                          <option value="reEntry">{THEN_LABEL.reEntry}</option>
                        </select>
                      )}
                      {b.then !== 'out' && (
                        <button
                          type="button"
                          aria-label={`Remove ${r.name}'s ${THEN_LABEL[b.then].toLowerCase()}`}
                          className="p-1 text-muted-foreground hover:text-destructive"
                          onClick={() => update(r.id, row => ({ ...row, busts: row.busts.filter((_, j) => j !== i) }))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              )}

              <div className="mt-2 flex gap-2">
                {(['rebuy', 'reEntry'] as const).map(kind => (
                  <Button
                    key={kind}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-caption"
                    onClick={() => update(r.id, row => {
                      // Earlier busts go before the final one.
                      const earlier = row.busts.filter(b => b.then !== 'out');
                      const out = row.busts.filter(b => b.then === 'out');
                      return { ...row, busts: [...earlier, { by: null, then: kind }, ...out] };
                    })}
                  >
                    <Plus className="h-3 w-3" /> {THEN_LABEL[kind]}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {errors.length > 0 && (
          <ul className="text-label text-destructive space-y-0.5" aria-label="Problems">
            {errors.map(e => <li key={e}>{e}</li>)}
          </ul>
        )}
        {warnings.length > 0 && (
          <ul className="text-label text-amber-400 space-y-0.5">
            {warnings.map(w => <li key={w}>{w}</li>)}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={errors.length > 0}
            onClick={() => {
              onSave(rows);
              setOpen(false);
            }}
          >
            Save results
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

