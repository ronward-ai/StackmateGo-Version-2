import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Coins, Plus, X, AlertTriangle } from 'lucide-react';
import { commitNumber, isDraftNumber } from '@/lib/numberField';
import {
  CHIP_COLOURS, chipHex, chipsInPlay, stackBreakdown, stacksAvailable, shortageNote, type Chip,
} from '@/lib/chipSet';

/**
 * The director's chips: colour, value, and how many they own.
 *
 * Saved as it changes (it is a setting, like the clock's), through
 * `updateSettings({ chipSet })` — see lib/chipSet.ts for why it lives there.
 * Beneath it: how one starting stack is made up, how many stacks the chips make,
 * and a warning when that is fewer than the night needs. It warns and never
 * refuses.
 */

/** A number box that lets typing pass through blanks, committing on leave. */
function ChipNumber({
  value, onCommit, placeholder, allowBlank = false, label,
}: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  placeholder?: string;
  allowBlank?: boolean;
  label: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => { setDraft(value === undefined ? '' : String(value)); }, [value]);
  return (
    <Input
      aria-label={label}
      type="text"
      inputMode="numeric"
      value={draft}
      placeholder={placeholder}
      onChange={e => { if (isDraftNumber(e.target.value)) setDraft(e.target.value); }}
      onBlur={() => {
        if (allowBlank && draft.trim() === '') { onCommit(undefined); return; }
        onCommit(commitNumber(draft, { min: 1, max: 10_000_000, fallback: value ?? 1 }));
      }}
      className="h-8 text-right font-mono"
    />
  );
}

/** A sensible next chip: the next standard value above the biggest so far. */
function nextChip(chips: Chip[]): Chip {
  const used = new Set(chips.map(c => c.colour));
  const colour = CHIP_COLOURS.find(c => !used.has(c.name))?.name ?? CHIP_COLOURS[0].name;
  const ladder = [25, 100, 500, 1000, 5000, 25000, 100000];
  const top = Math.max(0, ...chips.map(c => c.value));
  return { colour, value: ladder.find(v => v > top) ?? top * 5 };
}

export default function ChipSetEditor({
  chipSet, onChange, startingStack, defaultPlayers,
}: {
  chipSet: Chip[] | undefined;
  onChange: (chips: Chip[]) => void;
  startingStack: number;
  defaultPlayers: number;
}) {
  const chips = chipSet ?? [];
  const [players, setPlayers] = useState(defaultPlayers);
  const update = (i: number, patch: Partial<Chip>) =>
    onChange(chips.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const breakdown = stackBreakdown(startingStack, chips);
  const available = stacksAvailable(breakdown);
  const shortage = shortageNote(breakdown, players);
  const inPlay = chipsInPlay(chips);

  return (
    <Card className="card-glass rounded-xl">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-indigo-400" />
          <span className="text-sm font-semibold uppercase tracking-wide">Chip Set</span>
        </div>
        <p className="text-label text-muted-foreground -mt-2">
          The chips you play with. Used for colour-ups, the blind generator, and to check you have enough.
          Saved as you change it.
        </p>

        {chips.length > 0 && (
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_88px_88px_32px] gap-2 text-caption text-muted-foreground uppercase tracking-wide">
              <span>Colour</span><span className="text-right">Value</span><span className="text-right">You own</span><span />
            </div>
            {chips.map((chip, i) => (
              <div key={i} className="grid grid-cols-[1fr_88px_88px_32px] gap-2 items-center" data-testid="chip-row">
                <Select value={chip.colour} onValueChange={v => update(i, { colour: v })}>
                  <SelectTrigger className="h-8" aria-label="Chip colour">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHIP_COLOURS.map(c => (
                      <SelectItem key={c.name} value={c.name}>
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: c.hex }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ChipNumber label="Chip value" value={chip.value} onCommit={v => update(i, { value: v ?? chip.value })} />
                <ChipNumber
                  label="How many you own"
                  value={chip.count}
                  allowBlank
                  placeholder="—"
                  onCommit={v => update(i, { count: v })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${chip.colour} chip`}
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(chips.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...chips, nextChip(chips)])}>
          <Plus className="h-3.5 w-3.5" />
          Add chip
        </Button>

        {inPlay.length > 0 && (
          <div className="rounded-lg bg-background/30 p-3 space-y-2" data-testid="stack-breakdown">
            {breakdown ? (
              <>
                <div className="text-caption text-muted-foreground uppercase tracking-wide">
                  One starting stack ({startingStack.toLocaleString()})
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {breakdown.map(part => (
                    <span key={part.chip.value} className="flex items-center gap-1.5 font-mono text-label">
                      <span className="h-3 w-3 rounded-full border border-white/30" style={{ background: chipHex(part.chip.colour) }} />
                      {part.n} × {part.chip.value.toLocaleString()}
                    </span>
                  ))}
                </div>
                {available && (
                  <div className="flex items-center gap-2 text-label text-muted-foreground flex-wrap">
                    <span>Enough for <span className="font-mono text-foreground">{available.stacks}</span> stacks · players tonight</span>
                    <div className="w-16"><ChipNumber label="Players tonight" value={players} onCommit={v => setPlayers(v ?? players)} /></div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-label text-amber-300">
                A {startingStack.toLocaleString()} stack can't be made exactly from these chips.
              </div>
            )}
            {shortage && (
              <div className="flex items-start gap-2 text-label text-amber-300" role="alert">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{shortage}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
