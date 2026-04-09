import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue
} from "@/components/ui/select";
import { ListOrdered, Coffee, Coins, Plus, Clock } from "lucide-react";

interface BlindLevelsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

const TEMPLATES: Record<string, { label: string; duration: number; blinds: [number,number][] }> = {
  'hyper-turbo': { label: 'Hyper Turbo (5 min)', duration: 300,  blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
  'turbo':       { label: 'Turbo (10 min)',      duration: 600,  blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
  'standard':    { label: 'Standard (15 min)',   duration: 900,  blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
  'deep-stack':  { label: 'Deep Stack (30 min)', duration: 1800, blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
  'slow':        { label: 'Slow (45 min)',        duration: 2700, blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
  'pro':         { label: 'Pro (60 min)',         duration: 3600, blinds: [[10,20],[20,40],[30,60],[50,100],[100,200],[150,300],[200,400],[300,600],[500,1000]] },
};

// Compact editable number cell for the blind levels table
function LevelInput({
  value, onChange, onBlur, disabled, min = 0
}: {
  value: number; onChange: (v: number) => void;
  onBlur?: (v: number) => void; disabled?: boolean; min?: number;
}) {
  return (
    <Input
      type="text"
      value={value === 0 && !disabled ? '' : value.toString()}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '' || /^\d+$/.test(v)) onChange(v === '' ? 0 : parseInt(v));
      }}
      onBlur={(e) => {
        const v = parseInt(e.target.value);
        onBlur?.(isNaN(v) || v < min ? min : v);
      }}
      disabled={disabled}
      inputMode="numeric"
      pattern="[0-9]*"
      className={cn(
        "w-14 h-8 text-xs text-center px-1",
        "border-border/50 focus:border-primary",
        "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        disabled && "opacity-30 cursor-not-allowed"
      )}
    />
  );
}

export default function BlindLevelsSection({ tournament }: BlindLevelsSectionProps) {
  const { state, updateBlindLevel, addBlindLevel, removeLevel, addBreak, setBlindLevels } = tournament;

  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [breakDuration, setBreakDuration] = useState(10);
  const [selectedLevel, setSelectedLevel] = useState<string | undefined>();

  const [antesDialogOpen, setAntesDialogOpen] = useState(false);
  const [anteAmount, setAnteAmount] = useState(1);
  const [anteType, setAnteType] = useState<'fixed' | 'percentage'>('percentage');
  const [selectedLevelsForAntes, setSelectedLevelsForAntes] = useState<number[]>([]);

  const applyTemplate = (key: string) => {
    const t = TEMPLATES[key];
    if (!t) return;
    setBlindLevels(t.blinds.map(([small, big]) => ({ small, big, duration: t.duration })));
  };

  // Estimated total tournament time
  const totalMinutes = Math.round(
    state.levels.reduce((sum, l) => sum + (l.duration || 0), 0) / 60
  );

  const nonBreakLevels = state.levels.filter(l => !l.isBreak);

  return (
    <div className="space-y-4">
      <Card className="card-glass-purple rounded-xl">
        <CardContent className="p-5">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4 text-purple-400" />
              <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
                Blind Levels
              </span>
              <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">
                {nonBreakLevels.length} levels
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">~{totalMinutes} min total</span>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Templates" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <SelectItem key={key} value={key} className="text-xs">{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="outline" size="sm" className="btn-add-level gap-1.5 h-8 text-xs" onClick={addBlindLevel}>
              <Plus className="h-3.5 w-3.5" />
              Add Level
            </Button>
            <Button variant="outline" size="sm" className="btn-add-break gap-1.5 h-8 text-xs" onClick={() => setBreakDialogOpen(true)}>
              <Coffee className="h-3.5 w-3.5" />
              Add Break
            </Button>
            <Button variant="outline" size="sm" className="btn-add-antes gap-1.5 h-8 text-xs" onClick={() => setAntesDialogOpen(true)}>
              <Coins className="h-3.5 w-3.5" />
              Add Antes
            </Button>
          </div>

          {/* Blind levels table */}
          <div className="rounded-lg overflow-x-auto border border-border/30">
            {/* Table header */}
            <div className="grid grid-cols-[32px_56px_56px_56px_56px_32px] gap-1 px-3 py-2 bg-muted/40 border-b border-border/30 min-w-[260px]">
              {['#', 'SB', 'BB', state.settings.bigBlindAnte ? 'BB Ante' : 'Ante', 'Mins', ''].map((h, i) => (
                <div key={i} className="text-xs font-medium text-muted-foreground text-center">{h}</div>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/20">
              {state.levels.map((level, index) => {
                const isCurrentLevel = index === state.currentLevel;
                const blindLevelNum = state.levels.slice(0, index + 1).filter(l => !l.isBreak).length;

                if (level.isBreak) {
                  return (
                    <div
                      key={index}
                      className={cn(
                        "grid grid-cols-[32px_56px_56px_56px_56px_32px] gap-1 px-3 py-2 items-center min-w-[260px]",
                        "bg-amber-500/5 border-l-2 border-amber-500/40",
                        isCurrentLevel && "bg-amber-500/15 border-l-2 border-amber-400"
                      )}
                    >
                      <div className="flex justify-center">
                        <Coffee className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <div className="col-span-3 text-center">
                        <span className="text-xs text-amber-400 font-medium">
                          Break {isCurrentLevel && '← Current'}
                        </span>
                      </div>
                      <div className="flex justify-center">
                        <LevelInput
                          value={level.duration / 60}
                          onChange={(v) => updateBlindLevel(index, { duration: v * 60 })}
                          onBlur={(v) => updateBlindLevel(index, { duration: Math.max(1, v) * 60 })}
                          min={1}
                        />
                      </div>
                      <div className="flex justify-center">
                        {state.levels.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLevel(index)}
                          >
                            ×
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={index}
                    className={cn(
                      "grid grid-cols-[32px_56px_56px_56px_56px_32px] gap-1 px-3 py-2 items-center min-w-[260px]",
                      "hover:bg-muted/20 transition-colors",
                      isCurrentLevel && "bg-primary/5 border-l-2 border-primary"
                    )}
                  >
                    {/* Level number */}
                    <div className="flex justify-center">
                      {isCurrentLevel ? (
                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-primary">{blindLevelNum}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground text-center">{blindLevelNum}</span>
                      )}
                    </div>

                    {/* SB */}
                    <div className="flex justify-center">
                      <LevelInput
                        value={level.small}
                        onChange={(v) => updateBlindLevel(index, { small: v })}
                        onBlur={(v) => updateBlindLevel(index, { small: Math.max(1, v) })}
                        min={1}
                      />
                    </div>

                    {/* BB */}
                    <div className="flex justify-center">
                      <LevelInput
                        value={level.big}
                        onChange={(v) => updateBlindLevel(index, { big: v })}
                        onBlur={(v) => updateBlindLevel(index, { big: Math.max(2, v) })}
                        min={2}
                      />
                    </div>

                    {/* Ante */}
                    <div className="flex justify-center">
                      <LevelInput
                        value={level.ante || 0}
                        onChange={(v) => updateBlindLevel(index, { ante: v })}
                        onBlur={(v) => updateBlindLevel(index, { ante: Math.max(0, v) })}
                        min={0}
                      />
                    </div>

                    {/* Duration */}
                    <div className="flex justify-center">
                      <LevelInput
                        value={level.duration / 60}
                        onChange={(v) => {
                          const duration = v * 60;
                          if (state.settings.applyDurationToAll) {
                            state.levels.forEach((_, i) => updateBlindLevel(i, { duration }));
                          } else {
                            updateBlindLevel(index, { duration });
                          }
                        }}
                        onBlur={(v) => {
                          const duration = Math.max(1, v) * 60;
                          if (state.settings.applyDurationToAll) {
                            state.levels.forEach((_, i) => updateBlindLevel(i, { duration }));
                          } else {
                            updateBlindLevel(index, { duration });
                          }
                        }}
                        min={1}
                      />
                    </div>

                    {/* Remove */}
                    <div className="flex justify-center">
                      {state.levels.length > 2 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLevel(index)}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {state.settings.applyDurationToAll && (
            <p className="text-xs text-amber-400 mt-2 text-center">
              ⚡ Editing any duration updates all levels
            </p>
          )}

        </CardContent>
      </Card>

      {/* Add Break Dialog */}
      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-amber-400" />
              Add Break
            </DialogTitle>
            <DialogDescription>Insert a break after a blind level.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm">Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={breakDuration.toString()}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1 && v <= 60) setBreakDuration(v);
                    else if (e.target.value === '') setBreakDuration(10);
                  }}
                  className="w-20 h-9 text-center"
                  inputMode="numeric"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm">After Level</Label>
              <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                <SelectTrigger className="w-48 h-9">
                  <SelectValue placeholder="Select a level..." />
                </SelectTrigger>
                <SelectContent>
                  {state.levels
                    .filter(l => !l.isBreak)
                    .map((level) => {
                      const idx = state.levels.indexOf(level);
                      const num = state.levels.slice(0, idx + 1).filter(l => !l.isBreak).length;
                      return (
                        <SelectItem key={idx} value={String(idx)}>
                          Level {num}: {level.small}/{level.big}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBreakDialogOpen(false)}>Cancel</Button>
            <Button
              className="btn-add-break"
              onClick={() => {
                if (selectedLevel) {
                  addBreak(breakDuration, parseInt(selectedLevel));
                  setBreakDialogOpen(false);
                  setSelectedLevel(undefined);
                }
              }}
              disabled={!selectedLevel}
            >
              Add Break
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Antes Dialog */}
      <Dialog open={antesDialogOpen} onOpenChange={setAntesDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-purple-400" />
              Add Antes
            </DialogTitle>
            <DialogDescription>Apply antes to selected blind levels.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm">Ante Type</Label>
              <Select value={anteType} onValueChange={(v: 'fixed' | 'percentage') => setAnteType(v)}>
                <SelectTrigger className="w-52 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">% of Small Blind</SelectItem>
                  <SelectItem value="fixed">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm">{anteType === 'percentage' ? 'Percentage' : 'Amount'}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={anteAmount.toString()}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (!isNaN(v) && v >= 1) setAnteAmount(v);
                    else if (e.target.value === '') setAnteAmount(1);
                  }}
                  className="w-20 h-9 text-center"
                  inputMode="numeric"
                />
                <span className="text-sm text-muted-foreground">
                  {anteType === 'percentage' ? '%' : 'chips'}
                </span>
              </div>
            </div>

            {/* Level selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Apply to Levels</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedLevelsForAntes(
                      state.levels.map((l, i) => (!l.isBreak ? i : -1)).filter(i => i >= 0)
                    )}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setSelectedLevelsForAntes([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/30 divide-y divide-border/20 max-h-52 overflow-y-auto">
                {state.levels
                  .map((level, index) => ({ level, index }))
                  .filter(({ level }) => !level.isBreak)
                  .map(({ level, index }) => {
                    const levelNum = state.levels.slice(0, index + 1).filter(l => !l.isBreak).length;
                    const checked = selectedLevelsForAntes.includes(index);
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors",
                          checked && "bg-purple-500/5"
                        )}
                        onClick={() => setSelectedLevelsForAntes(
                          checked
                            ? selectedLevelsForAntes.filter(i => i !== index)
                            : [...selectedLevelsForAntes, index]
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => setSelectedLevelsForAntes(
                            c ? [...selectedLevelsForAntes, index] : selectedLevelsForAntes.filter(i => i !== index)
                          )}
                        />
                        <span className="text-sm flex-1">
                          Level {levelNum}: {level.small}/{level.big}
                        </span>
                        {(level.ante || 0) > 0 && (
                          <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-300">
                            ante: {level.ante}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedLevelsForAntes.length} level{selectedLevelsForAntes.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAntesDialogOpen(false)}>Cancel</Button>
            <Button
              className="btn-add-antes"
              disabled={selectedLevelsForAntes.length === 0}
              onClick={() => {
                selectedLevelsForAntes.forEach(levelIndex => {
                  const level = state.levels[levelIndex];
                  if (!level.isBreak) {
                    const anteValue = anteType === 'percentage'
                      ? Math.max(1, Math.floor(level.small * (anteAmount / 100)))
                      : anteAmount;
                    updateBlindLevel(levelIndex, { ante: anteValue });
                  }
                });
                setAntesDialogOpen(false);
                setSelectedLevelsForAntes([]);
                setAnteAmount(1);
                setAnteType('percentage');
              }}
            >
              Apply Antes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}