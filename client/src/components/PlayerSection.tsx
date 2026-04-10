import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { getButtonVariant, buttonCombinations } from "@/lib/buttonUtils";
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { X, Zap, Download, Users } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Player } from '@/types';
import DealCalculatorDialog from './DealCalculatorDialog';
import { useLeague } from '@/hooks/useLeague';

interface RecentPlayer {
  name: string;
  lastUsed: number;
}

interface PlayerSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function PlayerSection({ tournament }: PlayerSectionProps) {
  const { state, addKnockout, addPlayer, removePlayer, processRebuy, calculatePrizePool } = tournament;
  const { leaguePlayers } = useLeague();
  const [playerName, setPlayerName] = useState('');

  const isLeagueMode =
    state.details?.type === 'season' ||
    (state.settings as any)?.isSeasonTournament === true;
  
  const [recentPlayers, setRecentPlayers] = useState<RecentPlayer[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [filteredNames, setFilteredNames] = useState<RecentPlayer[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [showLeagueRoster, setShowLeagueRoster] = useState(false);
  const [recentSearchTerm, setRecentSearchTerm] = useState('');
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Load recent players from localStorage when feature is enabled
  useEffect(() => {
    if (state.settings.enableRecentPlayers) {
      loadRecentPlayers();
    } else {
      // Reset state when feature is disabled
      setShowAllRecent(false);
      setRecentSearchTerm('');
      setRecentPlayers([]);
    }
  }, [state.settings.enableRecentPlayers]);

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
    if (!state.settings.enableRecentPlayers) return;

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
    if (!state.settings.enableRecentPlayers) return [];

    return recentPlayers
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, 8)
      .map(p => p.name)
      .filter(name => !state.players.some(player => player.name.toLowerCase() === name.toLowerCase()));
  };

  // Get filtered recent players based on search term
  const getFilteredRecentPlayers = () => {
    if (!state.settings.enableRecentPlayers) return [];

    const availablePlayers = recentPlayers.filter(player => 
      !state.players.some(p => p.name.toLowerCase() === player.name.toLowerCase())
    );

    if (!recentSearchTerm.trim()) {
      return availablePlayers.sort((a, b) => a.name.localeCompare(b.name));
    }

    const searchTerm = recentSearchTerm.toLowerCase();
    const filtered = availablePlayers.filter(player => 
      player.name.toLowerCase().includes(searchTerm)
    );

    // Sort with names starting with search term first, then alphabetically
    return filtered.sort((a, b) => {
      const aStartsWith = a.name.toLowerCase().startsWith(searchTerm);
      const bStartsWith = b.name.toLowerCase().startsWith(searchTerm);

      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  // Filter names based on input
  useEffect(() => {
    if (state.settings.enableRecentPlayers && playerName.trim() && recentPlayers.length > 0) {
      const searchTerm = playerName.toLowerCase();
      const filtered = recentPlayers
        .filter(p => 
          p.name.toLowerCase().includes(searchTerm) &&
          !state.players.some(player => player.name.toLowerCase() === p.name.toLowerCase())
        )
        .sort((a, b) => {
          const aStartsWith = a.name.toLowerCase().startsWith(searchTerm);
          const bStartsWith = b.name.toLowerCase().startsWith(searchTerm);

          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return a.name.localeCompare(b.name);
        });
      setFilteredNames(filtered);
      setShowAutocomplete(filtered.length > 0);
    } else {
      setFilteredNames([]);
      setShowAutocomplete(false);
    }
  }, [playerName, recentPlayers, state.players, state.settings.enableRecentPlayers]);

  // Handle clicks/touches outside autocomplete (touch-safe for mobile/iPad)
  const handleClickOutside = (event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement;
    if (autocompleteRef.current && !autocompleteRef.current.contains(target)) {
      setShowAutocomplete(false);
    }
  };

  useEffect(() => {
    // Add both mouse and touch event listeners for cross-device compatibility
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

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



  // Function to seat a single player using the tournament's seating system
  const seatSinglePlayer = (player: Player) => {
    // Import the seating function from TablesSection or create a simplified version
    const { updatePlayers } = tournament;
    const currentPlayers = [...state.players];

    // Get table configuration
    const tables = state.settings.tables || { numberOfTables: 2, seatsPerTable: 6 };
    const { numberOfTables, seatsPerTable } = tables;

    // Find occupied seats
    const occupiedSeats = new Set();
    currentPlayers.forEach(p => {
      if (p.seated && p.tableAssignment) {
        occupiedSeats.add(`${p.tableAssignment.tableIndex}-${p.tableAssignment.seatIndex}`);
      }
    });

    // Find first available seat using optimized algorithm
    let assignedSeat = null;
    const seatedPlayers = currentPlayers.filter(p => p.seated);

    // Prefer Table 1 for smaller groups, distribute for larger groups
    if (seatedPlayers.length < seatsPerTable) {
      // Try Table 1 first for initial seating
      for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
        const seatKey = `0-${seatIndex}`;
        if (!occupiedSeats.has(seatKey)) {
          assignedSeat = { tableIndex: 0, seatIndex };
          break;
        }
      }
    }

    // If Table 1 is full or we need to distribute, find any available seat
    if (!assignedSeat) {
      for (let tableIndex = 0; tableIndex < numberOfTables; tableIndex++) {
        for (let seatIndex = 0; seatIndex < seatsPerTable; seatIndex++) {
          const seatKey = `${tableIndex}-${seatIndex}`;
          if (!occupiedSeats.has(seatKey)) {
            assignedSeat = { tableIndex, seatIndex };
            break;
          }
        }
        if (assignedSeat) break;
      }
    }

    if (assignedSeat) {
      console.log(`Seating ${player.name} at Table ${assignedSeat.tableIndex + 1}, Seat ${assignedSeat.seatIndex + 1}`);

      // Update the player with seating assignment
      const updatedPlayers = currentPlayers.map(p => {
        if (p.id === player.id) {
          return {
            ...p,
            seated: true,
            tableAssignment: assignedSeat
          };
        }
        return p;
      });

      updatePlayers(updatedPlayers);
    } else {
      console.log('No available seats for player');
    }
  };

  // Handle export image functionality
  const handleExportImage = async () => {
    if (!exportRef.current) return;

    setIsExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        backgroundColor: '#1e1e1e',
        scale: 2,
        useCORS: true,
        allowTaint: false
      } as any);

      const link = document.createElement('a');
      const tournamentName = 'tournament';
      const date = new Date().toISOString().split('T')[0];
      link.download = `${tournamentName}-players-rankings-${date}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting players & rankings:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Calculate active players
  const activePlayers = state.players.filter(p => p.isActive);

  // Check if tournament is finished (all players eliminated OR only one active player remaining)
  const eliminatedPlayers = state.players.filter(p => p.isActive === false);
  const tournamentFinished = (activePlayers.length === 0 && eliminatedPlayers.length > 0) || 
                            (activePlayers.length === 1 && eliminatedPlayers.length > 0);

  

  return (
    <Card className="p-4 bg-gradient-to-r from-teal-600/10 to-blue-600/10 border border-teal-500/20">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-orange-500">group</span>
          Players & Rankings ({activePlayers.length})
        </h2>
        <div className="flex items-center gap-2">
          {/* Deal Calculator */}
          {activePlayers.length > 1 && state.prizeStructure?.manualPayouts && state.prizeStructure.manualPayouts.length > 0 && (
            <DealCalculatorDialog 
              players={state.players} 
              prizePool={calculatePrizePool().netPrizePool}
              payouts={state.prizeStructure.manualPayouts.map(p => p.percentage / 100 * calculatePrizePool().netPrizePool)}
              currencySymbol={state.settings.currency || '$'}
            />
          )}
          {/* Export button - only show when tournament is finished */}
          {tournamentFinished && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExportImage();
              }}
              disabled={isExporting}
              className="h-8 px-2"
            >
              <Download className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      <div className="pt-4 space-y-4" ref={exportRef}>
        {/* Add Player Section - Mobile Optimized */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 relative" ref={autocompleteRef}>
              <Input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter player name..."
                className="w-full px-3 py-3 text-base bg-[#1a1a1a] border border-[#2a2a2a] rounded-md text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />

              {/* Autocomplete dropdown */}
              {showAutocomplete && state.settings.enableRecentPlayers && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-md shadow-lg max-h-40 overflow-y-auto">
                  {filteredNames.map((player) => (
                    <button
                      key={player.name}
                      onClick={() => handleSelectName(player.name)}
                      className="w-full px-3 py-2 text-left text-white hover:bg-[#2a2a2a] focus:bg-[#2a2a2a] focus:outline-none"
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button 
              onClick={handleAddPlayer}
              variant="outline"
              className="btn-add-player flex items-center justify-center gap-1 font-medium py-2 px-3 rounded-lg transition-all duration-200"
            >
              <span className="material-icons text-sm">add</span>
              <span>Add</span>
            </Button>
          </div>

          {/* League Roster Quick-Add - shown in league mode, behind toggle */}
          {isLeagueMode && leaguePlayers.length > 0 && (() => {
            const available = leaguePlayers
              .filter((lp: any) => !state.players.some(p => p.name.toLowerCase() === (lp.name || '').toLowerCase()))
              .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowLeagueRoster(v => !v)}
                    className="text-xs text-blue-400 hover:text-blue-300 h-6 px-0 font-medium"
                  >
                    <Users className="h-3 w-3 mr-1" />
                    League Roster ({available.length} available)
                  </Button>
                  {showLeagueRoster && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowLeagueRoster(false)}
                      className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                    >
                      Show Less
                    </Button>
                  )}
                </div>
                {showLeagueRoster && available.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {available.map((lp: any) => (
                      <button
                        key={lp.id}
                        onClick={() => handleSelectName(lp.name)}
                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/25 hover:text-blue-200 transition-colors"
                      >
                        {lp.name}
                      </button>
                    ))}
                  </div>
                )}
                {showLeagueRoster && available.length === 0 && (
                  <p className="text-xs text-muted-foreground">All league players already added.</p>
                )}
              </div>
            );
          })()}

          {/* Quick Add Recent Players - Compact View */}
          {state.settings.enableRecentPlayers && recentPlayers.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllRecent(!showAllRecent)}
                  className="text-xs text-gray-400 hover:text-gray-300 h-6 px-0 font-medium"
                >
                  Recent Players ({recentPlayers.length})
                </Button>
                {showAllRecent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllRecent(false)}
                    className="text-xs text-blue-400 hover:text-blue-300 h-6 px-2"
                  >
                    Show Less
                  </Button>
                )}
              </div>

              {showAllRecent && (
                // Show all recent players in a more organized way
                <div className="space-y-3">
                  <Input
                    type="text"
                    placeholder="Search recent players..."
                    value={recentSearchTerm}
                    onChange={(e) => setRecentSearchTerm(e.target.value)}
                    className="h-8 text-sm bg-[#1a1a1a] border-[#2a2a2a]"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {getFilteredRecentPlayers().map((player) => (
                      <div
                        key={player.name}
                        className="flex items-center p-2 hover:bg-[#2a2a2a] rounded cursor-pointer"
                        onClick={() => handleSelectName(player.name)}
                      >
                        <span className="text-sm text-white">{player.name}</span>
                      </div>
                    ))}
                    {getFilteredRecentPlayers().length === 0 && recentSearchTerm && (
                      <div className="text-center text-sm text-gray-400 py-2">
                        No players found matching "{recentSearchTerm}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Players List with Rankings - Mobile Optimized */}
        <div className="space-y-2">
          {/* Helper functions for rankings */}
          {(() => {
            const currencySymbol = state.settings.currency || '£';
            
            const buyInAmount = state.prizeStructure?.buyIn || 0;
            const rebuyAmount = state.prizeStructure?.rebuyAmount || 0;
            const addonAmount = state.prizeStructure?.addonAmount || 0;
            const rakePercentage = state.prizeStructure?.rakePercentage || 0;
            const rakeAmountFixed = state.prizeStructure?.rakeAmount || 0;
            const rakeType = state.prizeStructure?.rakeType || 'percentage';
            
            const totalRebuys = state.players.reduce((sum, p) => sum + (p.rebuys || 0), 0);
            const totalAddons = state.players.reduce((sum, p) => sum + (p.addons || 0), 0);
            const grossPrizePool = (buyInAmount * state.players.length) + (rebuyAmount * totalRebuys) + (addonAmount * totalAddons);
            
            const rakeAmount = rakeType === 'percentage' 
              ? Math.floor(grossPrizePool * (rakePercentage / 100))
              : rakeAmountFixed;
              
            const totalPrizePool = Math.max(0, grossPrizePool - rakeAmount);

            const calculatePlayerWinnings = (player: any): number => {
              let totalWinnings = 0;

              // Add bounty winnings for eliminations
              if (state.prizeStructure?.enableBounties && state.prizeStructure?.bountyAmount) {
                const knockouts = player.knockouts || 0;

                // Only the winner (position 1) gets their own bounty back plus knockout bounties
                if (player.position === 1) {
                  totalWinnings += (knockouts + 1) * state.prizeStructure.bountyAmount;
                } else {
                  // All other players (active or eliminated) only get knockout bounties
                  totalWinnings += knockouts * state.prizeStructure.bountyAmount;
                }
              }

              // Add position-based prize money
              if (player.position && player.position > 0 && state.prizeStructure?.manualPayouts) {
                const positionPayout = state.prizeStructure.manualPayouts.find((p: any) => p.position === player.position);
                if (positionPayout && positionPayout.percentage > 0) {
                  const prizeAmount = Math.floor((totalPrizePool * positionPayout.percentage) / 100);
                  totalWinnings += prizeAmount;
                }
              }

              return totalWinnings;
            };

            // Sort players by position: active players first (no position), then by position (1st, 2nd, 3rd, etc.)
            const sortedPlayers = [...state.players].sort((a, b) => {
              // Active players (no position) come first
              if (a.isActive !== false && b.isActive === false) return -1;
              if (a.isActive === false && b.isActive !== false) return 1;

              // Both active - sort by name
              if (a.isActive !== false && b.isActive !== false) {
                return a.name.localeCompare(b.name);
              }

              // Both eliminated - sort by position (1st, 2nd, 3rd, etc.)
              const aPos = a.position || 999;
              const bPos = b.position || 999;
              return aPos - bPos;
            });

            if (sortedPlayers.length === 0) {
              return (
                <div className="empty-state fade-in">
                  <div className="empty-state-icon">
                    <svg className="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div className="empty-state-title">No players registered</div>
                  <div className="empty-state-description">Add players using the form above to track knockouts, rebuys, and standings</div>
                </div>
              );
            }

            return sortedPlayers.map((player) => {
              const winnings = calculatePlayerWinnings(player);

              // Check if player has been eliminated (has a position)
              let displayRank = "Active";
              let rankBadgeClass = "bg-green-600 text-white";

              if (player.position && player.position > 0) {
                if (player.position === 1) {
                  displayRank = "1st";
                  rankBadgeClass = "bg-yellow-500 text-black";
                } else if (player.position === 2) {
                  displayRank = "2nd";
                  rankBadgeClass = "bg-gray-300 text-black";
                } else if (player.position === 3) {
                  displayRank = "3rd";
                  rankBadgeClass = "bg-amber-600 text-white";
                } else {
                  displayRank = `${player.position}th`;
                  rankBadgeClass = "bg-red-900 text-white";
                }
              }

              return (
                <div
                  key={player.id}
                  className="flex flex-col sm:flex-row sm:items-center p-3 bg-[#1a1a1a] rounded-lg border border-[#2a2a2a] hover:bg-[#1e1e1e] transition-colors gap-3"
                >
                  <div className="flex items-center justify-between w-full sm:w-auto flex-1 gap-3 min-w-0">
                    {/* Left section: Rank + Name (most prominent) */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Rank Badge - smaller and more subtle */}
                      <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap ${rankBadgeClass}`}>
                        {displayRank}
                      </span>

                      {/* Player Name - more prominent */}
                      <span className="font-bold text-white text-lg truncate" title={player.name}>{player.name}</span>
                    </div>

                    {/* Right section on mobile, Center section on desktop: Status badges */}
                    <div className="flex items-center gap-2 flex-wrap justify-end sm:justify-start">
                      {/* Table Assignment */}
                      {player.seated && player.tableAssignment && (
                        <span className="text-xs bg-blue-600/70 text-blue-100 px-2 py-1 rounded font-normal">
                          T{player.tableAssignment.tableIndex + 1}S{player.tableAssignment.seatIndex + 1}
                        </span>
                      )}

                      {/* Knockouts */}
                      {player.knockouts > 0 && (
                        <div className="flex items-center gap-1 text-xs bg-orange-600/70 text-orange-100 px-2 py-1 rounded font-normal">
                          <span className="text-sm">🎯</span>
                          {player.knockouts}
                        </div>
                      )}

                      {/* Eliminated By - more subtle */}
                      {player.isActive === false && player.eliminatedBy && (
                        <span className="text-xs bg-red-600/50 text-red-200 px-2 py-1 rounded font-normal">
                          💀 {state.players.find(p => p.id === player.eliminatedBy)?.name || 'Unknown'}
                        </span>
                      )}

                      {/* Rebuys */}
                      {(player.rebuys || 0) > 0 && (
                        <span className="text-xs bg-purple-600/70 text-purple-100 px-2 py-1 rounded font-normal">
                          R{player.rebuys}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom section on mobile, Right section on desktop: Winnings + Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto flex-shrink-0 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t border-[#2a2a2a] sm:border-0">
                    {/* Winnings Display */}
                    {winnings > 0 ? (
                      <div className="bg-green-600/20 border border-green-500/30 px-3 py-1 rounded-lg">
                        <div className="text-sm font-mono text-green-300 whitespace-nowrap font-bold">
                          {currencySymbol}{winnings.toFixed(0)}
                        </div>
                      </div>
                    ) : (
                      <div></div> /* Empty div to maintain flex-between alignment if no winnings */
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                        {/* Seat Player button for unseated active players */}
                        {player.isActive && !player.seated && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => seatSinglePlayer(player)}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium"
                          >
                            Seat
                          </Button>
                        )}

                        {/* Re-buy button for eliminated players (when rebuys are enabled) */}
                        {!player.isActive && state.prizeStructure?.allowRebuys && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('💰 Re-buy button clicked for:', player.name);
                              processRebuy(player.id);
                            }}
                            disabled={!state.prizeStructure?.allowRebuys || (player.rebuys || 0) >= (state.prizeStructure?.maxRebuys || 3)}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium mr-2"
                          >
                            Re-buy
                          </Button>
                        )}

                        {/* Re-entry button for eliminated players (when re-entries are enabled) */}
                        {!player.isActive && state.prizeStructure?.allowReEntry && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('🔄 Re-entry button clicked for:', player.name);
                              tournament.processReEntry(player.id);
                            }}
                            className="text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 px-2 py-1 font-medium"
                          >
                            Re-enter
                          </Button>
                        )}

                        {/* Only show remove button for active players to prevent accidental deletion */}
                        {player.isActive && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 w-8 h-8 p-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Player?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove <strong>{player.name}</strong> from the tournament? 
                                  This action cannot be undone and will permanently delete their tournament data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => removePlayer(player.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Remove Player
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                </div>
              );
            });
          })()}
        </div>

        {/* Rebuy Section - Compact - Only show when rebuys are enabled */}
        {state.prizeStructure?.allowRebuys && state.players.filter(p => p.isActive === false).length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#2a2a2a]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <span className="material-icons text-sm">refresh</span>
                <span>Re-entry ({state.players.filter(p => p.isActive === false).length})</span>
              </h4>
              <span className="text-xs text-green-400">Available</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {state.players.filter(p => p.isActive === false).map((player) => {
                const canRebuy = state.prizeStructure?.allowRebuys && 
                  (player.rebuys || 0) < (state.prizeStructure?.maxRebuys || 3);

                return (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    disabled={!canRebuy}
                    onClick={() => canRebuy && addKnockout(player.id)}
                    className={`text-xs flex items-center gap-1 ${
                      canRebuy 
                        ? 'bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10' 
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed'
                    }`}
                  >
                    <span className="material-icons text-sm">refresh</span>
                    {player.name} ({player.rebuys || 0})
                  </Button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}