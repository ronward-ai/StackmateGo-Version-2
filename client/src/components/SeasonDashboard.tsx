import { useMemo } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Trophy,
  Users,
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  Award,
  Archive,
  BarChart2
} from 'lucide-react';

export default function SeasonDashboard() {
  const { league, leaguePlayers } = useLeague();
  const { currentSeason, seasons, formatSeasonDateRange, updateSeason } = useSeasons({ leagueId: league?.id });

  // ✅ FIXED: Filter results by seasonId, not players by seasonId
  const currentSeasonPlayers = useMemo(() => {
    if (!currentSeason) return [];
    return leaguePlayers
      .map(player => ({
        ...player,
        tournamentResults: player.tournamentResults.filter(
          r => r.seasonId === String(currentSeason.id)
        )
      }))
      .filter(player => player.tournamentResults.length > 0);
  }, [leaguePlayers, currentSeason?.id]);

  // Calculate season statistics from filtered results
  const seasonStats = useMemo(() => {
    const allResults = currentSeasonPlayers.flatMap(p => p.tournamentResults);
    const uniqueTournaments = new Set(allResults.map(r => r.tournamentId)).size;
    const totalPrizePool = allResults.reduce((sum, r) => sum + (r.cashWon || 0), 0);
    const avgPlayersPerTournament = uniqueTournaments > 0
      ? Math.round(allResults.length / uniqueTournaments)
      : 0;

    // Season progress
    const gamesRemaining = Math.max(0, (currentSeason?.numberOfGames || 0) - uniqueTournaments);
    const progressPercent = currentSeason?.numberOfGames
      ? Math.min(100, Math.round((uniqueTournaments / currentSeason.numberOfGames) * 100))
      : 0;

    return {
      totalPlayers: currentSeasonPlayers.length,
      totalTournaments: uniqueTournaments,
      totalPrizePool,
      avgPlayersPerTournament,
      gamesRemaining,
      progressPercent
    };
  }, [currentSeasonPlayers, currentSeason]);

  // Top performers for current season
  const topPerformers = useMemo(() => {
    return [...currentSeasonPlayers]
      .sort((a, b) => {
        const aPoints = a.tournamentResults.reduce((s, r) => s + (r.points || 0), 0);
        const bPoints = b.tournamentResults.reduce((s, r) => s + (r.points || 0), 0);
        if (bPoints !== aPoints) return bPoints - aPoints;
        return a.tournamentResults.length - b.tournamentResults.length;
      })
      .slice(0, 3)
      .map((player, index) => {
        const seasonPoints = player.tournamentResults.reduce((s, r) => s + (r.points || 0), 0);
        const wins = player.tournamentResults.filter(r => r.position === 1).length;
        const cashWon = player.tournamentResults.reduce((s, r) => s + (r.cashWon || 0), 0);
        return { ...player, rank: index + 1, seasonPoints, wins, cashWon };
      });
  }, [currentSeasonPlayers]);

  const handleEndSeason = async () => {
    if (!currentSeason) return;
    await updateSeason(currentSeason.id, { status: 'completed' });
  };

  if (!currentSeason) {
    return (
      <Card className="p-8" data-testid="season-dashboard-empty">
        <div className="text-center text-muted-foreground space-y-2">
          <Calendar className="h-12 w-12 mx-auto opacity-30" />
          <p>No active season.</p>
          <p className="text-sm">Use the <span className="text-foreground font-medium">New Season</span> button above to get started.</p>
        </div>
      </Card>
    );
  }

  const isCompleted = (currentSeason as any).status === 'completed';

  return (
    <div className="space-y-6" data-testid="season-dashboard">

      {/* Season Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-xl border border-primary/20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h2 className="text-2xl font-bold truncate">{currentSeason.name}</h2>
              <Badge variant={isCompleted ? 'secondary' : 'default'}>
                {isCompleted ? 'Completed' : 'Active'}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">{formatSeasonDateRange(currentSeason)}</p>

            {/* Season progress bar */}
            {(currentSeason.numberOfGames || 0) > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Game {seasonStats.totalTournaments} of {currentSeason.numberOfGames}</span>
                  <span>{seasonStats.gamesRemaining} remaining</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${seasonStats.progressPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Season actions */}
          <div className="flex gap-2 flex-shrink-0 flex-wrap">
            {!isCompleted && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-orange-500 border-orange-500/30">
                    <Archive className="h-4 w-4 mr-1" />
                    End Season
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>End "{currentSeason.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will mark the season as completed. All results will be preserved.
                      You can create a new season afterwards.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleEndSeason}>
                      End Season
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{seasonStats.totalPlayers}</div>
            <p className="text-xs text-muted-foreground mt-1">This season</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tournaments</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{seasonStats.totalTournaments}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Players</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">{seasonStats.avgPlayersPerTournament}</div>
            <p className="text-xs text-muted-foreground mt-1">Per tournament</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prize Pool</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono">£{seasonStats.totalPrizePool}</div>
            <p className="text-xs text-muted-foreground mt-1">Distributed</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div>
        <div className="flex items-center mb-4">
          <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
          <h3 className="text-xl font-semibold">Top Performers</h3>
          <span className="ml-2 text-sm text-muted-foreground">({currentSeason.name})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topPerformers.map((player) => (
            <Card key={player.id} className={player.rank === 1 ? 'border-yellow-500/50' : ''}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mr-3 ${
                      player.rank === 1 ? 'bg-yellow-500 text-black' :
                      player.rank === 2 ? 'bg-gray-400 text-black' :
                      'bg-orange-600 text-white'
                    }`}>
                      {player.rank}
                    </div>
                    <div>
                      <p className="font-semibold text-lg">{player.name}</p>
                      <p className="text-sm text-muted-foreground">{player.tournamentResults.length} games</p>
                    </div>
                  </div>
                  {player.rank === 1 && <Trophy className="h-5 w-5 text-yellow-500" />}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t">
                  <div>
                    <p className="text-2xl font-bold font-mono">{player.seasonPoints}</p>
                    <p className="text-xs text-muted-foreground">Points</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">{player.wins}</p>
                    <p className="text-xs text-muted-foreground">Wins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">£{player.cashWon}</p>
                    <p className="text-xs text-muted-foreground">Earned</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {topPerformers.length === 0 && (
            <Card className="col-span-3">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium mb-1">No results yet for {currentSeason.name}</p>
                <p className="text-sm">Results recorded during this season will appear here.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* All Seasons Summary */}
      {seasons.length > 1 && (
        <div>
          <div className="flex items-center mb-4">
            <BarChart2 className="h-5 w-5 mr-2 text-primary" />
            <h3 className="text-xl font-semibold">All Seasons</h3>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {seasons.map(season => {
                  const seasonResults = leaguePlayers.flatMap(p =>
                    p.tournamentResults.filter(r => r.seasonId === String(season.id))
                  );
                  const uniqueTourneys = new Set(seasonResults.map(r => r.tournamentId)).size;
                  const isActive = (season as any).isActive || (season as any).status === 'active';
                  return (
                    <div key={season.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{season.name}</p>
                          <Badge variant={isActive ? 'default' : 'secondary'} className="text-xs">
                            {isActive ? 'Active' : 'Completed'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatSeasonDateRange(season)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold">{uniqueTourneys}</p>
                        <p className="text-xs text-muted-foreground">tournaments</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}