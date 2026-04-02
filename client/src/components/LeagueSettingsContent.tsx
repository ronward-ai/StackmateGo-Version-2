
import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, BarChart3, CalendarRange, Info } from 'lucide-react';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { POINTS_SYSTEMS } from '@/types/leagueSettings';

import { LeagueSettings } from '@/types/leagueSettings';

interface SavedFormula {
  id: string;
  name: string;
  settings: LeagueSettings;
}

export function LeagueSettingsContent() {
  const [previewPoints, setPreviewPoints] = useState({ position: 1, totalPlayers: 10 });
  const [error, setError] = useState<string | null>(null);
  const [savedFormulas, setSavedFormulas] = useState<SavedFormula[]>([]);
  const [templateName, setTemplateName] = useState('');

  const {
    settings,
    updateStatsToDisplay,
    updateDisplaySettings,
    updateSeasonSettings,
    resetToDefaults,
    calculatePoints,
    updateCustomFormula,
    setPointsSystemType,
    updatePointsSystem,
    availablePointsSystems,
    saveCustomFormulaTemplate,
    deleteSettingsFromDatabase,
    getSavedCustomFormulas
  } = useLeagueSettings();

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
    return calculatePoints(position, totalPlayers, 0);
  }, [calculatePoints, previewPoints]);

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
    <div className="space-y-6">
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

      <Tabs defaultValue="seasons" className="w-full">
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
                  value={settings.pointsSystem.formula.type}
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
              {(settings.pointsSystem.formula.type === 'logarithmic' ||
                settings.pointsSystem.formula.type === 'squareRoot' ||
                settings.pointsSystem.formula.type === 'linear') && (
                <div className="grid grid-cols-2 gap-4 p-4 border rounded">
                  <div className="space-y-2">
                    <Label>Base Multiplier</Label>
                    <Input
                      type="number"
                      value={settings.pointsSystem.formula.baseMultiplier || 10}
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
                      value={settings.pointsSystem.formula.winnerMultiplier || 1.0}
                      onChange={(e) => updateFormulaParameter('winnerMultiplier', parseFloat(e.target.value) || 1.0)}
                      min={1.0}
                      max={3.0}
                    />
                  </div>
                </div>
              )}

              {/* Fixed Points */}
              {settings.pointsSystem.formula.type === 'fixed' && (
                <div className="p-4 border rounded space-y-4">
                  <div className="space-y-2">
                    <Label>Position-Based Points</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1]).map((points, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <Label className="text-xs w-8">{index + 1}:</Label>
                          <Input
                            type="number"
                            value={points}
                            onChange={(e) => {
                              const newPoints = [...(settings.pointsSystem.formula.positionPoints || [25, 18, 13, 9, 6, 4, 3, 2, 1])];
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
              {settings.pointsSystem.formula.type === 'custom' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Custom Formula</Label>
                    <Input
                      type="text"
                      value={settings.pointsSystem.formula.customFormula || ''}
                      onChange={(e) => updateCustomFormula(e.target.value)}
                      placeholder="e.g., 10 * (p - f + 1)"
                      className="font-mono"
                    />
                    <div className="text-xs text-muted-foreground p-3 bg-muted rounded space-y-1">
                      <p><strong>Available Variables:</strong></p>
                      <p>• <code>p</code> = number of players</p>
                      <p>• <code>f</code> = finish position</p>
                      <p>• <code>k</code> = knockouts</p>
                      <p>• <code>b</code> = buy-in amount</p>
                      <p>• <code>c</code> = total cost (buy-in + rebuys + addon)</p>
                      <p>• <code>z</code> = prizepool</p>
                    </div>

                    {savedFormulas.length > 0 && (
                      <div className="space-y-2">
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
                                  onClick={() => updateCustomFormula(formula.settings.pointsSystem.formula.customFormula || '')}
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
                          if (templateName.trim() && settings.pointsSystem.formula.customFormula?.trim()) {
                            await handleSaveTemplate(templateName.trim(), settings.pointsSystem.formula.customFormula);
                            setTemplateName('');
                          }
                        }}
                        disabled={!templateName.trim() || !settings.pointsSystem.formula.customFormula?.trim()}
                      >
                        Save Template
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Points Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Points Preview</CardTitle>
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
                  <div className="text-center p-4 bg-muted rounded">
                    <div className="text-2xl font-bold">{previewPointsCalculation()} points</div>
                    <div className="text-sm text-muted-foreground">
                      Position {previewPoints.position} of {previewPoints.totalPlayers}
                    </div>
                  </div>
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
              <CardDescription>Choose which statistics to display in the league table</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(settings.statsToDisplay).map(([key, enabled]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={key}
                        checked={enabled as boolean}
                        onCheckedChange={(checked) => updateStatsToDisplay({ [key]: !!checked })}
                      />
                      <Label htmlFor={key} className="text-sm capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
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
                    <Label htmlFor="showMovementArrows" className="text-sm">Show Movement Arrows</Label>
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
                  value={settings.seasonSettings.seasonName}
                  onChange={(e) => updateSeasonSettings({ ...settings.seasonSettings, seasonName: e.target.value })}
                  placeholder="e.g., July to September 2025"
                />
              </div>
              <div className="space-y-2">
                <Label>Number of Games this Season</Label>
                <Input
                  type="number"
                  value={settings.seasonSettings.numberOfGames}
                  onChange={(e) => updateSeasonSettings({ ...settings.seasonSettings, numberOfGames: parseInt(e.target.value) || 12 })}
                  min={1}
                  max={100}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="autoReset"
                  checked={settings.seasonSettings.autoReset}
                  onCheckedChange={(checked) => updateSeasonSettings({ ...settings.seasonSettings, autoReset: !!checked })}
                />
                <Label htmlFor="autoReset">Auto-reset at season end</Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end pt-4">
        <Button onClick={resetToDefaults} variant="outline">
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}
