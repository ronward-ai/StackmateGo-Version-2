import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Zap, X } from 'lucide-react';

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

interface RecentPlayer {
  name: string;
  lastUsed: number;
}

export default function PlayerSection({ tournament }: PlayerSectionProps) {
  const { state, addKnockout, addPlayer, removePlayer } = tournament;
  const [playerName, setPlayerName] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [recentPlayers, setRecentPlayers] = useState<RecentPlayer[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredNames, setFilteredNames] = useState<RecentPlayer[]>([]);
  const [rebuyDialogOpen, setRebuyDialogOpen] = useState(false);
  const [playerToRebuy, setPlayerToRebuy] = useState<any>(null);

  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Load recent players from localStorage
  useEffect(() => {
    loadRecentPlayers();
  }, []);

  // Load recent players from localStorage
  const loadRecentPlayers = () => {
    try {
      const stored = localStorage.getItem('recentPlayers');
      if (stored) {
        const parsed = JSON.parse(stored) as RecentPlayer[];
        setRecentPlayers(parsed);
      }
    } catch (error) {
      console.error('Failed to load recent players:', error);
    }
  };

  // Save recent players to localStorage
  const saveRecentPlayer = (name: string) => {
    try {
      const trimmedName = name.trim();
      if (!trimmedName) return;

      const existing = recentPlayers.filter(p => p.name.toLowerCase() !== trimmedName.toLowerCase());
      const updated = [
        { name: trimmedName, lastUsed: Date.now() },
        ...existing
      ].slice(0, 20); // Keep only 20 most recent

      setRecentPlayers(updated);
      localStorage.setItem('recentPlayers', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save recent player:', error);
    }
  };

  // Get frequently used players (recent 8)
  const getFrequentPlayers = () => {
    return recentPlayers
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 8)
      .map(p => p.name)
      .filter(name => !state.players.some(player => player.name.toLowerCase() === name.toLowerCase()));
  };

  // Filter names based on input
  useEffect(() => {
    if (playerName.trim() && recentPlayers.length > 0) {
      const filtered = recentPlayers.filter(p => 
        p.name.toLowerCase().includes(playerName.toLowerCase()) &&
        !state.players.some(player => player.name.toLowerCase() === p.name.toLowerCase())
      );
      setFilteredNames(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setFilteredNames([]);
      setShowAutocomplete(false);
    }
  }, [playerName, recentPlayers, state.players]);

  const handleAddPlayer = () => {
    const trimmed = playerName.trim();
    if (trimmed && !state.players.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      addPlayer(trimmed);
      saveRecentPlayer(trimmed);
      setPlayerName('');
      setShowAutocomplete(false);
    }
  };

  const handleSelectName = (name: string) => {
    setPlayerName(name);
    setShowAutocomplete(false);
    // Auto-add the player
    setTimeout(() => {
      if (!state.players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        addPlayer(name);
        saveRecentPlayer(name);
        setPlayerName('');
      }
    }, 100);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (!target.closest('.autocomplete-container')) {
      setShowAutocomplete(false);
    }
  };

  const handleRebuyClick = (player: any) => {
    setPlayerToRebuy(player);
    setRebuyDialogOpen(true);
  };

  const confirmRebuy = () => {
    if (playerToRebuy) {
      const { processRebuy } = tournament;
      processRebuy(playerToRebuy.id);
      setRebuyDialogOpen(false);
      setPlayerToRebuy(null);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <Users className="h-5 w-5 text-blue-400 mr-2" />
          Players ({state.players.length})
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a] space-y-4">
          {/* Add Player Input - Mobile Optimized */}
          <div className="autocomplete-container relative">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter player name..."
                  className="w-full px-3 py-3 text-base bg-[#1a1a1a] border border-[#2a2a2a] rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                
                {/* Autocomplete dropdown */}
                {showAutocomplete && filteredNames.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                    {filteredNames.slice(0, 8).map((player, index) => (
                      <div
                        key={player.name + index}
                        className="px-3 py-3 hover:bg-[#2a2a2a] cursor-pointer text-sm border-b border-[#2a2a2a] last:border-b-0"
                        onClick={() => handleSelectName(player.name)}
                      >
                        {player.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <Button onClick={handleAddPlayer} className="bg-blue-600 hover:bg-blue-700 px-4 py-3 text-sm font-medium">
                Add
              </Button>
            </div>

            {/* Quick Add Buttons for Frequent Players */}
            {getFrequentPlayers().length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-muted-foreground mb-2">Recent Players:</div>
                <div className="flex flex-wrap gap-2">
                  {getFrequentPlayers().map(name => (
                    <Button
                      key={name}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectName(name)}
                      className="text-xs border-[#2a2a2a] hover:bg-[#2a2a2a] px-3 py-2"
                    >
                      {name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current Players List - Mobile Optimized */}
          <div className="space-y-2">
            {state.players.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center p-3 bg-[#1a1a1a] rounded-lg min-h-[60px]"
              >
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 mr-3">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0 mr-3">
                  <div className="font-medium text-sm truncate">{player.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <div className="flex flex-wrap gap-1">
                      {player.seated ? (
                        <span className="text-green-400">
                          T{player.tableAssignment ? player.tableAssignment.tableIndex + 1 : '?'}-S{player.tableAssignment ? player.tableAssignment.seatIndex + 1 : '?'}
                        </span>
                      ) : (
                        <span className="text-yellow-400">Not seated</span>
                      )}
                      {!player.isActive && (
                        <span className="text-red-400">• Eliminated</span>
                      )}
                      {(player.rebuys || 0) > 0 && (
                        <span className="text-blue-400">• {player.rebuys}R</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {player.knockouts > 0 && (
                    <div className="flex items-center gap-1 text-xs bg-orange-600 text-white px-2 py-1 rounded">
                      <Zap className="h-3 w-3" />
                      {player.knockouts}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePlayer(player.id)}
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20 w-8 h-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Rebuy Section - Compact */}
          {state.players.filter(p => p.isActive === false).length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <span className="material-icons text-sm">refresh</span>
                  <span>Re-entry ({state.players.filter(p => p.isActive === false).length})</span>
                </h4>
                {state.prizeStructure?.allowRebuys && (
                  <span className="text-xs text-green-400">Available</span>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {state.players.filter(p => p.isActive === false).map((player) => {
                  const prizeStructure = state.prizeStructure || { 
                    allowRebuys: true, 
                    rebuyAmount: 10, 
                    maxRebuys: 3, 
                    rebuyPeriodLevels: 5 
                  };
                  
                  const canRebuy = prizeStructure.allowRebuys && 
                                  (!prizeStructure.rebuyPeriodLevels || state.currentLevel < prizeStructure.rebuyPeriodLevels) &&
                                  (!prizeStructure.maxRebuys || (player.rebuys || 0) < prizeStructure.maxRebuys);
                  
                  return (
                    <Button
                      key={player.id}
                      onClick={() => {
                        if (canRebuy) {
                          handleRebuyClick(player);
                        }
                      }}
                      variant={canRebuy ? "default" : "secondary"}
                      size="sm"
                      disabled={!canRebuy}
                      className={`text-xs ${canRebuy ? 'bg-orange-600 hover:bg-orange-700' : 'opacity-50'}`}
                    >
                      {player.name} {(player.rebuys || 0) > 0 ? `(${player.rebuys}R)` : ''}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-on Section - Compact */}
          {state.prizeStructure?.allowAddons && state.players.filter(p => p.isActive === true).length > 0 && (
            <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <span className="material-icons text-sm">add_circle</span>
                  <span>Add-ons ({state.players.filter(p => p.isActive === true).length} active)</span>
                </h4>
                <span className="text-xs text-blue-400">£{state.prizeStructure.addonAmount || 0}</span>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {state.players.filter(p => p.isActive === true).map((player) => {
                  const hasAddon = (player.addons || 0) > 0;
                  
                  return (
                    <Button
                      key={player.id}
                      onClick={() => {
                        const { processAddon } = tournament;
                        processAddon(player.id);
                      }}
                      variant={hasAddon ? "secondary" : "default"}
                      size="sm"
                      className={`text-xs ${hasAddon ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                      {player.name} {hasAddon ? `(${player.addons}A)` : '+ Add-on'}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}


        </div>
      )}



      {/* Rebuy Confirmation Dialog */}
      <Dialog open={rebuyDialogOpen} onOpenChange={setRebuyDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Rebuy</DialogTitle>
            <DialogDescription>
              Are you sure you want to rebuy {playerToRebuy?.name} back into the tournament?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {playerToRebuy && (
              <div className="space-y-3">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="font-medium text-lg">{playerToRebuy.name}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Previous rebuys: {playerToRebuy.rebuys || 0}
                  </div>
                  {state.prizeStructure?.rebuyAmount && (
                    <div className="text-sm text-muted-foreground">
                      Rebuy cost: £{state.prizeStructure.rebuyAmount}
                    </div>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  The player will be reactivated and returned to their original seat if available.
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                setRebuyDialogOpen(false);
                setPlayerToRebuy(null);
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmRebuy}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Confirm Rebuy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}