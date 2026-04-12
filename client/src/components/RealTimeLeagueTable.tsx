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
import { useSeasons } from '@/hooks/useSeasons';
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
  // previousRankings is derived from data (no component state needed)
  // computed below after seasonFilteredPlayers is defined
  const exportRef = useRef<HTMLDivElement>(null);
  const settingsData = useLeagueSettings(tournament?.ownerId);
  const leagueData = useLeague(tournament?.ownerId);
  // 'pending' is a placeholder returned while loading — fall through to the stored leagueId in that case
  const _rawLeagueId = (leagueData as any)?.league?.id;
  const leagueId = (_rawLeagueId && _rawLeagueId !== 'pending')
    ? _rawLeagueId
    : (tournament?.settings?.leagueId ?? null);
  const { currentSeason } = useSeasons({ leagueId });

  // ALL hook calls complete - now safe to do any logic
  const isSeasonTournament = tournament?.isSeasonTournament === true || tournament?.settings?.isSeasonTournament === true;

  // Safely destructure with fallbacks
  const {
    leaguePlayers = []
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

  // Get current season name from league settings, or fallback to tournament data, or default
  const currentSeasonName = leagueSettings?.seasonSettings?.seasonName || currentSeason?.name || tournament?.season?.name || 'Current Season';

  // Filter each player's results to the active season — must be before any logic that uses it
  const seasonId = currentSeason?.id ? String(currentSeason.id) : null;
  const seasonFilteredPlayers = useMemo(() => {
    if (!seasonId || !Array.isArray(leaguePlayers)) return leaguePlayers;
    return leaguePlayers.map(player => ({
      ...player,
      tournamentResults: (player.tournamentResults || []).filter(
        (r: any) => r.seasonId === seasonId
      )
    }));
  }, [leaguePlayers, seasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derive "previous rankings" from data: rankings before the most recent tournament.
  // This is always accurate regardless of component lifecycle / remounts.
  const previousRankings = useMemo(() => {
    if (!Array.isArray(seasonFilteredPlayers) || seasonFilteredPlayers.length === 0) return {};

    // Find the most recent tournament identifier across all players
    let latestDate = 0;
    let latestId: string | null = null;
    seasonFilteredPlayers.forEach(player => {
      (player.tournamentResults || []).forEach((r: any) => {
        const ts = r.tournamentDate?.seconds
          ? r.tournamentDate.seconds
          : (typeof r.tournamentDate === 'number' ? r.tournamentDate : 0);
        if (ts > latestDate) {
          latestDate = ts;
          latestId = r.tournamentId ? String(r.tournamentId) : (r.id ? String(r.id) : null);
        }
      });
    });

    if (!latestId) return {};

    // Compute points per player excluding the latest tournament
    const prevStats = seasonFilteredPlayers.map(player => {
      const prevResults = (player.tournamentResults || []).filter((r: any) => {
        const tid = r.tournamentId ? String(r.tournamentId) : (r.id ? String(r.id) : null);
        return tid !== latestId;
      });
      const totalPoints = prevResults.reduce((sum: number, r: any) => sum + (r.points || 0), 0);
      const games = prevResults.length;
      return { id: player.id, totalPoints, games };
    });

    // Everyone has 0 games before the latest tournament = first tournament ever, no arrows
    if (prevStats.every(p => p.games === 0)) return {};

    const sorted = [...prevStats].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.games - b.games;
    });

    const rankings: {[playerId: string]: number} = {};
    sorted.forEach((p, i) => { rankings[p.id] = i + 1; });
    return rankings;
  }, [seasonFilteredPlayers]);

  // Count unique tournaments in season
  const totalTournaments = useMemo(() => {
    const ids = new Set<string>();
    seasonFilteredPlayers.forEach(player => {
      (player.tournamentResults || []).forEach((r: any) => {
        if (r.tournamentId) ids.add(String(r.tournamentId));
        else if (r.id) ids.add(String(r.id));
      });
    });
    return ids.size;
  }, [seasonFilteredPlayers]);

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

  // Calculate stats for each player (season-filtered)
  const playersWithStats = useMemo(() => {
    return seasonFilteredPlayers.map(player => {
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
        const playersEliminated = result.knockouts || result.playersEliminatedCount || 0;
        return total + playersEliminated;
      }, 0);

      // Cash winnings from actual tournament history - only use recorded prize money
      const cashWinnings = results.reduce((sum, result) => {
        const prizeMoney = result.prizeMoney || result.cashWon || result.winnings || result.prizeAmount || result.totalWinnings;
        return sum + (prizeMoney || 0);
      }, 0);

      // Calculate total investment from tournament history
      const totalInvestment = results.reduce((sum, result) => {
        // Use recorded buy-in, fallback to 10 if missing to avoid changing historical data
        const buyIn = result.buyIn || result.buyInAmount || 10;

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

      // Additional stats
      const bestFinish = games > 0 ? Math.min(...results.map(r => r.position || 999)) : 999;
      const winRate = games > 0 ? Math.round((firstPlaces / games) * 100) : 0;
      const earlyExits = results.filter(r => (r.position || 0) > ((r.totalPlayers || 0) * 0.8)).length;

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
        bestFinish,
        winRate,
        earlyExits,
        // Keep original totalPoints for display
        displayPoints: player.totalPoints || totalPoints
      };
    });
  }, [seasonFilteredPlayers]);

  // Calculate stats for a player
  const getPlayerStat = (player: any, stat: string) => {
    switch(stat) {
      case 'points':
        return player.displayPoints?.toString() || '0';
      case 'games':
        return player.games?.toString() || '0';
      case 'averagePoints':
        return player.averagePoints?.toString() || '0';
      case 'firstPlaceFinishes':
        return player.firstPlaces?.toString() || '0';
      case 'secondPlaceFinishes':
        return player.secondPlaces?.toString() || '0';
      case 'thirdPlaceFinishes':
        return player.thirdPlaces?.toString() || '0';
      case 'hits':
        return player.hits?.toString() || '0';
      case 'cashWinnings':
        return `£${(player.cashWinnings || 0).toLocaleString()}`;
      case 'bestFinish':
        return player.bestFinish === 999 ? 'N/A' : player.bestFinish?.toString() || 'N/A';
      case 'winRate':
        return `${player.winRate || 0}%`;
      case 'averagePosition':
        return player.averagePosition?.toString() || '0';
      case 'finalTableAppearances':
        return player.finalTableAppearances?.toString() || '0';
      case 'headsUpRecord':
        const headsUpWins = player.firstPlaces || 0;
        const headsUpLosses = player.secondPlaces || 0;
        return headsUpWins + headsUpLosses > 0 ? `${headsUpWins}-${headsUpLosses}` : '0-0';
      case 'earlyExits':
        return player.earlyExits?.toString() || '0';
      case 'profit':
        return `£${(player.profit || 0) >= 0 ? '+' : ''}${(player.profit || 0).toLocaleString()}`;
      case 'roi':
        return `${(player.roi || 0) >= 0 ? '+' : ''}${player.roi || 0}%`;
      default:
        return 'N/A';
    }
  };

  // Check if we have any league data at all
  const hasAnyLeagueData = leaguePlayers && leaguePlayers.length > 0;
  // Use season-filtered results so "no results yet" message is accurate for the current season
  const hasAnyResults = hasAnyLeagueData && seasonFilteredPlayers.some(p => p.tournamentResults && p.tournamentResults.length > 0);

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

  // Use the calculated stats instead of raw standings
  const displayPlayers = useMemo(() => {
    return [...playersWithStats].sort((a, b) => {
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
  }, [playersWithStats]);


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
        backgroundColor: '#1e1e1e',
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
      const date = new Date().toISOString().split('T')[0];
      link.download = `league-standings-${currentSeasonName.replace(/\s+/g, '-')}-${date}.png`;
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