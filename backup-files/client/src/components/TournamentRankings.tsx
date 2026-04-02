import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Player } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TournamentRankingsProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

export default function TournamentRankings({ tournament }: TournamentRankingsProps) {
  const { state } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Get currency symbol from settings
  const currencySymbol = state.settings.currency || '£';
  
  // Calculate total prize pool
  const totalPrizePool = (state.prizeStructure?.buyIn || 0) * state.players.length;
  
  // Calculate comprehensive player winnings with detailed analytics
  const calculatePlayerWinnings = (player: Player): number => {
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

  // Calculate player performance metrics
  const getPlayerAnalytics = (player: Player) => {
    const totalInvestment = player.totalInvestment || (state.prizeStructure?.buyIn || 0);
    const winnings = calculatePlayerWinnings(player);
    const roi = totalInvestment > 0 ? ((winnings - totalInvestment) / totalInvestment * 100) : 0;
    
    return {
      winnings,
      investment: totalInvestment,
      roi: Math.round(roi * 100) / 100,
      eliminationLevel: player.eliminationLevel || 'N/A',
      playTime: player.playTime ? Math.round(player.playTime / 60) : 'N/A'
    };
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

  // Show rankings if there are players
  const rankingsAvailable = state.players.length > 0;

  if (!rankingsAvailable) {
    return null;
  }

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">emoji_events</span>
          Tournament Rankings
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>
      
      {/* Collapsible content */}
      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          <div className="bg-background bg-opacity-40 rounded-lg p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Rank</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="w-24 text-center">Knockouts</TableHead>
                  <TableHead className="w-32">Hitman</TableHead>
                  <TableHead className="w-32 text-right">Winnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPlayers.map((player) => {
                  const winnings = calculatePlayerWinnings(player);
                  
                  // Find eliminator name
                  const getEliminatorName = (eliminatedBy?: string) => {
                    if (!eliminatedBy) return '-';
                    const eliminator = state.players.find(p => p.id === eliminatedBy);
                    return eliminator ? eliminator.name : '-';
                  };
                  
                  // Check if player has been eliminated (has a position)
                  let displayRank = "Active";
                  if (player.position && player.position > 0) {
                    if (player.position === 1) displayRank = "1st";
                    else if (player.position === 2) displayRank = "2nd";
                    else if (player.position === 3) displayRank = "3rd";
                    else displayRank = `${player.position}th`;
                  }
                  
                  return (
                    <TableRow key={player.id}>
                      <TableCell className="font-medium">
                        <span className={`px-2 py-1 rounded text-sm ${
                          player.position && player.position > 0
                            ? player.position === 1 
                              ? "bg-yellow-500 text-black" 
                              : player.position === 2 
                              ? "bg-gray-300 text-black"
                              : player.position === 3
                              ? "bg-amber-600 text-white"
                              : "bg-red-900 text-white"
                            : "bg-green-600 text-white"
                        }`}>
                          {displayRank}
                        </span>
                      </TableCell>
                      <TableCell>{player.name}</TableCell>
                      <TableCell className="text-center">{player.knockouts || 0}</TableCell>
                      <TableCell className="text-sm">
                        {getEliminatorName(player.eliminatedBy)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {winnings > 0 ? `${currencySymbol}${winnings.toFixed(0)}` : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Card>
  );
}