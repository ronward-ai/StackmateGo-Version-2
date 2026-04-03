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
        <TabsContent value="points" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Points System Configuration</CardTitle>
              <CardDescription>
                Choose how points are calculated for tournament finishes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Points System Type</Label>
                <Select
                  value={localSettings.pointsSystem.formula.type}
                  onValueChange={(value) => setPointsSystemType(value as keyof typeof POINTS_SYSTEMS)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(availablePointsSystems).map(([key, system]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex flex-col">
                          <span className="font-medium">{system.name}</span>
                          <span className="text-xs text-muted-foreground">{system.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Formula Parameters */}
              {(localSettings.pointsSystem.formula.type === 'logarithmic' ||
                localSettings.pointsSystem.formula.type === 'squareRoot' ||
                localSettings.pointsSystem.formula.type === 'linear') && (
                <div className="grid grid-cols-2 gap-4 p-4 border rounded">
                  <div className="space-y-2">
                    <Label>Base Multiplier</Label>
                    <Input
                      type="number"
                      value={localSettings.pointsSystem.formula.baseMultiplier || 10}
                      onChange={(e) => updateFormulaParameter('baseMultiplier', parseInt(e.target.value) || 10)}
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Winner Multiplier</Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={localSettings.pointsSystem.formula.winnerMultiplier || 1.0}
                      onChange={(e) => updateFormulaParameter('winnerMultiplier', parseFloat(e.target.value) || 1.0)}
                      min={1.0}
                      max={3.0}
                    />
                  </div>
                </div>
              )}

              {/* Fixed Points */}
              {localSettings.pointsSystem.formula.type === 'fixed' && (
                <div className="p-4 border rounded space-y-4">
                  <div className="space-y-2">
                    <Label>Position-Based Points</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(localSettings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1]).map((points, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Label className="text-xs w-8">{index + 1}:</Label>
                          <Input
                            type="number"
                            value={points}
                            onChange={(e) => {
                              const newPoints = [...(localSettings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1])];
                              newPoints[index] = parseInt(e.target.value) || 0;
                              updateFormulaParameter('positionPoints', newPoints);
                            }}
                            min={0}
                            max={100}
                            className="text-xs h-8"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Formula */}
              {localSettings.pointsSystem.formula.type === 'custom' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Custom Formula</Label>
                    <Input
                      type="text"
                      value={localSettings.pointsSystem.formula.customFormula || ''}
                      onChange={(e) => updateFormulaParameter('customFormula', e.target.value)}
                      placeholder="e.g., 10 * (p - f + 1)"
                      className="font-mono"
                    />
                    
                    {/* Improved Formula Variables Explanation */}
                    <div className="p-4 bg-muted/50 border rounded-md space-y-2">
                      <p className="text-sm font-semibold">Available Variables</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">p</code> <span className="text-muted-foreground">Total players</span></div>
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">f</code> <span className="text-muted-foreground">Finish position</span></div>
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">k</code> <span className="text-muted-foreground">Knockouts</span></div>
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">b</code> <span className="text-muted-foreground">Buy-in amount</span></div>
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">c</code> <span className="text-muted-foreground">Total cost</span></div>
                        <div className="flex items-center gap-2"><code className="bg-background px-1.5 py-0.5 rounded border">z</code> <span className="text-muted-foreground">Prizepool</span></div>
                      </div>
                    </div>

                    {savedFormulas.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <Label className="text-sm font-medium">Saved Formulas</Label>
                        <div className="space-y-1">
                          {savedFormulas.map((formula) => (
                            <div key={formula.id} className="flex items-center justify-between gap-2 p-2 bg-muted rounded text-sm">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{formula.name.replace('Custom Formula: ', '')}</div>
                                <div className="text-xs text-muted-foreground font-mono truncate">
                                  {formula.settings.pointsSystem.formula.customFormula}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateFormulaParameter('customFormula', formula.settings.pointsSystem.formula.customFormula || '')}
                                  className="btn-load-template h-7 px-3 text-xs font-semibold"
                                >
                                  Load
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteTemplate(formula.id)}
                                  className="btn-delete-template h-7 w-7 p-0 text-base font-bold"
                                >
                                  ×
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-4">
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
                        Save Template
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Points Preview - Pulled out of the nested card */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Points Preview</CardTitle>
              <CardDescription>Test your current formula</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Position</Label>
                  <Input
                    type="number"
                    min={1}
                    value={previewPoints.position}
                    onChange={(e) => setPreviewPoints(prev => ({ ...prev, position: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <Label>Total Players</Label>
                  <Input
                    type="number"
                    min={2}
                    value={previewPoints.totalPlayers}
                    onChange={(e) => setPreviewPoints(prev => ({ ...prev, totalPlayers: parseInt(e.target.value) || 10 }))}
                  />
                </div>
              </div>
              <div className="text-center p-4 bg-background rounded-md border shadow-sm">
                <div className="text-3xl font-bold text-primary">{previewPointsCalculation()} <span className="text-lg font-normal text-muted-foreground">pts</span></div>
                <div className="text-sm text-muted-foreground mt-1">
                  Position {previewPoints.position} of {previewPoints.totalPlayers}
                </div>
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
