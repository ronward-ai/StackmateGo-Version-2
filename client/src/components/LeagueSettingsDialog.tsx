import React, { Fragment, useMemo, useState, useCallback, useEffect } from 'react';
import { POINTS_PRESETS } from '@/lib/pointsPresets';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Settings, Calculator, BarChart3, Trophy, Info, ChevronUp, ChevronDown, CalendarDays, Check, X } from 'lucide-react';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { useLeague } from '@/hooks/useLeague';
import LeagueSeasonsTab from '@/components/LeagueSeasonsTab';
import LeagueScopeBar from '@/components/LeagueScopeBar';
import LeagueDangerZone from '@/components/LeagueDangerZone';
import { POINTS_SYSTEMS, STAT_LABELS, DEFAULT_LEAGUE_SETTINGS } from '@/types/leagueSettings';

// Define the structure for a saved formula template
interface SavedFormula {
  id: string;
  name: string;
  settings: {
    pointsSystem: {
      formula: {
        type: string;
        customFormula: string;
      };
    };
  };
}

interface LeagueSettingsDialogProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}




export function LeagueSettingsDialog({ children, open: controlledOpen, onOpenChange }: LeagueSettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  // A controlled dialog already has an external trigger (the cog in LeagueSection),
  // so rendering the built-in fallback trigger as well put TWO League Settings
  // controls on screen opening the same dialog. The fallback is only for the
  // uncontrolled case.
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  const [previewPoints, setPreviewPoints] = useState({ position: 1, totalPlayers: 10 });
  const [error, setError] = useState<string | null>(null);
  const [savedFormulas, setSavedFormulas] = useState<SavedFormula[]>([]); // State for saved formulas
  const [templateName, setTemplateName] = useState(''); // State for the template name input

  const { league } = useLeague();
  const leagueId = league?.id ? String(league.id) : null;

  // Safe hook usage with error handling
  let hookData;
  try {
    hookData = useLeagueSettings(undefined, leagueId);
  } catch (err) {
    console.error('Error loading league settings:', err);
    setError('Failed to load league settings');
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {!isControlled && (
          <DialogTrigger asChild>
            {children || (
              <Button variant="outline" className="gap-2">
                <Settings className="h-4 w-4" />
                League Settings
              </Button>
            )}
          </DialogTrigger>
        )}
        <DialogContent>
          <div className="p-4 text-center">
            <p className="text-destructive text-body">Error loading league settings. Please try again.</p>
            <Button onClick={() => setIsOpen(false)} className="mt-4">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const {
    settings,
    updateSettings,
    updateStatsToDisplay,
    updateDisplaySettings,
    saveSettingsToDatabase,
    resetToDefaults,
    calculatePoints,
    updateCustomFormula,
    setPointsSystemType,
    updatePointsSystem,
    availablePointsSystems,
    saveCustomFormulaTemplate,
    deleteSettingsFromDatabase,
    getSavedCustomFormulas
  } = hookData;

  // Auto-save to Firestore (scoped to leagueId) whenever settings change
  useEffect(() => {
    if (!leagueId || !settings) return;
    const timer = setTimeout(() => {
      saveSettingsToDatabase('League Settings', true, settings);
    }, 400);
    return () => clearTimeout(timer);
  }, [settings, leagueId]);

  const effectiveStatsOrder = settings.statsOrder?.length
    ? settings.statsOrder
    : Object.keys(DEFAULT_LEAGUE_SETTINGS.statsToDisplay);

  const moveStatUp = useCallback((index: number) => {
    if (index === 0) return;
    const next = [...effectiveStatsOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updateSettings({ ...settings, statsOrder: next });
  }, [effectiveStatsOrder, settings, updateSettings]);

  const moveStatDown = useCallback((index: number) => {
    if (index === effectiveStatsOrder.length - 1) return;
    const next = [...effectiveStatsOrder];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updateSettings({ ...settings, statsOrder: next });
  }, [effectiveStatsOrder, settings, updateSettings]);

  // Load saved formulas from database
  const loadSavedFormulas = useCallback(async () => {
    try {
      // Get custom formulas from the hook - check if function exists first
      const customFormulas = getSavedCustomFormulas?.() || [];
      const formulaTemplates = customFormulas.map(formula => ({
        id: formula.id.toString(),
        name: formula.name,
        settings: formula.settings
      }));

      setSavedFormulas(formulaTemplates);
    } catch (error) {
      console.error('Error loading saved formulas:', error);
      setSavedFormulas([]);
    }
  }, [getSavedCustomFormulas]);

  useEffect(() => {
    if (isOpen) {
      loadSavedFormulas();
    }
  }, [isOpen, loadSavedFormulas]);

  // Points system preview with error handling
  /**
   * What each place scores, straight from the scoring engine.
   *
   * Not a second implementation: `calculatePoints` is the same function the
   * league scores with, so the table cannot disagree with a real game — which
   * is more than can be said for the "Formula valid" check above it.
   *
   * The first eight places, then the last, which is where the schemes differ:
   * a set-points scheme pays nothing past ninth while the others still score
   * the bubble.
   */
  const previewRows = useMemo(() => {
    const field = typeof previewPoints.totalPlayers === 'number' && previewPoints.totalPlayers >= 2
      ? Math.min(previewPoints.totalPlayers, 1000)
      : 10;

    const positions = Array.from(
      new Set([...Array.from({ length: Math.min(8, field) }, (_, i) => i + 1), field]),
    ).sort((a, b) => a - b);

    const ordinal = (n: number) => {
      const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th'
        : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
      return `${n}${suffix}`;
    };

    return positions.map(position => ({
      position,
      label: position === 1 ? 'Winner'
        : position === field ? `${ordinal(position)} — last`
        : ordinal(position),
      points: calculatePoints(position, field, 0),
    }));
  }, [calculatePoints, previewPoints.totalPlayers, settings.pointsSystem]);

  // Handle saving custom formula template
  const handleSaveTemplate = useCallback(async (name: string, formula: string) => {
    setError(null);
    try {
      const result = await saveCustomFormulaTemplate(name, formula);
      console.log('Template saved successfully:', result);

      // Immediately add the saved template to the savedFormulas state
      if (result) {
        const newFormula = {
          id: result.id.toString(),
          name: result.name,
          settings: result.settings
        };
        setSavedFormulas(prev => [...prev, newFormula]);
      }

      // Also reload from the hook to ensure consistency
      await loadSavedFormulas();
    } catch (error) {
      console.error('Error saving template:', error);
      setError(`Failed to save template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [saveCustomFormulaTemplate, loadSavedFormulas]);

  // Handle deleting custom formula template
  const handleDeleteTemplate = useCallback(async (id: string) => {
    setError(null);

    try {
      // Pass the id through unchanged. These are Firestore auto-ids, so
      // parseInt() yielded NaN and deleted a document literally named "NaN" —
      // which resolves successfully, so the dialog reported success while the
      // formula stayed exactly where it was.
      await deleteSettingsFromDatabase(id);
      await loadSavedFormulas(); // Reload formulas after deleting
    } catch (error) {
      console.error('Error deleting template:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('not authenticated')) {
        setError('Please log in to delete custom formula templates');
      } else {
        setError(`Failed to delete template: ${errorMessage}`);
      }
    }
  }, [deleteSettingsFromDatabase, loadSavedFormulas]);



  // Update formula parameters for algorithmic systems
  const updateFormulaParameter = (param: string, value: number | number[] | string) => { // Modified to accept string and array
    const currentFormula = settings.pointsSystem.formula;
    updatePointsSystem({
      ...settings.pointsSystem,
      formula: {
        ...currentFormula,
        [param]: value
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          {children || (
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              League Settings
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Manage League
          </DialogTitle>
          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 mt-2">
              <p className="text-destructive text-label">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="mt-1 h-6 px-2 text-xs"
              >
                Dismiss
              </Button>
            </div>
          )}
        </DialogHeader>

        {/* League is the SCOPE for everything below — settings are stored per
            league — so it sits above the tabs rather than beside them. */}
        <LeagueScopeBar />

        <Tabs defaultValue="seasons" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="seasons" className="h-full">
              <CalendarDays className="h-4 w-4" />
              Seasons
            </TabsTrigger>
            <TabsTrigger value="points" className="h-full">
              <Calculator className="h-4 w-4" />
              Points
            </TabsTrigger>
            <TabsTrigger value="stats" className="h-full">
              <BarChart3 className="h-4 w-4" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="seasons" className="mt-4">
            <LeagueSeasonsTab />
          </TabsContent>

          {/* Points System Tab */}
          <TabsContent value="points" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Points</CardTitle>
                <CardDescription>
                  How a finishing position turns into league points. Pick one and look at the table.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Points System Type Selection */}
                <div className="space-y-2">
                  <Label>How should points work?</Label>
                  <Select
                    value={settings.pointsSystem.formula.type}
                    onValueChange={(value) => setPointsSystemType(value as keyof typeof POINTS_SYSTEMS)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(availablePointsSystems).map(([key, systemValue]) => {
                        const system = systemValue as any;
                        return (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {system.name}
                              {/* The technical term stays, quietly, for anyone
                                  who came from software that used it. */}
                              {system.mathName && system.mathName !== system.name && (
                                <span className="text-muted-foreground font-normal"> · {system.mathName}</span>
                              )}
                            </span>
                            <span className="text-caption text-muted-foreground">{system.description}</span>
                          </div>
                        </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Formula Parameters for Algorithmic Systems */}
                {(settings.pointsSystem.formula.type === 'logarithmic' ||
                  settings.pointsSystem.formula.type === 'squareRoot' ||
                  settings.pointsSystem.formula.type === 'linear') && (
                  <div className="grid grid-cols-2 gap-4 p-4 card-glass rounded-xl">
                    <div className="space-y-2">
                      {/* "Base Multiplier" and "Winner Multiplier" said what they
                          were, not what they do. The table below shows the
                          effect either way, but a label should not need a table
                          to be understood. */}
                      <Label>
                        Points scale
                        <span className="block text-caption font-normal text-muted-foreground">
                          Bigger numbers all round. Does not change the order.
                        </span>
                      </Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={settings.pointsSystem.formula.baseMultiplier || ''}
                        onChange={(e) => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) updateFormulaParameter('baseMultiplier', n); }}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => { if (!settings.pointsSystem.formula.baseMultiplier) updateFormulaParameter('baseMultiplier', 10); }}
                        min={1}
                        max={100}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Winner's bonus
                        <span className="block text-caption font-normal text-muted-foreground">
                          1 = no bonus. 1.5 = half as much again for first place.
                        </span>
                      </Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={settings.pointsSystem.formula.winnerMultiplier || ''}
                        onChange={(e) => { const n = parseFloat(e.target.value); if (!isNaN(n)) updateFormulaParameter('winnerMultiplier', n); }}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => { if (!settings.pointsSystem.formula.winnerMultiplier) updateFormulaParameter('winnerMultiplier', 1.0); }}
                        min={1.0}
                        max={3.0}
                      />
                    </div>
                  </div>
                )}

                {/* Fixed Points Configuration */}
                {settings.pointsSystem.formula.type === 'fixed' && (
                  <div className="p-4 card-glass rounded-xl space-y-4">
                    <div className="space-y-2">
                      <Label>Position-Based Points</Label>
                      <div className="text-xs text-muted-foreground mb-2">
                        Configure points for each finishing position. Positions beyond this array will receive 0 points.
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1]).map((points, index) => (
                          <div key={index} className="flex items-center space-x-2">
                            <Label className="text-xs w-8">{index + 1}:</Label>
                            <Input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={points === 0 ? '' : points}
                              onChange={(e) => {
                                const newPoints = [...(settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1])];
                                const raw = e.target.value.replace(/[^0-9]/g, '');
                                newPoints[index] = raw === '' ? 0 : (parseInt(raw, 10) || 0);
                                updateFormulaParameter('positionPoints', newPoints);
                              }}
                              onFocus={(e) => e.target.select()}
                              min={0}
                              max={100}
                              className="text-xs h-8"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex space-x-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentPoints = settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1];
                            updateFormulaParameter('positionPoints', [...currentPoints, 0]);
                          }}
                        >
                          Add Position
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentPoints = settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1];
                            if (currentPoints.length > 1) {
                              updateFormulaParameter('positionPoints', currentPoints.slice(0, -1));
                            }
                          }}
                        >
                          Remove Position
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            updateFormulaParameter('positionPoints', [25, 18, 13, 9, 6, 4, 3, 2, 1]);
                          }}
                        >
                          Reset to Default
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Formula Configuration */}
                {settings.pointsSystem.formula.type === 'custom' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Custom Formula</Label>
                      <Input
                        type="text"
                        value={settings.pointsSystem.formula.customFormula || ''}
                        onChange={(e) => updateCustomFormula(e.target.value)}
                        placeholder="e.g., (f==1?p*36:f==2?p*24:f==3?p*20:f==4?p*16:f==5?p*12:f==6?p*10:f==7?p*8:f==8?p*6:f<=15?p*2:f<=20?p:0)"
                        className="font-mono"
                      />

                      {/* Available Variables */}
                      {/* A reference table, not a paragraph: this is the one
                          place in the app a director has to read carefully, and
                          the symbols belong in the mono face like every other
                          figure. */}
                      <div className="card-glass rounded-xl p-3">
                        <div className="text-caption uppercase tracking-wide text-muted-foreground mb-2">
                          Available variables
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-label">
                          {[
                            ['p', 'number of players'],
                            ['f', 'finish position'],
                            ['b', 'buy-in'],
                            ['c', 'total cost (buy-in + rebuys + add-on)'],
                            ['k', 'knockouts'],
                            ['z', 'prize pool'],
                          ].map(([symbol, meaning]) => (
                            <Fragment key={symbol}>
                              <code className="font-mono font-bold text-primary">{symbol}</code>
                              <span className="text-muted-foreground">{meaning}</span>
                            </Fragment>
                          ))}
                        </div>
                      </div>

                      {/* Known schemes, ready to load.
                          Deliberately NOT entries in the points-system dropdown:
                          that lists KINDS of scoring — logarithmic, square root,
                          linear, fixed, custom — and a specific formula is an
                          instance of the last one rather than a sibling of the
                          others. They sit with the director's own saved formulas
                          and load the same way. */}
                      <div className="space-y-2">
                        <Label className="text-label font-medium">Start from a known scheme</Label>
                        {POINTS_PRESETS.map(preset => (
                          <div key={preset.id} className="flex items-start justify-between gap-2 p-2 card-glass rounded-lg">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-label">{preset.name}</div>
                              <div className="text-caption text-muted-foreground">{preset.summary}</div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-caption flex-shrink-0"
                              onClick={() => updateCustomFormula(preset.formula)}
                            >
                              Load
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Saved Custom Formulas */}
                      {savedFormulas.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Saved Custom Formulas</Label>
                          <div className="space-y-1">
                            {savedFormulas.map((formula) => (
                              <div key={formula.id} className="flex items-center justify-between p-2 card-glass rounded-lg text-label">
                                <div className="flex-1 mr-2">
                                  <div className="font-medium truncate">
                                    {formula.name.replace('Custom Formula: ', '')}
                                  </div>
                                  <div className="text-xs text-muted-foreground font-mono truncate">
                                    {formula.settings.pointsSystem.formula.customFormula}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-6 px-2 text-caption"
                                    size="sm"
                                    onClick={() => {
                                      updateCustomFormula(formula.settings.pointsSystem.formula.customFormula || '');
                                    }}
                                  >
                                    Load
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                    size="sm"
                                    onClick={() => handleDeleteTemplate(formula.id)}
                                  >
                                    ×
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Save Template Section */}
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="Template name..."
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (templateName.trim() && settings.pointsSystem.formula.customFormula?.trim()) {
                                await handleSaveTemplate(templateName.trim(), settings.pointsSystem.formula.customFormula);
                                setTemplateName(''); // Clear input after saving
                              }
                            }}
                            disabled={!templateName.trim() || !settings.pointsSystem.formula.customFormula?.trim()}
                          >
                            Save Template
                          </Button>
                        </div>
                      </div>

                      {/* Formula Validation Status */}
                      <div className="flex items-center gap-2 text-sm">
                        {(() => {
                          try {
                            if (!settings.pointsSystem.formula.customFormula?.trim()) {
                              return (
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Info className="h-3 w-3" />
                                  <span>Enter a formula to see validation</span>
                                </div>
                              );
                            }

                            // Test the formula with sample values
                            const formula = settings.pointsSystem.formula.customFormula;
                            let evalFormula = formula
                              .replace(/\bp\b/g, '10')
                              .replace(/\bf\b/g, '1')
                              .replace(/\bb\b/g, '25')
                              .replace(/\bc\b/g, '25')
                              .replace(/\bk\b/g, '0')
                              .replace(/\bz\b/g, '250');

                            // Basic safety check
                            const cleanedFormula = evalFormula.replace(/Math\.[a-zA-Z]+\([^)]*\)/g, '1');
                            const allowedPattern = /^[0-9+\-*/().\s?:,[\]<>=!&|]+$/;

                            if (!allowedPattern.test(cleanedFormula)) {
                              return (
                                <div className="flex items-center gap-1 text-red-600">
                                  <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                                  <span>Formula error: Invalid characters detected</span>
                                </div>
                              );
                            }

                            // Using a more controlled eval approach
                            const safeEval = new Function('Math', '"use strict"; return (' + evalFormula + ')');
                            const testResult = Math.floor(Number(safeEval(Math))) || 0;


                            return (
                              <div className="flex items-center gap-1 text-green-600">
                                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                                <span>Formula valid</span>
                              </div>
                            );
                          } catch (err) {
                            return (
                              <div className="flex items-center gap-1 text-red-600">
                                <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                                <span>Formula error: {err instanceof Error ? err.message : 'Invalid syntax'}</span>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* What it actually pays.
                    This was ONE position at a time and a big number, so the
                    shape of a scheme was invisible: you could not see that
                    "Close together" really does finish 24, 23, 23 through the
                    middle, and you certainly could not compare two schemes.
                    The choice is made by looking, like the timer piping
                    swatches — and it reads out of the REAL scoring engine, so
                    it cannot drift from what a game will score. */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">What this scores</CardTitle>
                    <CardDescription>
                      Every figure below comes from the scoring the league will actually use.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-label text-muted-foreground">In a game of</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={previewPoints.totalPlayers === 0 ? '' : previewPoints.totalPlayers}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          setPreviewPoints(prev => ({
                            ...prev,
                            totalPlayers: raw === '' ? 0 : Math.min(1000, parseInt(raw, 10)),
                          }));
                        }}
                        onBlur={(e) => {
                          const value = parseInt(e.target.value, 10);
                          if (isNaN(value) || value < 2) {
                            setPreviewPoints(prev => ({ ...prev, totalPlayers: 10 }));
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        className="h-8 w-16 text-center text-label"
                      />
                      <Label className="text-label text-muted-foreground">players</Label>
                    </div>

                    <div className="card-glass rounded-xl divide-y divide-border/40">
                      {previewRows.map(row => (
                        <div
                          key={row.position}
                          className="flex items-center justify-between px-3 py-1.5"
                        >
                          <span className="text-label text-muted-foreground">
                            {row.label}
                          </span>
                          <span className="font-mono text-label font-bold text-foreground">
                            {row.points}
                          </span>
                        </div>
                      ))}
                    </div>

                    {previewRows.length > 0 && previewRows.every(r => r.points === 0) && (
                      // A formula that throws scores 0 for everyone and says
                      // nothing — this is the one place that shows it.
                      <p className="text-label text-destructive">
                        Nothing scores any points. Check the formula above.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Statistics Display</CardTitle>
                <CardDescription>
                  Choose which statistics to display and use ↑/↓ to set column order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-0.5">
                    {effectiveStatsOrder.map((key, index) => {
                      const enabled = (settings.statsToDisplay as any)[key] ?? false;
                      return (
                        <div key={key} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-muted/30">
                          <div className="flex flex-col shrink-0">
                            <button
                              type="button"
                              onClick={() => moveStatUp(index)}
                              disabled={index === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed p-0 leading-none"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStatDown(index)}
                              disabled={index === effectiveStatsOrder.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed p-0 leading-none"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <Checkbox
                            id={`stat-${key}`}
                            checked={enabled}
                            onCheckedChange={(checked) => updateStatsToDisplay({ [key]: !!checked })}
                          />
                          <Label htmlFor={`stat-${key}`} className="text-sm cursor-pointer select-none">
                            {STAT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').trim()}
                          </Label>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Display Options</h4>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="showMovementArrows"
                        checked={settings.displaySettings.showMovementArrows}
                        onCheckedChange={(checked) => {
                          updateDisplaySettings({
                            ...settings.displaySettings,
                            showMovementArrows: !!checked
                          });
                        }}
                      />
                      <Label htmlFor="showMovementArrows" className="text-sm">
                        Show Movement Arrows
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Display up/down arrows to show ranking changes
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* League-level, so outside the tabs: it applies whichever tab is open. */}
        <LeagueDangerZone />

        {/* Save & Close is the action that matters and takes the accent; Reset
            to Defaults is quiet. They used to be two equally loud gradient
            buttons, and the destructive one was on the left where the eye
            starts. Settings save as they are changed either way — this only
            closes the dialog. */}
        <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/40">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={resetToDefaults}>
            Reset to Defaults
          </Button>
          <Button onClick={() => setIsOpen(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
