import { useState, useMemo } from 'react';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeagueSettings } from '@/hooks/useLeagueSettings';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LeagueTableProps {
  playerCount: number;
}

export default function LeagueTable({ playerCount }: LeagueTableProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [position, setPosition] = useState<number>(1);

  const {
    league,
    leaguePlayers,
    addLeaguePlayer,
    recordResult,
    removeResult,
    getLeagueStandings,
    resetLeague
  } = useLeague();
  const { currentSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });

  const { settings, calculatePoints } = useLeagueSettings();
  const standings = getLeagueStandings();

  // Check if we're in a league tournament context
  // For now, always show the table if accessed directly, but this could be enhanced
  // to check tournament context if passed as prop

  // Calculate additional stats for each player
  const playersWithStats = useMemo(() => {
    return leaguePlayers.map(player => {
      const totalGames = player.tournamentResults?.length || 0;
      const totalWins = player.tournamentResults?.filter(result => result.position === 1).length || 0;
      const averagePoints = totalGames > 0 ? Math.round(player.totalPoints / totalGames) : 0;

      // Calculate positions
      const firstPlaces = player.tournamentResults?.filter(result => result.position === 1).length || 0;
      const secondPlaces = player.tournamentResults?.filter(result => result.position === 2).length || 0;
      const thirdPlaces = player.tournamentResults?.filter(result => result.position === 3).length || 0;

      // Calculate final table appearances (top 6 positions)
      const finalTableAppearances = player.tournamentResults?.filter(result => result.position && result.position <= 6).length || 0;

      // Calculate average position (only for tournaments where position is recorded)
      const resultsWithPosition = player.tournamentResults?.filter(result => result.position) || [];
      const averagePosition = resultsWithPosition.length > 0 
        ? Math.round((resultsWithPosition.reduce((sum, result) => sum + (result.position || 0), 0) / resultsWithPosition.length) * 10) / 10
        : 0;

      // Calculate total cash winnings from actual prize money
      const cashWinnings = player.tournamentResults?.reduce((sum, result) => sum + ((result as any).prizeMoney || 0), 0) || 0;

      // Calculate hits (players busted)
      const hits = player.tournamentResults?.reduce((sum, result) => sum + ((result as any).knockouts || 0), 0) || 0;

      // Calculate total investment (buy-ins + rebuys + add-ons)
      const totalInvestment = player.tournamentResults?.reduce((sum, result) => {
        const buyIn = result.buyIn || (result as any).buyInAmount || 8; // £5 + £3 bounty = £8 total

        // Add rebuys and add-ons if available
        const rebuys = ((result as any).rebuys || 0) * ((result as any).rebuyAmount || buyIn);
        const addons = ((result as any).addons || 0) * ((result as any).addonAmount || buyIn);

        return sum + buyIn + rebuys + addons;
      }, 0) || 0;

      // Calculate profit (winnings - investment)
      const profit = cashWinnings - totalInvestment;

      // Calculate ROI (return on investment as percentage)
      const roi = totalInvestment > 0 ? Math.round((profit / totalInvestment) * 100 * 10) / 10 : 0;

      return {
        ...player,
        totalGames,
        totalWins,
        averagePoints,
        firstPlaces,
        secondPlaces,
        thirdPlaces,
        finalTableAppearances,
        averagePosition,
        cashWinnings,
        hits,
        profit,
        roi
      };
    });
  }, [leaguePlayers]);

  // Get enabled stats for display
  const enabledStats = Object.entries(settings?.statsToDisplay || {})
    .filter(([_, enabled]) => enabled)
    .map(([stat, _]) => stat);

  // Stat labels for display
  const statLabels: Record<string, string> = {
    points: 'Points',
    hits: 'Hits',
    games: 'Games',
    averagePoints: 'Avg Pts',
    firstPlaceFinishes: '1st',
    secondPlaceFinishes: '2nd', 
    thirdPlaceFinishes: '3rd',
    cashWinnings: 'Winnings',
    recentForm: 'Form',
    bestFinish: 'Best',
    winRate: 'Win %',
    averagePosition: 'Avg Pos',
    finalTableAppearances: 'Finals',
    headsUpRecord: 'H2H',
    earlyExits: 'Early Out',
    profit: 'Profit',
    roi: 'ROI (%)'
  };

  const handleAddPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (trimmedName && trimmedName.length > 0) {
      addLeaguePlayer(trimmedName);
      setNewPlayerName('');
    }
  };

  const handleRecordResult = () => {
    if (selectedPlayer && position > 0) {
      // Check if this player already has a result recorded for today's tournament
      const selectedPlayerData = leaguePlayers.find(p => p.id === selectedPlayer);
      const today = new Date().toISOString().split('T')[0]; // Get today's date

      // Check if player already has a result for today
      const hasResultToday = selectedPlayerData?.tournamentResults.some(result => 
        result.date.split('T')[0] === today
      );

      if (hasResultToday) {
        alert('This player already has a result recorded for today. Please remove the existing result first if you need to make changes.');
        return;
      }

      recordResult(selectedPlayer, position, playerCount);
      setSelectedPlayer(null);
      setPosition(1);
    }
  };

  const handlePlayerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAddPlayer();
    }
  };

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
        return player.tournamentResults?.reduce((sum: number, r: any) => sum + (r.playersEliminatedCount || 0), 0)?.toString() || '0';
      case 'cashWinnings':
        return `£${player.tournamentResults?.reduce((sum: number, r: any) => sum + (r.prizeMoney || 0), 0)?.toFixed(0) || '0'}`;
      case 'recentForm':
        const recentGames = player.tournamentResults?.slice(-5) || [];
        const recentAvg = recentGames.length > 0 
          ? recentGames.reduce((sum: number, r: any) => sum + r.points, 0) / recentGames.length
          : 0;
        const formScore = Math.min(10, Math.max(0, Math.round(recentAvg / 10)));
        return `${formScore}/10`;
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
        return player.finalTableAppearances?.toString() || '0';
      case 'profit':
        return `£${player.profit?.toFixed(0) || '0'}`;
      case 'roi':
        return `${player.roi?.toFixed(1) || '0'}%`;
      default:
        return 'N/A';
    }
  };

  return (
    <Card className="p-4">
      <div 
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold flex items-center">
          <span className="material-icons mr-2 text-secondary">emoji_events</span>
          League Table - {currentSeason?.name || 'Current Season'}
        </h2>
        <span className="material-icons text-xl text-muted-foreground hover:text-foreground transition-colors">
          {isExpanded ? 'unfold_less' : 'unfold_more'}
        </span>
      </div>

      {isExpanded && (
        <div className="p-5 pt-0 border-t border-[#2a2a2a]">
          {/* Season Info */}
          {currentSeason && (
            <div className="mb-4 pb-3 border-b border-[#2a2a2a]">
              <h3 className="text-lg font-medium mb-1">{currentSeason.name}</h3>
              <p className="text-sm text-muted-foreground">
                Season Dates: {formatSeasonDateRange(currentSeason)}
              </p>
              <p className="text-sm text-muted-foreground">
                Player Count: {(currentSeason as any).players?.length || 0} registered
              </p>
            </div>
          )}

          {/* Add League Player */}
          <div className="mb-4">
            <h3 className="text-lg font-medium mb-3">Add Player to League</h3>
            <div className="flex gap-2">
              <Input 
                type="text" 
                placeholder="Player name" 
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyDown={handlePlayerKeyDown}
                className="flex-1 rounded-lg px-3 py-2 bg-input border border-border"
              />
              <Button 
                onClick={handleAddPlayer}
                className="flex items-center justify-center bg-primary hover:bg-[#7722ff] text-white font-medium py-2 px-4 rounded-lg"
              >
                <span className="material-icons">person_add</span>
              </Button>
            </div>
          </div>

          {/* Record Tournament Result */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">Record Tournament Result</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="col-span-1 md:col-span-1">
                <select
                  value={selectedPlayer || ''}
                  onChange={(e) => setSelectedPlayer(e.target.value)}
                  className="w-full bg-input border border-border text-foreground rounded-lg px-3 py-2"
                >
                  <option value="">Select Player</option>
                  {leaguePlayers.map(player => (
                    <option key={player.id} value={player.id}>{player.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-1 md:col-span-1">
                <div className="flex items-center">
                  <span className="mr-2 text-muted-foreground">Position:</span>
                  <Input
                    type="number" 
                    min={1}
                    value={position}
                    onChange={(e) => setPosition(parseInt(e.target.value) || 1)}
                    className="w-20 rounded-lg px-3 py-2 bg-input border border-border"
                  />
                  <div className="ml-2 text-muted-foreground">
                    ({calculatePoints(position, playerCount)} pts)
                  </div>
                </div>
              </div>
              <div>
                <Button 
                  onClick={handleRecordResult}
                  disabled={!selectedPlayer}
                  className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-opacity-90 text-black font-medium py-2 px-4 rounded-lg"
                >
                  <span className="material-icons">add_task</span>
                  <span>Record Result</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Recent Results */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-3">Recent Results (Today)</h3>
            <div className="bg-[#1e1e1e] rounded-lg p-3 max-h-32 overflow-y-auto">
              {(() => {
                const today = new Date().toISOString().split('T')[0];
                const todayResults = leaguePlayers.flatMap(player => 
                  player.tournamentResults
                    .filter(result => result.date.split('T')[0] === today)
                    .map(result => ({ ...result, playerName: player.name, playerId: player.id }))
                ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                return todayResults.length > 0 ? (
                  todayResults.map(result => (
                    <div key={result.id} className="flex items-center justify-between py-1 text-sm">
                      <span>{result.playerName} - Position {result.position} ({result.points} pts)</span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeResult(result.playerId, result.id)}
                        className="h-6 w-6 p-0"
                      >
                        <span className="material-icons text-xs">close</span>
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground text-sm py-2">
                    No results recorded today
                  </div>
                );
              })()}
            </div>
          </div>

          {/* League Standings */}
          <div className="rounded-lg overflow-hidden">
            <ScrollArea className="h-[400px] w-full">
              <div className="overflow-x-auto">
                <Table className="min-w-max">
                <TableHeader className="bg-[#2a2a2a] sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-white w-12 min-w-[48px] text-center">Rank</TableHead>
                    <TableHead className="text-white w-24 min-w-[96px]">Player</TableHead>
                    {enabledStats.map(stat => (
                      <TableHead key={stat} className="text-white text-right w-16 min-w-[64px] px-2">
                        {statLabels[stat] || stat}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {standings.length > 0 ? (
                    standings.map((player, index) => {
                      // Find the enhanced player data with calculated stats
                      const enhancedPlayer = playersWithStats.find(p => p.id === player.id) || player;
                      return (
                        <TableRow key={player.id} className={index % 2 === 0 ? 'bg-[#1e1e1e]' : ''}>
                          <TableCell className="font-medium w-12 min-w-[48px] text-center px-2 text-sm">{index + 1}</TableCell>
                          <TableCell className="w-24 min-w-[96px] truncate" title={player.name}>{player.name}</TableCell>
                          {enabledStats.map(stat => (
                            <TableCell key={stat} className="text-right w-16 min-w-[64px] px-2 text-sm">
                              {getPlayerStat(enhancedPlayer, stat)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2 + enabledStats.length} className="text-center py-6 text-muted-foreground">
                        No players in the league yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </ScrollArea>
          </div>

          {/* Reset League Button */}
          <div className="mt-4 flex justify-end">
            <Button 
              variant="destructive" 
              onClick={resetLeague}
              className="flex items-center justify-center gap-2 bg-destructive hover:bg-opacity-90 text-white font-medium py-2 px-4 rounded-lg"
            >
              <span className="material-icons">delete_forever</span>
              <span>Reset League</span>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}