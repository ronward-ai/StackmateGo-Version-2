import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BlindLevelsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function BlindLevelsSection({ tournament }: BlindLevelsSectionProps) {
  const { 
    state, 
    updateBlindLevel, 
    addBlindLevel,
    removeLevel,
    addBreak,
    setBlindLevels
  } = tournament;

  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [breakDuration, setBreakDuration] = useState(10);
  const [selectedLevel, setSelectedLevel] = useState<string | undefined>();
  const [antesDialogOpen, setAntesDialogOpen] = useState(false);
  const [anteAmount, setAnteAmount] = useState(1);
  const [anteType, setAnteType] = useState<'fixed' | 'percentage'>('percentage');
  const [selectedLevelsForAntes, setSelectedLevelsForAntes] = useState<number[]>([]);

  const applyTemplate = (template: string) => {
    if (template === 'turbo') {
      setBlindLevels([
        { small: 10, big: 20, duration: 600 },
        { small: 20, big: 40, duration: 600 },
        { small: 30, big: 60, duration: 600 },
        { small: 50, big: 100, duration: 600 },
        { small: 100, big: 200, duration: 600 },
        { small: 150, big: 300, duration: 600 },
        { small: 200, big: 400, duration: 600 },
        { small: 300, big: 600, duration: 600 },
        { small: 500, big: 1000, duration: 600 },
      ]);
    } else if (template === 'standard') {
      setBlindLevels([
        { small: 10, big: 20, duration: 900 },
        { small: 20, big: 40, duration: 900 },
        { small: 30, big: 60, duration: 900 },
        { small: 50, big: 100, duration: 900 },
        { small: 100, big: 200, duration: 900 },
        { small: 150, big: 300, duration: 900 },
        { small: 200, big: 400, duration: 900 },
        { small: 300, big: 600, duration: 900 },
        { small: 500, big: 1000, duration: 900 },
      ]);
    } else if (template === 'deep-stack') {
      setBlindLevels([
        { small: 10, big: 20, duration: 1800 },
        { small: 20, big: 40, duration: 1800 },
        { small: 30, big: 60, duration: 1800 },
        { small: 50, big: 100, duration: 1800 },
        { small: 100, big: 200, duration: 1800 },
        { small: 150, big: 300, duration: 1800 },
        { small: 200, big: 400, duration: 1800 },
        { small: 300, big: 600, duration: 1800 },
        { small: 500, big: 1000, duration: 1800 },
      ]);
    } else if (template === 'hyper-turbo') {
      setBlindLevels([
        { small: 10, big: 20, duration: 300 },
        { small: 20, big: 40, duration: 300 },
        { small: 30, big: 60, duration: 300 },
        { small: 50, big: 100, duration: 300 },
        { small: 100, big: 200, duration: 300 },
        { small: 150, big: 300, duration: 300 },
        { small: 200, big: 400, duration: 300 },
        { small: 300, big: 600, duration: 300 },
        { small: 500, big: 1000, duration: 300 },
      ]);
    } else if (template === 'slow') {
      setBlindLevels([
        { small: 10, big: 20, duration: 2700 },
        { small: 20, big: 40, duration: 2700 },
        { small: 30, big: 60, duration: 2700 },
        { small: 50, big: 100, duration: 2700 },
        { small: 100, big: 200, duration: 2700 },
        { small: 150, big: 300, duration: 2700 },
        { small: 200, big: 400, duration: 2700 },
        { small: 300, big: 600, duration: 2700 },
        { small: 500, big: 1000, duration: 2700 },
      ]);
    } else if (template === 'pro') {
      setBlindLevels([
        { small: 10, big: 20, duration: 3600 },
        { small: 20, big: 40, duration: 3600 },
        { small: 30, big: 60, duration: 3600 },
        { small: 50, big: 100, duration: 3600 },
        { small: 100, big: 200, duration: 3600 },
        { small: 150, big: 300, duration: 3600 },
        { small: 200, big: 400, duration: 3600 },
        { small: 300, big: 600, duration: 3600 },
        { small: 500, big: 1000, duration: 3600 },
      ]);
    }
  };

  return (
    <Card className="p-4 bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-orange-500">format_list_numbered</span>
          Blind Levels
        </h2>
        <Select onValueChange={applyTemplate}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Templates" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hyper-turbo">Hyper Turbo (5 min)</SelectItem>
            <SelectItem value="turbo">Turbo (10 min)</SelectItem>
            <SelectItem value="standard">Standard (15 min)</SelectItem>
            <SelectItem value="deep-stack">Deep Stack (30 min)</SelectItem>
            <SelectItem value="slow">Slow (45 min)</SelectItem>
            <SelectItem value="pro">Pro (60 min)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div>
            {/* Action Buttons - Inside collapsible content */}
            <div className="mt-4 mb-4 flex items-center space-x-2">
              {/* Add Blind Level Button */}
              <Button 
                variant="outline"
                className="btn-add-level inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-transparent gap-1"
                onClick={addBlindLevel}
              >
                <span className="material-icons text-sm">add</span>
                <span>Add Level</span>
              </Button>

              {/* Add Break Button */}
              <Button 
                variant="outline"
                className="btn-add-break inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-transparent gap-1"
                onClick={() => setBreakDialogOpen(true)}
              >
                <span className="material-icons text-sm">sports_bar</span>
                <span>Add Break</span>
              </Button>

              {/* Add Antes Button */}
              <Button 
                variant="outline"
                className="btn-add-antes inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-transparent gap-1"
                onClick={() => setAntesDialogOpen(true)}
              >
                <span className="material-icons text-sm">monetization_on</span>
                <span>Add Antes</span>
              </Button>
            </div>


            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-black">
                  <tr>
                    <th className="px-1 py-2 rounded-tl-lg text-xs">L</th>
                    <th className="px-1 py-2 text-xs">SB</th>
                    <th className="px-1 py-2 text-xs">BB</th>
                    <th className="px-1 py-2 text-xs">Ante</th>
                    <th className="px-1 py-2 text-xs">Mins</th>
                    <th className="-ml-2 pr-1 py-2 rounded-tr-lg text-xs">X</th>
                  </tr>
                </thead>
                <tbody>
                  {state.levels.map((level, index) => (
                    <tr 
                      key={index} 
                      className={cn(
                        "border-b border-[#2a2a2a]",
                        level.isBreak && "bg-secondary bg-opacity-5"
                      )}
                    >
                      <td className="px-1 py-2">
                        {level.isBreak ? (
                          <Badge variant="secondary" className="text-black flex items-center space-x-1 text-xs px-1 py-0">
                            <span className="material-icons text-xs">sports_bar</span>
                            <span>B</span>
                          </Badge>
                        ) : (
                          <span className="text-xs">
                            {state.levels
                              .slice(0, index + 1)
                              .filter(l => !l.isBreak)
                              .length}
                          </span>
                        )}
                      </td>
                      <td className="px-1 py-2">
                        {level.isBreak ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          <Input
                            type="text"
                            value={level.small.toString()}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Allow complete deletion and typing
                              if (value === '' || /^\d+$/.test(value)) {
                                updateBlindLevel(index, { small: value === '' ? 0 : parseInt(value, 10) });
                              }
                            }}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (isNaN(value) || value < 1) {
                                updateBlindLevel(index, { small: 1 });
                              }
                            }}
                            className="w-12 rounded text-xs text-center !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-1 py-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                            disabled={level.isBreak}
                            inputMode="numeric"
                            pattern="[0-9]*"
                          />
                        )}
                      </td>
                      <td className="px-1 py-2">
                        {level.isBreak ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          <Input
                            type="text"
                            value={level.big.toString()}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Allow complete deletion and typing
                              if (value === '' || /^\d+$/.test(value)) {
                                updateBlindLevel(index, { big: value === '' ? 0 : parseInt(value, 10) });
                              }
                            }}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (isNaN(value) || value < 2) {
                                updateBlindLevel(index, { big: 2 });
                              }
                            }}
                            className="w-12 rounded text-xs text-center !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-1 py-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                            disabled={level.isBreak}
                            inputMode="numeric"
                            pattern="[0-9]*"
                          />
                        )}
                      </td>
                      <td className="px-1 py-2">
                        {level.isBreak ? (
                          <span className="text-muted-foreground text-xs">-</span>
                        ) : (
                          <Input
                            type="text"
                            value={(level.ante || 0).toString()}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Allow complete deletion and typing
                              if (value === '' || /^\d+$/.test(value)) {
                                updateBlindLevel(index, { ante: value === '' ? 0 : parseInt(value, 10) });
                              }
                            }}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value, 10);
                              if (isNaN(value) || value < 0) {
                                updateBlindLevel(index, { ante: 0 });
                              }
                            }}
                            className="w-12 rounded text-xs text-center !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-1 py-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                            disabled={level.isBreak}
                            inputMode="numeric"
                            pattern="[0-9]*"
                          />
                        )}
                      </td>
                      <td className="px-1 py-2">
                        <Input
                          type="text"
                          value={(level.duration / 60).toString()}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow complete deletion and typing
                            if (value === '' || /^\d+$/.test(value)) {
                              const numValue = value === '' ? 0 : parseInt(value, 10);
                              const duration = numValue * 60;

                              // If apply to all setting is enabled, update all levels
                              if (state.settings.applyDurationToAll) {
                                // Update all levels with the new duration
                                state.levels.forEach((_, levelIndex) => {
                                  updateBlindLevel(levelIndex, { duration });
                                });
                              } else {
                                // Only update this specific level
                                updateBlindLevel(index, { duration });
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const value = parseInt(e.target.value, 10);
                            if (isNaN(value) || value < 1) {
                              const duration = 60; // 1 minute default
                              if (state.settings.applyDurationToAll) {
                                state.levels.forEach((_, levelIndex) => {
                                  updateBlindLevel(levelIndex, { duration });
                                });
                              } else {
                                updateBlindLevel(index, { duration });
                              }
                            }
                          }}
                          className="w-12 rounded text-xs text-center !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-1 py-1 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                          inputMode="numeric"
                          pattern="[0-9]*"
                        />
                      </td>

                      <td className="pl-0 pr-0 py-2">
                        {/* Only show delete button if we have more than 2 levels */}
                        {state.levels.length > 2 && (
                          <Button 
                            variant="ghost" 
                            className="h-6 w-6 p-0 flex items-center justify-center text-red-500 hover:text-red-400 hover:bg-red-400/10 touch-manipulation -ml-2"
                            onClick={() => removeLevel(index)}
                            title={level.isBreak ? "Remove break" : "Remove level"}
                          >
                            <span className="material-icons text-xs">
                              close
                            </span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

      {/* Add Break Dialog */}
      <Dialog open={breakDialogOpen} onOpenChange={setBreakDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Break</DialogTitle>
            <DialogDescription>
              Add a break after a specific blind level.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="breakDuration" className="text-right">
                Duration
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="breakDuration"
                  type="text"
                  value={breakDuration.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      const numValue = value === '' ? 10 : parseInt(value, 10);
                      if (numValue >= 1 && numValue <= 60) {
                        setBreakDuration(numValue);
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (isNaN(value) || value < 1) {
                      setBreakDuration(10);
                    } else if (value > 60) {
                      setBreakDuration(60);
                    }
                  }}
                  className="w-full text-xs !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-3 py-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="levelSelect" className="text-right">
                After Level
              </Label>
              <div className="col-span-3">
                <Select 
                  value={selectedLevel} 
                  onValueChange={setSelectedLevel}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a level..." />
                  </SelectTrigger>
                  <SelectContent>
                    {state.levels
                      .filter(level => !level.isBreak)
                      .map((level, index) => {
                        // Calculate the correct level number (excluding breaks)
                        const levelNumber = state.levels
                          .slice(0, state.levels.indexOf(level) + 1)
                          .filter(l => !l.isBreak)
                          .length;

                        return (
                          <SelectItem key={index} value={String(state.levels.indexOf(level))}>
                            Level {levelNumber}: {level.small}/{level.big}
                          </SelectItem>
                        );
                      })
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button 
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
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Antes</DialogTitle>
            <DialogDescription>
              Add antes to selected blind levels.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="anteType" className="text-right">
                Ante Type
              </Label>
              <div className="col-span-3">
                <Select 
                  value={anteType} 
                  onValueChange={(value: 'fixed' | 'percentage') => setAnteType(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage of Small Blind</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="anteAmount" className="text-right">
                {anteType === 'percentage' ? 'Percentage' : 'Amount'}
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <Input
                  id="anteAmount"
                  type="text"
                  value={anteAmount.toString()}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      const numValue = value === '' ? 1 : parseInt(value, 10);
                      const maxValue = anteType === 'percentage' ? 50 : 999999;
                      if (numValue >= 1 && numValue <= maxValue) {
                        setAnteAmount(numValue);
                      }
                    }
                  }}
                  onBlur={(e) => {
                    const value = parseInt(e.target.value, 10);
                    if (isNaN(value) || value < 1) {
                      setAnteAmount(1);
                    } else if (anteType === 'percentage' && value > 50) {
                      setAnteAmount(50);
                    }
                  }}
                  className="w-20 rounded text-xs !bg-black border border-[#2a2a2a] hover:!bg-black focus:border-red-400 px-3 py-2 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]"
                  inputMode="numeric"
                  pattern="[0-9]*"
                />
                <span className="text-sm text-muted-foreground">
                  {anteType === 'percentage' ? '%' : 'chips'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label className="text-right mt-2">
                Select Levels
              </Label>
              <div className="col-span-3 max-h-48 overflow-y-auto">
                <div className="space-y-2">
                  {state.levels
                    .map((level, index) => ({ level, index }))
                    .filter(({ level }) => !level.isBreak)
                    .map(({ level, index }) => {
                      // Calculate the correct level number (excluding breaks)
                      const levelNumber = state.levels
                        .slice(0, index + 1)
                        .filter(l => !l.isBreak)
                        .length;

                      return (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`level-${index}`}
                            checked={selectedLevelsForAntes.includes(index)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLevelsForAntes([...selectedLevelsForAntes, index]);
                              } else {
                                setSelectedLevelsForAntes(selectedLevelsForAntes.filter(i => i !== index));
                              }
                            }}
                            className="rounded"
                          />
                          <Label htmlFor={`level-${index}`} className="text-sm">
                            Level {levelNumber}: {level.small}/{level.big}
                            {level.ante && level.ante > 0 && ` (current ante: ${level.ante})`}
                          </Label>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const allNonBreakIndices = state.levels
                    .map((level, index) => ({ level, index }))
                    .filter(({ level }) => !level.isBreak)
                    .map(({ index }) => index);
                  setSelectedLevelsForAntes(allNonBreakIndices);
                }}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLevelsForAntes([])}
              >
                Clear All
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button 
              onClick={() => {
                selectedLevelsForAntes.forEach(levelIndex => {
                  const level = state.levels[levelIndex];
                  if (!level.isBreak) {
                    let anteValue;
                    if (anteType === 'percentage') {
                      anteValue = Math.max(1, Math.floor(level.small * (anteAmount / 100)));
                    } else {
                      anteValue = anteAmount;
                    }
                    updateBlindLevel(levelIndex, { ante: anteValue });
                  }
                });
                setAntesDialogOpen(false);
                setSelectedLevelsForAntes([]);
                setAnteAmount(1);
                setAnteType('percentage');
              }} 
              disabled={selectedLevelsForAntes.length === 0}
            >
              Add Antes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}