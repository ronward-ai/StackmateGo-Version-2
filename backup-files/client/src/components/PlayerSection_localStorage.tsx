import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Zap, TrendingUp, Crown, DollarSign } from 'lucide-react';
import { Player } from '@/types';

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
    if (autocompleteRef.current && !autocompleteRef.current.contains(target)) {
      setShowAutocomplete(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Calculate active players
  const activePlayers = state.players.filter(p => p.isActive);

  if (!isExpanded) {
    return (
      <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700">
        <div 
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-700/30"
          onClick={() => setIsExpanded(true)}
        >
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span className="material-icons text-lg">people</span>
            Players ({activePlayers.length})
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg border border-gray-700">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-700/30"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <span className="material-icons text-lg">people</span>
          Players ({activePlayers.length})
        </h3>
      </div>

      <div className="p-4 pt-0 space-y-4">
        {/* Add Player Section - Mobile Optimized */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1" ref={autocompleteRef}>
              <Input
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

          {/* Quick Add Recent Players */}
          {getFrequentPlayers().length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-medium">Recent Players</p>
              <div className="flex flex-wrap gap-2">
                {getFrequentPlayers().map((name) => (
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-white truncate">{player.name}</span>
                    {!player.isActive && (
                      <span className="text-xs bg-red-600 text-white px-2 py-1 rounded whitespace-nowrap">
                        Eliminated
                      </span>
                    )}
                    {player.isSeated && (
                      <span className="text-xs bg-green-600 text-white px-2 py-1 rounded whitespace-nowrap">
                        Table {player.tableNumber}, Seat {player.seatNumber}
                      </span>
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
                  rebuyPeriod: 60,
                  maxRebuys: 3,
                  rebuyAmount: state.buyIn || 0
                };

                const canRebuy = prizeStructure.allowRebuys && 
                  player.rebuys < prizeStructure.maxRebuys &&
                  state.timeRemaining && state.timeRemaining > (state.totalTime - prizeStructure.rebuyPeriod * 60);

                return (
                  <Button
                    key={player.id}
                    variant={canRebuy ? "default" : "secondary"}
                    size="sm"
                    disabled={!canRebuy}
                    onClick={() => canRebuy && addKnockout(player.id, true)}
                    className={`text-xs flex items-center gap-1 ${
                      canRebuy 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-icons text-sm">refresh</span>
                    {player.name} ({player.rebuys})
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}