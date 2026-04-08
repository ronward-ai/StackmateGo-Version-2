import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, BarChart3, CalendarRange, Save, AlertTriangle } from 'lucide-react';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { POINTS_SYSTEMS, LeagueSettings, DEFAULT_LEAGUE_SETTINGS } from '@/types/leagueSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface SavedFormula {
  id: string;
  name: string;
  settings: LeagueSettings;
}

export function LeagueSettingsContent() {
  const {
    settings,
    updateSettings,
    availablePointsSystems,
    saveCustomFormulaTemplate,
    deleteSettingsFromDatabase,
    getSavedCustomFormulas
  } = useLeagueSettings();

  const [localSettings, setLocalSettings] = useState<LeagueSettings>(settings);
  const [isDirty, setIsDirty] = useState(false);
  const [previewPoints, setPreviewPoints] = useState({ position: 1, totalPlayers: 10 });
  const [error, setError] = useState<string | null>(null);
  const [savedFormulas, setSavedFormulas] = useState<SavedFormula[]>([]);
  const [templateName, setTemplateName] = useState('');

  // Sync from props when not dirty
  useEffect(() => {
    if (!isDirty) {
      setLocalSettings(settings);
    }
  }, [settings, isDirty]);

  // Check if dirty
  useEffect(() => {
    const isChanged = JSON.stringify(localSettings) !== JSON.stringify(settings);
    setIsDirty(isChanged);
  }, [localSettings, settings]);

  const handleSave = useCallback(() => {
    updateSettings(localSettings);
    setIsDirty(false);
  }, [localSettings, updateSettings]);

  // Debounced save as a fallback
  useEffect(() => {
    if (!isDirty) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 3000); // Auto-save after 3 seconds of inactivity

    return () => clearTimeout(timer);
  }, [isDirty, localSettings, handleSave]);

  const handleResetToDefaults = () => {
    setLocalSettings(DEFAULT_LEAGUE_SETTINGS);
    // Let the user click save to actually apply the reset
  };

  const loadSavedFormulas = useCallback(async () => {
    try {
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
    loadSavedFormulas();
  }, [loadSavedFormulas]);

  const previewPointsCalculation = useCallback(() => {
    const position = typeof previewPoints.position === 'number' ? previewPoints.position : 1;
    const totalPlayers = typeof previewPoints.totalPlayers === 'number' ? previewPoints.totalPlayers : 10;
    
    if (!localSettings?.pointsSystem?.formula) return 0;
    const { formula } = localSettings.pointsSystem;

    try {
      switch (formula.type) {
        case 'logarithmic': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.5;
          const points = baseMultiplier * Math.log(totalPlayers - position + 2);
          return position === 1 ? Math.floor(points * winnerMultiplier) : Math.floor(points);
        }
        case 'squareRoot': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.2;
          const points = baseMultiplier * Math.sqrt(totalPlayers - position + 1);
          return position === 1 ? Math.floor(points * winnerMultiplier) : Math.floor(points);
        }
        case 'linear': {
          const baseMultiplier = formula.baseMultiplier || 10;
          const winnerMultiplier = formula.winnerMultiplier || 1.0;
          const points = baseMultiplier * (totalPlayers - position + 1);
          return position === 1 ? Math.floor(points * winnerMultiplier) : Math.floor(points);
        }
        case 'fixed': {
          return formula.fixedPoints || 10;
        }
        case 'custom': {
          if (!formula.customFormula?.trim()) return 0;
          const safeEval = new Function(
            'f', 'p', 'k', 'b', 'c', 'z',
            'position', 'totalPlayers', 'knockouts', 'buyIn', 'totalCost', 'prizepool',
            'Math', 
            `"use strict"; return (${formula.customFormula})`
          );
          const result = safeEval(
            position, totalPlayers, 0, 0, 0, 0,
            position, totalPlayers, 0, 0, 0, 0,
            Math
          );
          const finalResult = Math.floor(Number(result)) || 0;
          return Math.max(0, finalResult);
        }
        default:
          return 0;
      }
    } catch (e) {
      return 0;
    }
  }, [localSettings, previewPoints]);

  const handleSaveTemplate = useCallback(async (name: string, formula: string) => {
    setError(null);
    try {
      const result = await saveCustomFormulaTemplate(name, formula);
      if (result) {
        const newFormula = {
          id: result.id.toString(),
          name: result.name,
          settings: result.settings
        };
        setSavedFormulas(prev => [...prev, newFormula]);
      }
      await loadSavedFormulas();
    } catch (error) {
      console.error('Error saving template:', error);
      setError(`Failed to save template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [saveCustomFormulaTemplate, loadSavedFormulas]);

  const handleDeleteTemplate = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteSettingsFromDatabase(parseInt(id));
      await loadSavedFormulas();
    } catch (error) {
      console.error('Error deleting template:', error);
      setError(`Failed to delete template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [deleteSettingsFromDatabase, loadSavedFormulas]);

  const updateFormulaParameter = (param: string, value: number | number[] | string) => {
    setLocalSettings(prev => ({
      ...prev,
      pointsSystem: {
        ...prev.pointsSystem,
        formula: {
          ...prev.pointsSystem.formula,
          [param]: value
        }
      }
    }));
  };

  const setPointsSystemType = (type: keyof typeof POINTS_SYSTEMS) => {
    const systemTemplate = POINTS_SYSTEMS[type] as any;
    setLocalSettings(prev => {
      const newPointsSystem = { ...systemTemplate };
      if (type === 'custom') {
        if (prev.pointsSystem.formula.type === 'custom' && prev.pointsSystem.formula.customFormula) {
          newPointsSystem.formula = {
            ...newPointsSystem.formula,
            customFormula: prev.pointsSystem.formula.customFormula as string
          };
        } else {
          const recentCustomSettings = savedFormulas.find(s =>
            s.settings.pointsSystem.formula.type === 'custom' &&
            s.settings.pointsSystem.formula.customFormula
          );
          if (recentCustomSettings) {
            newPointsSystem.formula = {
              ...newPointsSystem.formula,
              customFormula: recentCustomSettings.settings.pointsSystem.formula.customFormula as string
            };
          }
        }
      }
      return { ...prev, pointsSystem: newPointsSystem };
    });
  };

  return (
    <div className="space-y-6 relative pb-20">
      {/* Sticky Save Bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t z-50 flex justify-between items-center shadow-lg animate-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <AlertTriangle className="h-5 w-5" />
            <span>You have unsaved changes</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setLocalSettings(settings)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-red-600 text-sm">{error}</p>
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

      <Tabs defaultValue="points" className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="points" variant="settings" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
            <Calculator className="h-4 w-4" />
            Points
          </TabsTrigger>
          <TabsTrigger value="stats" variant="players" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
            <BarChart3 className="h-4 w-4" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="seasons" variant="league" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
            <CalendarRange className="h-4 w-4" />
            Seasons
          </TabsTrigger>
        </TabsList>

        {/* Points System Tab */}
        <TabsContent value="points" className="space-y-4">

          {/* Scoring type selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scoring Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(availablePointsSystems).map(([key, system]) => {
                  const active = localSettings.pointsSystem.formula.type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPointsSystemType(key as keyof typeof POINTS_SYSTEMS)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border/50 bg-muted/20 hover:bg-muted/40 text-muted-foreground'
                      }`}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${active ? 'border-primary bg-primary' : 'border-muted-foreground'}`} />
                      <div>
                        <div className={`text-sm font-semibold ${active ? 'text-foreground' : ''}`}>{system.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{system.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Formula Parameters */}
          {(localSettings.pointsSystem.formula.type === 'logarithmic' ||
            localSettings.pointsSystem.formula.type === 'squareRoot' ||
            localSettings.pointsSystem.formula.type === 'linear') && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Formula Parameters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Base Multiplier</Label>
                    <Input
                      type="number"
                      value={localSettings.pointsSystem.formula.baseMultiplier || 10}
                      onChange={(e) => updateFormulaParameter('baseMultiplier', parseInt(e.target.value) || 10)}
                      min={1} max={1000}
                    />
                    <p className="text-xs text-muted-foreground">Scale factor for all positions</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Winner Bonus</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={localSettings.pointsSystem.formula.winnerMultiplier || 1.0}
                      onChange={(e) => updateFormulaParameter('winnerMultiplier', parseFloat(e.target.value) || 1.0)}
                      min={1.0} max={5.0}
                    />
                    <p className="text-xs text-muted-foreground">1st place multiplier (e.g. 1.5 = 50% bonus)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Fixed Points */}
          {localSettings.pointsSystem.formula.type === 'fixed' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Position Points</CardTitle>
                <CardDescription>Players finishing outside the list score 0 points</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preset templates */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">Quick presets</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: 'F1-style', pts: [25,18,15,12,10,8,6,4,2,1] },
                      { name: 'Standard', pts: [10,7,5,3,2,1] },
                      { name: 'Extended', pts: [20,15,12,10,8,6,5,4,3,2,1] },
                      { name: 'Top Heavy', pts: [50,30,20,10,5,3,2,1] },
                      { name: 'Flat', pts: [10,9,8,7,6,5,4,3,2,1] },
                    ].map(preset => (
                      <Button
                        key={preset.name}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateFormulaParameter('positionPoints', preset.pts)}
                      >
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Position inputs */}
                <div className="space-y-1">
                  {(localSettings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1]).map((points, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6 text-right">{index + 1}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <Input
                          type="number"
                          value={points}
                          onChange={(e) => {
                            const newPoints = [...(localSettings.pointsSystem.formula.positionPoints || [])];
                            newPoints[index] = parseInt(e.target.value) || 0;
                            updateFormulaParameter('positionPoints', newPoints);
                          }}
                          min={0}
                          className="h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">pts</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500 flex-shrink-0"
                        onClick={() => {
                          const newPoints = [...(localSettings.pointsSystem.formula.positionPoints || [])];
                          newPoints.splice(index, 1);
                          updateFormulaParameter('positionPoints', newPoints);
                        }}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    const cur = localSettings.pointsSystem.formula.positionPoints || [];
                    const last = cur[cur.length - 1] ?? 1;
                    updateFormulaParameter('positionPoints', [...cur, Math.max(0, last - 1)]);
                  }}
                >
                  + Add Position
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Custom Formula */}
          {localSettings.pointsSystem.formula.type === 'custom' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Custom Formula</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  type="text"
                  value={localSettings.pointsSystem.formula.customFormula || ''}
                  onChange={(e) => updateFormulaParameter('customFormula', e.target.value)}
                  placeholder="e.g., 10 * (p - f + 1)"
                  className="font-mono"
                />

                <div className="p-3 bg-muted/50 border rounded-md">
                  <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Variables</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {[
                      ['f', 'Finish position'],
                      ['p', 'Total players'],
                      ['k', 'Knockouts'],
                      ['b', 'Buy-in'],
                      ['c', 'Total cost'],
                      ['z', 'Prize pool'],
                    ].map(([v, desc]) => (
                      <div key={v} className="flex items-center gap-2">
                        <code className="bg-background px-1.5 py-0.5 rounded border text-xs">{v}</code>
                        <span className="text-xs text-muted-foreground">{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {savedFormulas.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Saved formulas</Label>
                    {savedFormulas.map((formula) => (
                      <div key={formula.id} className="flex items-center justify-between gap-2 p-2 bg-muted rounded text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate text-xs">{formula.name.replace('Custom Formula: ', '')}</div>
                          <div className="text-xs text-muted-foreground font-mono truncate">
                            {formula.settings.pointsSystem.formula.customFormula}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => updateFormulaParameter('customFormula', formula.settings.pointsSystem.formula.customFormula || '')}
                            className="h-7 px-2 text-xs">Load</Button>
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => handleDeleteTemplate(formula.id)}
                            className="h-7 w-7 p-0">×</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
                    size="sm"
                    onClick={async () => {
                      if (templateName.trim() && localSettings.pointsSystem.formula.customFormula?.trim()) {
                        await handleSaveTemplate(templateName.trim(), localSettings.pointsSystem.formula.customFormula);
                        setTemplateName('');
                      }
                    }}
                    disabled={!templateName.trim() || !localSettings.pointsSystem.formula.customFormula?.trim()}
                  >
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bonus points — apply to all formula types */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bonus Points</CardTitle>
              <CardDescription>Added on top of position points for every game</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Participation</Label>
                  <Input
                    type="number"
                    min={0}
                    value={localSettings.pointsSystem.formula.participationPoints ?? 0}
                    onChange={(e) => updateFormulaParameter('participationPoints', parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">Points for just showing up</p>
                </div>
                <div className="space-y-2">
                  <Label>Per Knockout</Label>
                  <Input
                    type="number"
                    min={0}
                    value={localSettings.pointsSystem.formula.knockoutPoints ?? 0}
                    onChange={(e) => updateFormulaParameter('knockoutPoints', parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">Points per player eliminated</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Full position table preview */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Points Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Label className="text-sm whitespace-nowrap">Players in game</Label>
                <Input
                  type="number"
                  min={2}
                  max={50}
                  value={previewPoints.totalPlayers}
                  onChange={(e) => setPreviewPoints(prev => ({ ...prev, totalPlayers: parseInt(e.target.value) || 10 }))}
                  className="w-20"
                />
              </div>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Pos</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: previewPoints.totalPlayers }, (_, i) => {
                      const pos = i + 1;
                      const pts = (() => {
                        const { formula } = localSettings.pointsSystem;
                        const participation = formula.participationPoints ?? 0;
                        try {
                          let base = 0;
                          switch (formula.type) {
                            case 'logarithmic': {
                              const bm = formula.baseMultiplier || 10;
                              const wm = formula.winnerMultiplier || 1.5;
                              const p = bm * Math.log(previewPoints.totalPlayers - pos + 2);
                              base = pos === 1 ? Math.floor(p * wm) : Math.floor(p);
                              break;
                            }
                            case 'squareRoot': {
                              const bm = formula.baseMultiplier || 10;
                              const wm = formula.winnerMultiplier || 1.2;
                              const p = bm * Math.sqrt(previewPoints.totalPlayers - pos + 1);
                              base = pos === 1 ? Math.floor(p * wm) : Math.floor(p);
                              break;
                            }
                            case 'linear': {
                              const bm = formula.baseMultiplier || 10;
                              const wm = formula.winnerMultiplier || 1.0;
                              const p = bm * (previewPoints.totalPlayers - pos + 1);
                              base = pos === 1 ? Math.floor(p * wm) : Math.floor(p);
                              break;
                            }
                            case 'fixed': {
                              const arr = formula.positionPoints || [];
                              base = arr[pos - 1] ?? 0;
                              break;
                            }
                            case 'custom': {
                              if (!formula.customFormula?.trim()) { base = 0; break; }
                              const fn = new Function('f','p','k','b','c','z','position','totalPlayers','knockouts','buyIn','totalCost','prizepool','Math',
                                `"use strict"; return (${formula.customFormula})`);
                              base = Math.max(0, Math.floor(Number(fn(pos,previewPoints.totalPlayers,0,0,0,0,pos,previewPoints.totalPlayers,0,0,0,0,Math)) || 0));
                              break;
                            }
                          }
                          return base + participation;
                        } catch { return participation; }
                      })();
                      return (
                        <tr key={pos} className={`border-b last:border-0 ${pos <= 3 ? 'bg-orange-500/5' : ''}`}>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium tabular-nums">{pts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stats Tab */}
        <TabsContent value="stats" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Statistics Display</CardTitle>
              <CardDescription>Choose which statistics to display in the league table</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(localSettings.statsToDisplay).map(([key, enabled]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={key}
                        checked={enabled as boolean}
                        onCheckedChange={(checked) => setLocalSettings(prev => ({
                          ...prev,
                          statsToDisplay: { ...prev.statsToDisplay, [key]: !!checked }
                        }))}
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                    </div>
                  ))}
                </div>
                
                {/* Display Settings grouped together */}
                <div className="pt-6 border-t">
                  <h4 className="text-sm font-medium mb-4">Display Options</h4>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showMovementArrows"
                      checked={localSettings.displaySettings.showMovementArrows}
                      onCheckedChange={(checked) => setLocalSettings(prev => ({
                        ...prev,
                        displaySettings: { ...prev.displaySettings, showMovementArrows: !!checked }
                      }))}
                    />
                    <Label htmlFor="showMovementArrows" className="text-sm">
                      Show Movement Arrows (Rank changes)
                    </Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seasons Tab */}
        <TabsContent value="seasons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>League Season Settings</CardTitle>
              <CardDescription>Configure season names and game counts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>League Season Name</Label>
                <Input
                  type="text"
                  value={localSettings.seasonSettings.seasonName}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    seasonSettings: { ...prev.seasonSettings, seasonName: e.target.value }
                  }))}
                  placeholder="e.g., Summer 2026"
                />
              </div>
              <div className="space-y-2">
                <Label>Number of Games this Season</Label>
                <Input
                  type="number"
                  value={localSettings.seasonSettings.numberOfGames}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    seasonSettings: { ...prev.seasonSettings, numberOfGames: parseInt(e.target.value) || 12 }
                  }))}
                  min={1}
                  max={100}
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="autoReset"
                  checked={localSettings.seasonSettings.autoReset}
                  onCheckedChange={(checked) => setLocalSettings(prev => ({
                    ...prev,
                    seasonSettings: { ...prev.seasonSettings, autoReset: !!checked }
                  }))}
                />
                <Label htmlFor="autoReset">Auto-reset at season end</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50">
              Reset to Defaults
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset all league settings (points system, stats display, and season settings) back to their default values. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetToDefaults} className="bg-red-500 hover:bg-red-600">
                Reset Settings
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
