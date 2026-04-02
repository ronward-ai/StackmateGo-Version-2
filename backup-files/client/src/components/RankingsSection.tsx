import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Player } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { RotateCcw, Plus } from "lucide-react";

interface RankingsSectionProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function RankingsSection({ tournament }: RankingsSectionProps) {
  const { state, processRebuy, processAddon } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Get tournament details and prize structure
  const tournamentDetails = state.details || {
    league: "League Name",
    season: "Current Season",
    startTime: null,
    endTime: null,
    totalEntrants: 0,
    prizePool: 0
  };
  const { league = "League Name", season = "Current Season" } = tournamentDetails;
  
  // Format start/end times
  const startTime = tournamentDetails.startTime 
    ? new Date(tournamentDetails.startTime).toLocaleString() 
    : "";
  const endTime = tournamentDetails.endTime 
    ? new Date(tournamentDetails.endTime).toLocaleString() 
    : "";
  
  // Get prize structure details
  const prizeStructure = state.prizeStructure || {
    buyIn: 0,
    rebuyAmount: 0,
    addonAmount: 0,
    allowRebuys: false,
    allowAddons: false,
    bountyAmount: 0,
    enableBounties: false,
    manualPayouts: []
  };

  // Get currency symbol from settings
  const currencySymbol = state.settings.currency || '£';
  
  // Calculate total prize pool
  const totalPrizePool = (state.prizeStructure?.buyIn || 0) * state.players.length;
  
  // Function to calculate winnings for a player
  const calculatePlayerWinnings = (player: Player): number => {
    let totalWinnings = 0;
    
    // Add bounty winnings (knockouts × bounty amount + own bounty back for winner only) - only if bounties are enabled
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
    
    // Add prize money based on final position (only if player has been eliminated and tournament is over)
    if (player.isActive === false && player.position && player.position > 0 && state.prizeStructure?.manualPayouts) {
      const positionPayout = state.prizeStructure.manualPayouts.find((p: any) => p.position === player.position);
      if (positionPayout && positionPayout.percentage > 0) {
        const prizeAmount = (totalPrizePool * positionPayout.percentage) / 100;
        totalWinnings += prizeAmount;
      }
    }
    
    return totalWinnings;
  };

  // Check if player is eligible for rebuy
  const canPlayerRebuy = (player: Player): boolean => {
    console.log('Rebuy check for', player.name, {
      allowRebuys: prizeStructure.allowRebuys,
      playerActive: player.isActive,
      currentLevel: state.currentLevel,
      rebuyPeriodLevels: prizeStructure.rebuyPeriodLevels,
      currentRebuys: player.rebuys || 0,
      maxRebuys: prizeStructure.maxRebuys
    });
    
    if (!prizeStructure.allowRebuys || player.isActive !== false) return false;
    
    // Check rebuy period
    if (prizeStructure.rebuyPeriodLevels && state.currentLevel >= prizeStructure.rebuyPeriodLevels) {
      return false;
    }
    
    // Check max rebuys
    const currentRebuys = player.rebuys || 0;
    if (prizeStructure.maxRebuys && currentRebuys >= prizeStructure.maxRebuys) {
      return false;
    }
    
    return true;
  };

  // Handle rebuy
  const handleRebuy = (playerId: string) => {
    processRebuy(playerId);
  };

  // Handle addon
  const handleAddon = (playerId: string) => {
    processAddon(playerId);
  };
  
  // Always show rankings if there are players, even if none have been eliminated yet
  const rankingsAvailable = state.players.length > 0;
  
  // Sort players by tournament position with optimal ranking display
  const sortedPlayers = [...state.players].sort((a, b) => {
    const aActive = a.position === undefined || a.isActive !== false;
    const bActive = b.position === undefined || b.isActive !== false;
    
    // Active players first, sorted by chip count or knockouts, then by name
    if (aActive && bActive) {
      const aKnockouts = a.knockouts || 0;
      const bKnockouts = b.knockouts || 0;
      if (aKnockouts !== bKnockouts) {
        return bKnockouts - aKnockouts; // Higher knockouts first
      }
      return a.name.localeCompare(b.name);
    } 
    
    // Eliminated players sorted by position (better positions first)
    if (!aActive && !bActive) {
      return (a.position || 999) - (b.position || 999);
    }
    
    // Active players always come before eliminated players
    return aActive ? -1 : 1;
  });
  
  // Get active tournament date for header
  const currentDate = new Date().toLocaleDateString('en-GB', { 
    day: '2-digit',
    month: '2-digit',
    year: 'numeric' 
  });
  
  // Header string with tournament info
  const headerText = `${league} - ${season}`;
  const subHeaderText = `${tournamentDetails.totalEntrants || sortedPlayers.length} Players - ${formatCurrency(prizeStructure.buyIn)} Buy-in - ${formatCurrency(tournamentDetails.prizePool || 0)} Prize Pool`;
  
  // Find player name by ID (for hitman lookup)
  const getPlayerNameById = (id?: string) => {
    if (!id) return "";
    const player = state.players.find(p => p.id === id);
    return player ? player.name : "";
  };
  
  return (
    <Card className="mt-6 bg-card rounded-xl shadow-lg overflow-hidden">
      <button 
        className="w-full p-4 text-left font-semibold flex items-center justify-between" 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center">
          <span className="material-icons mr-2 text-secondary">emoji_events</span>
          <span>Tournament Rankings</span>
        </div>
        <span className="material-icons">
          {isExpanded ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      
      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          {rankingsAvailable ? (
            <div className="overflow-hidden">
              {/* Tournament Header */}
              <div className="mb-4 text-center">
                <h2 className="font-bold text-lg">{headerText}</h2>
                <p className="text-sm text-muted-foreground">{subHeaderText}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {startTime && `Started: ${startTime}`}
                  {startTime && endTime && " - "}
                  {endTime && `Ended: ${endTime}`}
                </p>
              </div>
              
              {/* Rankings Table */}
              <div className="rounded-md border overflow-hidden">
                <div className="w-full overflow-auto">
                  <table className="w-full caption-bottom text-sm">
                    <thead className="[&_tr]:border-b">
                      <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[60px]">Rank</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Name</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[70px] text-center">Hits</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[120px]">Eliminated By</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[80px] text-center">Rebuys</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground text-right">Winnings</th>
                        <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground w-[120px] text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {sortedPlayers.map((player, index) => (
                        <tr 
                          key={player.id}
                          className={`border-b transition-colors hover:bg-muted/50 ${index % 2 === 0 ? "bg-muted/40" : ""}`}
                        >
                          <td className="p-4 align-middle font-medium">
                            {player.isActive === false && player.position ? player.position : 
                             // Show blank or "Active" badge for players still in the game
                             (player.isActive !== false ? 
                               <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                 Active
                               </span> : "")}
                          </td>
                          <td className="p-4 align-middle">
                            {player.name}
                          </td>
                          <td className="p-4 align-middle text-center">
                            {/* Display 0 when no knockouts instead of undefined */}
                            {typeof player.knockouts === 'number' ? player.knockouts : 0}
                          </td>
                          <td className="p-4 align-middle">
                            <span className="text-sm">
                              {player.eliminatedBy ? getPlayerNameById(player.eliminatedBy) : 
                               (player.isActive === false ? 'Unknown' : '-')}
                            </span>
                          </td>
                          <td className="p-4 align-middle text-center">
                            <span className="text-sm">
                              {player.rebuys || 0}
                              {player.addons ? ` (+${player.addons})` : ''}
                            </span>
                          </td>
                          <td className="p-4 align-middle text-right">
                            {(() => {
                              const winnings = calculatePlayerWinnings(player);
                              return winnings > 0 ? formatCurrency(winnings, currencySymbol) : "";
                            })()}
                          </td>
                          <td className="p-4 align-middle text-center">
                            <div className="flex gap-1 justify-center">
                              {canPlayerRebuy(player) && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRebuy(player.id)}
                                  className="h-7 px-2 text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 font-medium"
                                >
                                  <RotateCcw className="h-3 w-3 mr-1" />
                                  Rebuy
                                </Button>
                              )}
                              {prizeStructure.allowAddons && player.isActive !== false && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleAddon(player.id)}
                                  className="h-7 px-2 text-xs bg-card border border-primary text-primary hover:bg-primary hover:bg-opacity-10 font-medium"
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Addon
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-muted-foreground">
              <p>No players added yet.</p>
              <p className="text-sm mt-2">
                Add players to the tournament to see them in the rankings table.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}