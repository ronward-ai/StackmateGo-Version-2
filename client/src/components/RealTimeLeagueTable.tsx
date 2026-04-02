import React, { useState, useEffect, useMemo, Component, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trophy, RefreshCw, Download, TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { useLeague } from '@/hooks/useLeague';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import html2canvas from 'html2canvas';

interface RealTimeLeagueTableProps {
  tournament?: any;
  isParticipantView?: boolean;
}

function RealTimeLeagueTable({
  tournament,
  isParticipantView = false
}: RealTimeLeagueTableProps) {
  // ALWAYS call ALL hooks first - never conditionally
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [previousRankings, setPreviousRankings] = useState<{[playerId: string]: number}>({});
  const exportRef = useRef<HTMLDivElement>(null);
  const settingsData = useLeagueSettings(tournament?.ownerId);
  const leagueData = useLeague(tournament?.ownerId);

  // ALL hook calls complete - now safe to do any logic
  const isSeasonTournament = tournament?.isSeasonTournament === true || tournament?.settings?.isSeasonTournament === true;

  // Safely destructure with fallbacks
  const {
    leaguePlayers = [],
    getLeagueStandings = () => []
  } = leagueData || {};

  const {
    settings: leagueSettings = null,
    calculatePoints = () => 0
  } = settingsData || {};

  // Force refresh when settings change
  useEffect(() => {
    if (leagueSettings) {
      console.log('🎯 League table detected settings update:', {
        pointsSystem: leagueSettings.pointsSystem?.formula?.type,
        customFormula: leagueSettings.pointsSystem?.formula?.customFormula,
        statsToDisplay: leagueSettings.statsToDisplay
      });
    }
  }, [leagueSettings]);

  let leagueStandings = [];
  let totalTournaments = 0;

  // Get current season name from league settings, or fallback to tournament data, or default
  const currentSeasonName = leagueSettings?.seasonSettings?.seasonName || tournament?.season?.name || 'Current Season';

  try {
    // Get basic league standings first
    leagueStandings = typeof getLeagueStandings === 'function' ? getLeagueStandings() : [];

    // Debug logging for participant view
    if (isParticipantView) {
      console.log('🔍 Participant View - League Players:', leaguePlayers?.length || 0);
      console.log('🔍 Participant View - League Standings:', leagueStandings?.length || 0);
    }

    // Calculate total tournaments safely
    if (Array.isArray(leaguePlayers) && leaguePlayers.length > 0) {
      const tournamentIds = new Set();
      leaguePlayers.forEach(player => {
        if (player.tournamentResults && Array.isArray(player.tournamentResults)) {
          player.tournamentResults.forEach(result => {
            if (result.tournamentId) {
              tournamentIds.add(result.tournamentId);
            } else if (result.id) {
              // Fallback to result ID if tournamentId is missing (legacy data)
              tournamentIds.add(result.id);
            }
          });
        }
      });
      totalTournaments = tournamentIds.size;
    }
  } catch (error) {
    console.error('Error processing league data:', error);
    leagueStandings = [];
    totalTournaments = 0;
  }

  // Ensure we have valid standings data
  const standings = Array.isArray(leagueStandings) ? leagueStandings : [];

  const statLabels: {[key: string]: string} = {
    points: 'Points',
    games: 'Games',
    averagePoints: 'Avg. Points',
    firstPlaceFinishes: '1st Place',
    secondPlaceFinishes: '2nd Place',
    thirdPlaceFinishes: '3rd Place',
    hits: 'Hits',
    cashWinnings: 'Winnings',
    bestFinish: 'Best',
    winRate: 'Win %',
    averagePosition: 'Avg. Pos',
    finalTableAppearances: 'Finals',
    headsUpRecord: 'H2H',
    earlyExits: 'Early Out',
    profit: 'Profit',
    roi: 'ROI (%)'
  };

  // Get enabled stats from settings with proper fallback
  const enabledStats = useMemo(() => {
    if (!leagueSettings?.statsToDisplay) {
      // Default stats if no specific settings are found, including financial ones
      return ['points', 'games', 'hits', 'cashWinnings', 'profit', 'roi'];
    }

    const enabledFromSettings = Object.entries(leagueSettings.statsToDisplay)
      .filter(([_, enabled]) => enabled)
      .map(([stat, _]) => stat);

    console.log('🎯 Enabled stats from settings:', enabledFromSettings);
    return enabledFromSettings;
  }, [leagueSettings?.statsToDisplay]);

  // Calculate stats for a player
  const getPlayerStat = (player: any, stat: string) => {
    switch(stat) {
      case 'points':
        return player.totalPoints?.toString() || '0';
      case 'games':
        return player.tournamentResults?.length?.toString() || '0';
      case 'averagePoints':
        const avgPts = player.tournamentResults?.length > 0
          ? Math.round(player.totalPoints / player.tournamentResults.length)
          : 0;
        return avgPts.toString();
      case 'firstPlaceFinishes':
        return player.tournamentResults?.filter((r: any) => r.position === 1)?.length?.toString() || '0';
      case 'secondPlaceFinishes':
        return player.tournamentResults?.filter((r: any) => r.position === 2)?.length?.toString() || '0';
      case 'thirdPlaceFinishes':
        return player.tournamentResults?.filter((r: any) => r.position === 3)?.length?.toString() || '0';
      case 'hits':
        if (!player.tournamentResults || !Array.isArray(player.tournamentResults)) {
          return '0';
        }
        const totalHits = player.tournamentResults.reduce((sum: number, result: any) => {
          const eliminations = result.playersEliminatedCount || 0;
          return sum + eliminations;
        }, 0);
        return totalHits.toString();
      case 'cashWinnings':
        if (!player.tournamentResults || !Array.isArray(player.tournamentResults)) {
          return '£0';
        }

        // Only calculate winnings from actual recorded prize money
        const cashWinnings = player.tournamentResults.reduce((sum: number, result: any) => {
          // Only count if actual prize money was recorded (not theoretical)
          const prizeMoney = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings;
          return sum + (prizeMoney || 0);
        }, 0);

        return `£${cashWinnings.toLocaleString()}`;
      case 'bestFinish':
        const bestPos = Math.min(...(player.tournamentResults?.map((r: any) => r.position) || [999]));
        return bestPos === 999 ? 'N/A' : bestPos.toString();
      case 'winRate':
        const wins = player.tournamentResults?.filter((r: any) => r.position === 1)?.length || 0;
        const totalGames = player.tournamentResults?.length || 0;
        const winPct = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
        return `${winPct}%`;
      case 'averagePosition':
        const positions = player.tournamentResults?.map((r: any) => r.position) || [];
        const avgPos = positions.length > 0
          ? Math.round(positions.reduce((sum: number, pos: number) => sum + pos, 0) / positions.length)
          : 0;
        return avgPos.toString();
      case 'finalTableAppearances':
        // Assuming final table is top 9 positions
        return player.tournamentResults?.filter((r: any) => r.position <= 9)?.length?.toString() || '0';
      case 'headsUpRecord':
        const headsUpWins = player.tournamentResults?.filter((r: any) => r.position === 1)?.length || 0;
        const headsUpLosses = player.tournamentResults?.filter((r: any) => r.position === 2)?.length || 0;
        return headsUpWins + headsUpLosses > 0 ? `${headsUpWins}-${headsUpLosses}` : '0-0';
      case 'earlyExits':
        // Assuming early exit is finishing in bottom 20% of field
        const earlyExits = player.tournamentResults?.filter((r: any) => {
          // This is a rough approximation - would need actual field size data
          return r.position > (r.totalPlayers * 0.8);
        })?.length || 0;
        return earlyExits.toString();
        case 'profit':
            if (!player.tournamentResults || !Array.isArray(player.tournamentResults)) {
              return '£0';
            }

            // Get actual buy-in from tournament settings
            const actualBuyIn = tournament?.state?.prizeStructure?.buyIn || tournament?.prizeStructure?.buyIn || 10;

            // Calculate total investment (buy-ins + rebuys + add-ons) using actual tournament settings
            const totalInvestment = player.tournamentResults.reduce((sum: number, result: any) => {
              const buyIn = result.buyIn || result.buyInAmount || actualBuyIn;
              const rebuys = (result.rebuys || 0) * (result.rebuyAmount || buyIn);
              const addons = (result.addons || 0) * (result.addonAmount || buyIn);
              return sum + buyIn + rebuys + addons;
            }, 0);

            // Only use actual recorded prize money (not theoretical)
            const profitWinnings = player.tournamentResults.reduce((sum: number, result: any) => {
              const prizeMoney = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings;
              return sum + (prizeMoney || 0);
            }, 0);

            const profit = profitWinnings - totalInvestment;
            return `£${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`;
        case 'roi':
            if (!player.tournamentResults || !Array.isArray(player.tournamentResults)) {
              return '0%';
            }

            // Get actual buy-in from tournament settings
            const actualBuyInForROI = tournament?.state?.prizeStructure?.buyIn || tournament?.prizeStructure?.buyIn || 10;

            // Calculate total investment using actual tournament settings
            const investment = player.tournamentResults.reduce((sum: number, result: any) => {
              const buyIn = result.buyIn || result.buyInAmount || actualBuyInForROI;
              const rebuys = (result.rebuys || 0) * (result.rebuyAmount || buyIn);
              const addons = (result.addons || 0) * (result.addonAmount || buyIn);
              return sum + buyIn + rebuys + addons;
            }, 0);

            if (investment === 0) return '0%';

            // Only use actual recorded prize money (not theoretical)
            const roiWinnings = player.tournamentResults.reduce((sum: number, result: any) => {
              const prizeMoney = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings;
              return sum + (prizeMoney || 0);
            }, 0);

            const profitAmount = roiWinnings - investment;
            const roiPercentage = (profitAmount / investment) * 100;

            return `${roiPercentage >= 0 ? '+' : ''}${Math.round(roiPercentage * 10) / 10}%`;
      default:
        return 'N/A';
    }
  };

  // Check if we have any league data at all
  const hasAnyLeagueData = leaguePlayers && leaguePlayers.length > 0;
  const hasAnyResults = hasAnyLeagueData && leaguePlayers.some(p => p.tournamentResults && p.tournamentResults.length > 0);

  // Simple logging for debugging
  if (isParticipantView) {
    console.log('🔍 Participant View League Table - Players:', leaguePlayers?.length || 0, 'Has Results:', hasAnyResults);
  }

  // Function to get ranking movement indicator
  const getRankingMovement = (playerId: string, currentRank: number) => {
    const previousRank = previousRankings[playerId];

    // If no previous data, don't show arrows
    if (previousRank === undefined) {
      return null;
    }

    // Show movement arrows for any change in ranking
    if (previousRank > currentRank) {
      return { direction: 'up', icon: ArrowUp, color: 'text-green-500' };
    } else if (previousRank < currentRank) {
      return { direction: 'down', icon: ArrowDown, color: 'text-red-500' };
    } else {
      // Show horizontal orange arrow for no movement
      return { direction: 'same', icon: Minus, color: 'text-orange-500' };
    }
  };

  // Calculate stats for each player
  const playersWithStats = useMemo(() => {
    return leaguePlayers.map(player => {
      const results = player.tournamentResults || [];

      // Basic stats
      const games = results.length;
      const totalPoints = results.reduce((sum, result) => sum + (result.points || 0), 0);
      const averagePoints = games > 0 ? Math.round((totalPoints / games) * 10) / 10 : 0;

      // Position-based stats
      const firstPlaces = results.filter(r => r.position === 1).length;
      const secondPlaces = results.filter(r => r.position === 2).length;
      const thirdPlaces = results.filter(r => r.position === 3).length;

      // Hits calculation (players eliminated by this player)
      const hits = results.reduce((total, result) => {
        const playersEliminated = Math.max(0, (result.totalPlayers || 0) - (result.position || 0));
        return total + playersEliminated;
      }, 0);

      // Cash winnings from actual tournament history - only use recorded prize money
      const cashWinnings = results.reduce((sum, result) => {
        const prizeMoney = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings;
        return sum + (prizeMoney || 0);
      }, 0);

      // Get actual buy-in from current tournament settings
      const currentTournamentBuyIn = tournament?.state?.prizeStructure?.buyIn || tournament?.prizeStructure?.buyIn || 10;

      // Calculate total investment from tournament history using actual buy-in
      const totalInvestment = results.reduce((sum, result) => {
        // Use actual tournament buy-in instead of hardcoded value
        const buyIn = result.buyIn || result.buyInAmount || currentTournamentBuyIn;

        // Add rebuys and add-ons if available
        const rebuys = (result.rebuys || 0) * (result.rebuyAmount || buyIn);
        const addons = (result.addons || 0) * (result.addonAmount || buyIn);

        return sum + buyIn + rebuys + addons;
      }, 0);

      const buyInsSpent = totalInvestment;

      // Profit calculation (earnings minus buy-ins)
      const profit = cashWinnings - buyInsSpent;

      // Financial stats calculated for ${player.name}

      // ROI calculation (profit / total buy-ins * 100)
      const roi = buyInsSpent > 0 ? Math.round((profit / buyInsSpent) * 100 * 10) / 10 : 0;

      // Average position
      const averagePosition = games > 0
        ? Math.round((results.reduce((sum, result) => sum + (result.position || 0), 0) / games) * 10) / 10
        : 0;

      // Final table appearances (top 50% of field)
      const finalTableAppearances = results.filter(result => {
        const finalTableSize = Math.ceil((result.totalPlayers || 0) / 2);
        return (result.position || 0) <= finalTableSize;
      }).length;

      return {
        ...player,
        games,
        averagePoints,
        firstPlaces,
        secondPlaces,
        thirdPlaces,
        hits,
        cashWinnings,
        averagePosition,
        finalTableAppearances,
        profit,
        roi,
        // Keep original totalPoints for display
        displayPoints: player.totalPoints || totalPoints
      };
    });
  }, [leaguePlayers, tournament?.state?.prizeStructure?.buyIn, tournament?.prizeStructure?.buyIn]); // Added tournament buy-in to dependency array

  // Use the calculated stats instead of raw standings
  const displayPlayers = playersWithStats
    .sort((a, b) => {
      // Primary sort: total points (descending)
      if (b.displayPoints !== a.displayPoints) {
        return b.displayPoints - a.displayPoints;
      }

      // Secondary sort: number of games (ascending - fewer games played ranks higher)
      const aGames = a.games;
      const bGames = b.games;
      if (aGames !== bGames) {
        return aGames - bGames;
      }

      // Tertiary sort: best finish (ascending - better finish ranks higher)
      const aBest = Math.min(...a.tournamentResults.map(r => r.position), 999);
      const bBest = Math.min(...b.tournamentResults.map(r => r.position), 999);
      return aBest - bBest;
    });

  // Update previous rankings when display order changes
  useEffect(() => {
    if (displayPlayers.length > 0) {
      const currentRankings: {[playerId: string]: number} = {};
      displayPlayers.forEach((player, index) => {
        currentRankings[player.id] = index + 1;
      });

      // Check if this is the first time we're setting rankings
      const isFirstTime = Object.keys(previousRankings).length === 0;

      if (isFirstTime) {
        // On first load, store current rankings without showing arrows
        setPreviousRankings(currentRankings);
      } else {
        // Check if rankings have actually changed
        const hasChanged = Object.keys(currentRankings).some(playerId =>
          currentRankings[playerId] !== previousRankings[playerId]
        );

        if (hasChanged) {
          // Don't update previous rankings - keep them for permanent comparison
          console.log('🎯 Rankings changed - arrows will stay visible permanently');

          // Only update previous rankings if movement arrows are disabled
          if (!leagueSettings?.displaySettings?.showMovementArrows) {
            setPreviousRankings(currentRankings);
          }
        }
      }
    }
  }, [displayPlayers.length, displayPlayers.map(p => `${p.id}-${p.displayPoints}`).join(','), leagueSettings?.displaySettings?.showMovementArrows]);

  // Clear movement arrows when the toggle is disabled
  useEffect(() => {
    if (!leagueSettings?.displaySettings?.showMovementArrows) {
      const currentRankings: {[playerId: string]: number} = {};
      displayPlayers.forEach((player, index) => {
        currentRankings[player.id] = index + 1;
      });
      setPreviousRankings(currentRankings);
      console.log('🎯 Movement arrows disabled - clearing arrow indicators');
    }
  }, [leagueSettings?.displaySettings?.showMovementArrows]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Add any refresh logic here if needed
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Error refreshing league data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportImage = async () => {
    if (!exportRef.current) return;

    setIsExporting(true);
    try {
      // Find the ScrollArea component and temporarily remove height restrictions
      const scrollArea = exportRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
      const tableContainer = exportRef.current.querySelector('.overflow-x-auto') as HTMLElement | null;

      // Store original styles
      const originalScrollStyles = scrollArea ? {
        height: scrollArea.style.height,
        maxHeight: scrollArea.style.maxHeight,
        overflow: scrollArea.style.overflow
      } : null;

      const originalTableStyles = tableContainer ? {
        height: tableContainer.style.height,
        maxHeight: tableContainer.style.maxHeight,
        overflow: tableContainer.style.overflow
      } : null;

      // Temporarily remove height restrictions for export
      if (scrollArea) {
        scrollArea.style.height = 'auto';
        scrollArea.style.maxHeight = 'none';
        scrollArea.style.overflow = 'visible';
      }

      if (tableContainer) {
        tableContainer.style.height = 'auto';
        tableContainer.style.maxHeight = 'none';
        tableContainer.style.overflow = 'visible';
      }

      // Wait for layout to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(exportRef.current, {
        background: '#1e1e1e',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        height: exportRef.current.scrollHeight,
        windowWidth: exportRef.current.scrollWidth,
        windowHeight: exportRef.current.scrollHeight
      } as any);

      // Restore original styles
      if (scrollArea && originalScrollStyles) {
        scrollArea.style.height = originalScrollStyles.height;
        scrollArea.style.maxHeight = originalScrollStyles.maxHeight;
        scrollArea.style.overflow = originalScrollStyles.overflow;
      }

      if (tableContainer && originalTableStyles) {
        tableContainer.style.height = originalTableStyles.height;
        tableContainer.style.maxHeight = originalTableStyles.maxHeight;
        tableContainer.style.overflow = originalTableStyles.overflow;
      }

      const link = document.createElement('a');
      link.download = `league-standings-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error exporting league standings:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // NEVER return null - always render something to maintain hook consistency
  if (!isSeasonTournament && isParticipantView) {
    // Only hide if this is a participant view and not a season tournament
    return <div style={{ display: 'none' }} />;
  }

  if (!hasAnyLeagueData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="mr-3 h-5 w-5 text-orange-500" />
            League Standings - {currentSeasonName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No League Players Yet</p>
            <p className="text-sm">
              The league table will appear once players have competed in league tournaments.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyResults) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="mr-3 h-5 w-5 text-orange-500" />
            League Standings - {currentSeasonName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">League Players Ready</p>
            <p className="text-sm">
              {leaguePlayers.length} player(s) registered. Complete tournaments to see results.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <div ref={exportRef}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="mr-3 h-5 w-5 text-orange-500" />
              League Standings - {currentSeasonName}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportImage}
                disabled={isExporting}
                className="h-8 px-2"
              >
                <Download className={`h-4 w-4 ${isExporting ? 'animate-pulse' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 px-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
              <div className="text-sm text-muted-foreground">
                {displayPlayers.length} player(s)
              </div>
            </div>
          </CardTitle>
        </CardHeader>

      <CardContent>
        {displayPlayers.length > 0 ? (
          <div className="relative overflow-hidden rounded-lg">
            <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
              <Table className="w-full">
                <TableHeader className="bg-[#2a2a2a] sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-white w-6 text-center px-0.5 text-xs border-r border-slate-600">Rank</TableHead>
                    <TableHead className="text-white w-16 px-1 text-xs border-r border-slate-600">Player</TableHead>
                    {enabledStats.map(stat => {
                      const label = statLabels[stat] || stat;
                      const words = label.split(' ');
                      const isMultiWord = words.length > 1;

                      return (
                        <TableHead key={stat} className="text-white text-center w-10 px-0.5 text-xs border-r border-slate-600 last:border-r-0">
                          {isMultiWord ? (
                            <div className="flex flex-col items-center">
                              {words.map((word, index) => (
                                <span key={index} className="leading-3">{word}</span>
                              ))}
                            </div>
                          ) : (
                            label
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPlayers.map((player, index) => {
                    const currentRank = index + 1;
                    const movement = getRankingMovement(player.id, currentRank);
                    return (
                      <TableRow key={player.id} className={index % 2 === 0 ? 'bg-[#1e1e1e]' : ''}>
                        <TableCell className="font-medium w-6 text-center px-0.5 text-xs border-r border-slate-700">
                          <div className="flex items-center justify-center gap-1">
                            <span>{currentRank}</span>
                            {movement && leagueSettings?.displaySettings?.showMovementArrows && (
                              <span title={
                                movement.direction === 'same'
                                  ? `No movement - stayed at rank ${currentRank}`
                                  : `Moved ${movement.direction} from rank ${previousRankings[player.id]} to ${currentRank}`
                              }>
                                <movement.icon
                                  className={`h-3 w-3 ${movement.color} ${
                                    movement.direction === 'same'
                                      ? 'rotate-0'
                                      : movement.direction === 'up'
                                        ? 'rotate-0'
                                        : 'rotate-0'
                                  }`}
                                  strokeWidth={3}
                                />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium w-16 px-1 text-xs truncate border-r border-slate-700" title={player.name}>
                          {player.name}
                        </TableCell>
                      {enabledStats.map(stat => (
                        <TableCell key={stat} className="text-center w-10 px-0.5 text-xs whitespace-nowrap border-r border-slate-700 last:border-r-0">
                           {getPlayerStat(player, stat)}
                        </TableCell>
                      ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium mb-1">No League Data Available</p>
            <p className="text-sm">
              {leaguePlayers && leaguePlayers.length > 0
                ? `${leaguePlayers.length} players registered but no standings calculated yet`
                : "No players registered in the league system yet"
              }
            </p>
            <p className="text-xs mt-2 opacity-70">
              Configure league settings and record tournament results to see standings
            </p>
          </div>
        )}

      </CardContent>
      </div>
    </Card>
  );
}

export default function WrappedRealTimeLeagueTable(props: RealTimeLeagueTableProps) {
  // Always render the inner component to maintain hook consistency
  return <RealTimeLeagueTable {...props} />;
}