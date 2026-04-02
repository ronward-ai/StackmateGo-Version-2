import React, { useState, useCallback, useEffect } from 'react'; // Added useEffect import
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
import { Settings, Calculator, BarChart3, Trophy, Info, CalendarRange } from 'lucide-react';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { POINTS_SYSTEMS } from '@/types/leagueSettings';

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
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  const [previewPoints, setPreviewPoints] = useState({ position: 1, totalPlayers: 10 });
  const [error, setError] = useState<string | null>(null);
  const [savedFormulas, setSavedFormulas] = useState<SavedFormula[]>([]); // State for saved formulas
  const [templateName, setTemplateName] = useState(''); // State for the template name input

  // Safe hook usage with error handling
  let hookData;
  try {
    hookData = useLeagueSettings();
  } catch (err) {
    console.error('Error loading league settings:', err);
    setError('Failed to load league settings');
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {children || (
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              League Settings
            </Button>
          )}
        </DialogTrigger>
        <DialogContent>
          <div className="p-4 text-center">
            <p className="text-red-500">Error loading league settings. Please try again.</p>
            <Button onClick={() => setIsOpen(false)} className="mt-4">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

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
  } = hookData;

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
  const previewPointsCalculation = useCallback(() => {
    const position = typeof previewPoints.position === 'number' ? previewPoints.position : 1;
    const totalPlayers = typeof previewPoints.totalPlayers === 'number' ? previewPoints.totalPlayers : 10;
    return calculatePoints(position, totalPlayers, 0);
  }, [calculatePoints, previewPoints]);

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
      await deleteSettingsFromDatabase(parseInt(id));
      console.log('Template deleted successfully');
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
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Settings className="h-4 w-4" />
            League Settings
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            League Configuration
          </DialogTitle>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 mt-2">
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
        </DialogHeader>

        <Tabs defaultValue="seasons" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="points" variant="settings" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Points</span>
              <span className="sm:hidden">Points</span>
            </TabsTrigger>
            <TabsTrigger value="stats" variant="players" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Stats</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger value="seasons" variant="league" className="flex items-center justify-center gap-2 h-full text-sm font-medium">
              <CalendarRange className="h-4 w-4" />
              <span className="hidden sm:inline">League Seasons</span>
              <span className="sm:hidden">Seasons</span>
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
                {/* Points System Type Selection */}
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
                      {Object.entries(availablePointsSystems).map(([key, systemValue]) => {
                        const system = systemValue as any;
                        return (
                        <SelectItem key={key} value={key}>
                          <div className="flex flex-col">
                            <span className="font-medium">{system.name}</span>
                            <span className="text-xs text-muted-foreground">{system.description}</span>
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

                {/* Fixed Points Configuration */}
                {settings.pointsSystem.formula.type === 'fixed' && (
                  <div className="p-4 border rounded space-y-4">
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
                      <div className="flex space-x-2 mt-2">
                        <Button
                          type="button"
                          className="btn-add-position"
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
                          className="btn-remove-position"
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
                          className="btn-reset-positions"
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
                      <div className="text-xs text-muted-foreground p-3 bg-muted rounded space-y-1">
                        <p><strong>Available Variables:</strong></p>
                        <p>• <code>p</code> = number of players</p>
                        <p>• <code>f</code> = finish position</p>
                        <p>• <code>b</code> = buy-in</p>
                        <p>• <code>c</code> = total cost (buy-in + rebuys + addon)</p>
                        <p>• <code>k</code> = knockouts</p>
                        <p>• <code>z</code> = prizepool</p>
                      </div>

                      {/* Saved Custom Formulas */}
                      {savedFormulas.length > 0 && (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Saved Custom Formulas</Label>
                          <div className="space-y-1">
                            {savedFormulas.map((formula) => (
                              <div key={formula.id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
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
                                    className="btn-load-template h-6 w-12 text-xs"
                                    size="sm"
                                    onClick={() => {
                                      updateCustomFormula(formula.settings.pointsSystem.formula.customFormula || '');
                                    }}
                                  >
                                    Load
                                  </Button>
                                  <Button
                                    type="button"
                                    className="btn-delete-template h-6 w-6 p-0"
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
                            className="btn-save-template"
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
                            const allowedPattern = /^[0-9+\-*/().\s?:,\[\]<>=!&|]+$/;

                            if (!allowedPattern.test(cleanedFormula)) {
                              return (
                                <div className="flex items-center gap-1 text-red-600">
                                  <span className="text-red-500">✗</span>
                                  <span>Formula error: Invalid characters detected</span>
                                </div>
                              );
                            }

                            // Using a more controlled eval approach
                            const safeEval = new Function('Math', '"use strict"; return (' + evalFormula + ')');
                            const testResult = Math.floor(Number(safeEval(Math))) || 0;


                            return (
                              <div className="flex items-center gap-1 text-green-600">
                                <span className="text-green-500">✓</span>
                                <span>Formula valid</span>
                              </div>
                            );
                          } catch (err) {
                            return (
                              <div className="flex items-center gap-1 text-red-600">
                                <span className="text-red-500">✗</span>
                                <span>Formula error: {err instanceof Error ? err.message : 'Invalid syntax'}</span>
                              </div>
                            );
                          }
                        })()}
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
                          max={previewPoints.totalPlayers}
                          value={previewPoints.position === 0 ? '' : previewPoints.position}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setPreviewPoints(prev => ({ ...prev, position: 0 }));
                              return;
                            }
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                              setPreviewPoints(prev => ({ ...prev, position: num }));
                            }
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (isNaN(value) || value < 1) {
                              setPreviewPoints(prev => ({ ...prev, position: 1 }));
                            } else if (value > previewPoints.totalPlayers) {
                              setPreviewPoints(prev => ({ ...prev, position: previewPoints.totalPlayers }));
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label>Total Players</Label>
                        <Input
                          type="number"
                          min={2}
                          max={1000}
                          value={previewPoints.totalPlayers === 0 ? '' : previewPoints.totalPlayers}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '') {
                              setPreviewPoints(prev => ({ ...prev, totalPlayers: 0 }));
                              return;
                            }
                            const num = parseInt(value);
                            if (!isNaN(num)) {
                              setPreviewPoints(prev => ({
                                ...prev,
                                totalPlayers: num,
                                position: prev.position > num ? num : prev.position
                              }));
                            }
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value);
                            if (isNaN(value) || value < 2) {
                              setPreviewPoints(prev => ({ ...prev, totalPlayers: 10, position: Math.min(prev.position, 10) }));
                            } else if (value > 1000) {
                              setPreviewPoints(prev => ({ ...prev, totalPlayers: 1000, position: Math.min(prev.position, 1000) }));
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-center p-4 bg-muted rounded">
                      <div className="text-2xl font-bold">
                        {previewPointsCalculation()} points
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Position {previewPoints.position} out of {previewPoints.totalPlayers} players
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
                <CardDescription>
                  Choose which statistics to display in the league table
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(settings.statsToDisplay).map(([key, enabled]) => (
                      <div key={key} className="flex items-center space-x-2">
                        <Checkbox
                          id={key}
                          checked={enabled as boolean}
                          onCheckedChange={(checked) => {
                            updateStatsToDisplay({
                              [key]: !!checked
                            });
                          }}
                        />
                        <Label htmlFor={key} className="text-sm capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </Label>
                      </div>
                    ))}
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

          {/* Seasons Tab */}
          <TabsContent value="seasons" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>League Season Settings</CardTitle>
                <CardDescription>
                  Configure season names, game counts, and reset behavior for your league
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>League Season Name</Label>
                  <Input
                    type="text"
                    value={settings.seasonSettings.seasonName}
                    onChange={(e) => {
                      updateSeasonSettings({
                        ...settings.seasonSettings,
                        seasonName: e.target.value
                      });
                    }}
                    placeholder="e.g., July to September 2025"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Number of Games per League Season</Label>
                  <Input
                    type="number"
                    value={settings.seasonSettings.numberOfGames}
                    onChange={(e) => {
                      updateSeasonSettings({
                        ...settings.seasonSettings,
                        numberOfGames: parseInt(e.target.value) || 12
                      });
                    }}
                    min={1}
                    max={100}
                  />
                  <p className="text-xs text-muted-foreground">
                    League season will reset after this many tournaments
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoReset"
                    checked={settings.seasonSettings.autoReset}
                    onCheckedChange={(checked) => {
                      updateSeasonSettings({
                        ...settings.seasonSettings,
                        autoReset: !!checked
                      });
                    }}
                  />
                  <Label htmlFor="autoReset">Auto-reset at league season end</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between pt-4">
          <Button
            className="btn-reset-defaults gap-2"
            onClick={resetToDefaults}
          >
            Reset to Defaults
          </Button>
          <Button className="btn-save-close" onClick={() => setIsOpen(false)}>
            Save & Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}