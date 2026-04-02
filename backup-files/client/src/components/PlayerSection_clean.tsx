import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Zap, Trash2, X } from 'lucide-react';

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

interface SavedPlayerName {
  id: number;
  name: string;
  createdAt: string;
}

export default function PlayerSection({ tournament }: PlayerSectionProps) {
  const { state, addKnockout, addPlayer } = tournament;
  const [playerName, setPlayerName] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [savedNames, setSavedNames] = useState<SavedPlayerName[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredNames, setFilteredNames] = useState<SavedPlayerName[]>([]);

  // Load saved player names
  useEffect(() => {
    fetchSavedNames();
  }, []);

  // Get frequently used players (recent 8)
  const getFrequentPlayers = () => {
    return savedNames
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8)
      .map(p => p.name)
      .filter(name => !state.players.some(player => player.name === name));
  };

  // Filter names based on input
  useEffect(() => {
    if (playerName.trim() && savedNames.length > 0) {
      const filtered = savedNames.filter(p => 
        p.name.toLowerCase().includes(playerName.toLowerCase()) &&
        !state.players.some(player => player.name === p.name)
      );
      setFilteredNames(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setFilteredNames([]);
      setShowAutocomplete(false);
    }
  }, [playerName, savedNames, state.players]);

  const fetchSavedNames = async () => {
    try {
      const response = await fetch('/api/player-names');
      if (response.ok) {
        const names = await response.json();
        setSavedNames(names);
      }
    } catch (error) {
      console.error('Error fetching saved names:', error);
    }
  };

  const handleAddPlayer = async () => {
    if (playerName.trim()) {
      // Check if player already exists
      if (state.players.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
        alert('Player already added!');
        return;
      }

      // Add player to tournament
      addPlayer(playerName.trim());

      // Save player name to database if not already saved
      if (!savedNames.some(p => p.name.toLowerCase() === playerName.trim().toLowerCase())) {
        try {
          const response = await fetch('/api/player-names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: playerName.trim() })
          });
          if (response.ok) {
            fetchSavedNames(); // Refresh the list
          }
        } catch (error) {
          console.error('Failed to save player name:', error);
        }
      }

      setPlayerName('');
      setShowAutocomplete(false);
    }
  };

  const deleteSavedName = async (id: number) => {
    try {
      const response = await fetch(`/api/player-names/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchSavedNames(); // Refresh the list
      }
    } catch (error) {
      console.error('Failed to delete saved name:', error);
    }
  };

  const handlePlayerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  const selectAutocompleteName = (name: string) => {
    setPlayerName(name);
    setShowAutocomplete(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlayerName(e.target.value);
  };

  const handleRemovePlayer = (playerId: string) => {
    const updatedPlayers = state.players.filter(player => player.id !== playerId);
    tournament.updatePlayers(updatedPlayers);
  };

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">groups</span>
          Players
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="p-6 pt-4 border-t border-[#2a2a2a]">
          {/* Quick Player Selection */}
          {getFrequentPlayers().length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Recent Players</h4>
              <div className="flex flex-col sm:flex-row gap-3">
                {/* Player Selection Dropdown */}
                <div className="flex-1">
                  <Select onValueChange={(value) => addPlayer(value)}>
                    <SelectTrigger className="w-full h-10">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Add recent player" />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {getFrequentPlayers().map((name: string) => (
                        <SelectItem key={name} value={name}>
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            {name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Add All Button */}
                <Button
                  variant="outline"
                  onClick={() => {
                    getFrequentPlayers().forEach((name: string) => addPlayer(name));
                  }}
                  className="h-10 px-3 sm:px-4 whitespace-nowrap text-sm"
                  disabled={getFrequentPlayers().length === 0}
                >
                  <Users className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Add All </span>
                  ({getFrequentPlayers().length})
                </Button>
              </div>
            </div>
          )}

          {/* Tournament Access Code & Multi-User Feature */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-lg">
            <h4 className="font-medium mb-3 flex items-center">
              <Users className="h-4 w-4 mr-2" />
              Real-Time Tournament Access
            </h4>
            <p className="text-sm text-muted-foreground mb-3">
              Participants can join at <strong>/participant</strong> to see their seating assignments in real-time.
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Access Code</label>
                <input
                  type="text"
                  value="TOUR2024"
                  readOnly
                  className="w-full p-2 text-sm border border-border rounded bg-muted font-mono"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText("TOUR2024")}
                className="mt-5"
              >
                Copy
              </Button>
            </div>
          </div>

          {/* Add Player Input */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 relative">
              <div className="flex-1 relative autocomplete-container">
                <input 
                  type="text" 
                  value={playerName}
                  onChange={handleInputChange}
                  onKeyDown={handlePlayerKeyDown}
                  placeholder="Enter player name" 
                  className="w-full p-3 border border-border rounded-md bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent" 
                />
                
                {/* Autocomplete dropdown */}
                {showAutocomplete && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-background border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredNames.map(name => (
                      <div 
                        key={name.id}
                        className="p-3 hover:bg-secondary cursor-pointer border-b border-border last:border-b-0 flex items-center justify-between"
                        onClick={() => selectAutocompleteName(name.name)}
                      >
                        <span>{name.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <Button onClick={handleAddPlayer} className="sm:w-auto w-full">
                Add Player
              </Button>
            </div>
          </div>

          {/* Player List */}
          <div className="space-y-3">
            <h3 className="font-medium text-lg">
              Tournament Players ({state.players.length})
            </h3>
            
            {state.players.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No players added yet</p>
                <p className="text-sm">Add players to start your tournament</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {state.players.map(player => (
                  <div key={player.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {player.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">{player.name}</span>
                        {player.knockouts > 0 && (
                          <span className="ml-2 text-sm text-muted-foreground">
                            ({player.knockouts} knockouts)
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {!state.isRunning && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemovePlayer(player.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Names Management */}
          {savedNames.length > 0 && (
            <div className="mt-6 pt-6 border-t border-border">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                Saved Players ({savedNames.length})
              </h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {savedNames
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map(name => (
                    <div key={name.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded text-sm">
                      <span>{name.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSavedName(name.id)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}