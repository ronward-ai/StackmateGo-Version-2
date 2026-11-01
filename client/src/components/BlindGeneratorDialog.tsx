import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Coffee } from 'lucide-react';
import { commitNumber, isDraftNumber } from '@/lib/numberField';
import { generateStructure, formatMinutes, type GeneratorInput } from '@/lib/blindGenerator';
import { colourUps, colourUpLabel, smallestChip, type Chip } from '@/lib/chipSet';
import type { BlindLevel } from '@/types';

/**
 * Build a blind structure from the night — lib/blindGenerator.ts does the work.
 *
 * Two ways in, because directors plan a night two ways: "we finish around
 * eleven" or "twenty-minute levels like always". Every figure is previewed
 * before anything changes, and applying it is one press; mid-game the caller
 * asks first, since it changes the terms of a game under way.
 */

function Field({
  label, value, onCommit, min = 0, max = 1_000_000, suffix, placeholder, allowBlank = false,
}: {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
  allowBlank?: boolean;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => { setDraft(value === undefined ? '' : String(value)); }, [value]);
  return (
    <div className="space-y-1">
      <Label className="text-label text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          aria-label={label}
          type="text"
          inputMode="numeric"
          value={draft}
          placeholder={placeholder}
          onChange={e => { if (isDraftNumber(e.target.value)) setDraft(e.target.value); }}
          onBlur={() => {
            if (allowBlank && draft.trim() === '') { onCommit(undefined); return; }
            onCommit(commitNumber(draft, { min, max, fallback: value ?? min }));
          }}
          className="h-9 font-mono text-right"
        />
        {suffix && <span className="text-label text-muted-foreground whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

export default function BlindGeneratorDialog({
  open, onOpenChange, startingStack, players, chipSet, bigBlindAnte, onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startingStack: number;
  players: number;
  chipSet: Chip[] | undefined;
  bigBlindAnte: boolean;
  onApply: (levels: BlindLevel[]) => void;
}) {
  const [mode, setMode] = useState<'duration' | 'levelLength'>('duration');
  const [hours, setHours] = useState(4);
  const [minutes, setMinutes] = useState(20);
  const [startBig, setStartBig] = useState<number | undefined>(undefined);
  const [stack, setStack] = useState(startingStack);
  const [field, setField] = useState(players);
  const [breakEvery, setBreakEvery] = useState(4);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [antesFrom, setAntesFrom] = useState<number | undefined>(undefined);

  // Each opening starts from the game as it is now.
  useEffect(() => {
    if (open) { setStack(startingStack); setField(players); }
  }, [open, startingStack, players]);

  const chip = smallestChip(chipSet) ?? 25;
  const input: GeneratorInput = {
    startingStack: stack,
    players: field,
    smallestChip: chip,
    mode: mode === 'duration' ? { kind: 'duration', hours } : { kind: 'levelLength', minutes, startBig },
    breakEvery,
    breakMinutes,
    antesFrom,
    bigBlindAnte,
  };
  const result = useMemo(() => generateStructure(input), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ups = useMemo(() => colourUps(result.levels, chipSet), [result, chipSet]);

  let blindNumber = 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Generate a blind structure</DialogTitle>
          <DialogDescription>
            Built from your stack, your field and {chipSet?.length ? `your chips (smallest ${chip})` : '25 chips'}.
            Preview it, then use it — every level can still be edited after.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto space-y-4 -mx-1 px-1">
          <Tabs value={mode} onValueChange={v => setMode(v as typeof mode)}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="duration">Finish around…</TabsTrigger>
              <TabsTrigger value="levelLength">Level length</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-3">
            {mode === 'duration' ? (
              <Field label="Night lasts about" value={hours} onCommit={v => setHours(v ?? hours)} min={1} max={24} suffix="hours" />
            ) : (
              <>
                <Field label="Each level" value={minutes} onCommit={v => setMinutes(v ?? minutes)} min={1} max={180} suffix="mins" />
                <Field label="Opening big blind" value={startBig} allowBlank placeholder="auto" onCommit={setStartBig} min={chip * 2} />
              </>
            )}
            <Field label="Starting stack" value={stack} onCommit={v => setStack(v ?? stack)} min={100} max={10_000_000} />
            <Field label="Players" value={field} onCommit={v => setField(v ?? field)} min={2} max={500} />
            <Field label="Break every" value={breakEvery} onCommit={v => setBreakEvery(v ?? 0)} min={0} max={20} suffix="levels" />
            <Field label="Break length" value={breakMinutes} onCommit={v => setBreakMinutes(v ?? breakMinutes)} min={1} max={60} suffix="mins" />
            <Field
              label={`${bigBlindAnte ? 'BB ante' : 'Antes'} from level`}
              value={antesFrom}
              allowBlank
              placeholder="none"
              onCommit={setAntesFrom}
              min={1}
              max={100}
            />
          </div>

          <div className="flex items-baseline justify-between text-label">
            <span className="text-muted-foreground">
              {result.levelMinutes}-minute levels · finishes in about{' '}
              <span className="font-mono text-foreground" data-testid="finish-estimate">{formatMinutes(result.finishMinutes)}</span>
            </span>
            <span className="text-caption text-muted-foreground">{result.levels.filter(l => !l.isBreak).length} levels</span>
          </div>

          <div className="rounded-lg border border-border/30 divide-y divide-border/20" data-testid="generated-levels">
            {result.levels.map((level, i) => {
              const up = ups.get(i);
              if (level.isBreak) {
                return (
                  <div key={i} className="px-3 py-1.5 text-label text-amber-400 flex items-center gap-2 bg-amber-500/5">
                    <Coffee className="h-3.5 w-3.5" /> Break · {level.duration / 60} mins
                    {up && <span className="text-caption text-muted-foreground">· {colourUpLabel(up)}</span>}
                  </div>
                );
              }
              blindNumber += 1;
              return (
                <div key={i} className="px-3 py-1.5 grid grid-cols-[32px_1fr_auto] gap-2 text-label items-baseline">
                  <span className="text-muted-foreground font-mono">{blindNumber}</span>
                  <span className="font-mono">
                    {level.small.toLocaleString()}/{level.big.toLocaleString()}
                    {level.ante ? <span className="text-amber-400/80"> · ante {level.ante.toLocaleString()}</span> : null}
                    {up && <span className="block text-caption text-muted-foreground font-sans">{colourUpLabel(up)}</span>}
                  </span>
                  <span className="text-caption text-muted-foreground">{level.duration / 60}m</span>
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onApply(result.levels)}>Use this structure</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
