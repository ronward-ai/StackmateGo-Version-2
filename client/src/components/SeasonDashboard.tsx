import { useMemo, useState } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Activity,
  Plus,
  CheckCircle,
  Archive,
  BarChart2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function SeasonDashboard() {
  const { league, leaguePlayers } = useLeague();
  const { currentSeason, seasons, formatSeasonDateRange, addSeason, updateSeason, deleteSeason } = useSeasons({ leagueId: league?.id });

  const [showNewSeasonDialog, setShowNewSeasonDialog] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonStart, setNewSeasonStart] = useState(() => new Date().toISOString().split('T')[0]);
  const [newSeasonEnd, setNewSeasonEnd] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });
  const [newSeasonGames, setNewSeasonGames] = useState(12);
  const [isCreating, setIsCreating] = useState(false);

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

  // Recent tournaments derived from filtered results
  const recentTournaments = useMemo(() => {
    const tournamentMap = new Map<string | number, {
      id: string | number;
      date: string;
      playerCount: number;
      winner: string;
      prizePool: number;
    }>();

    currentSeasonPlayers.forEach(player => {
      player.tournamentResults.forEach(result => {
        if (!result.tournamentId) return;
        if (!tournamentMap.has(result.tournamentId)) {
          tournamentMap.set(result.tournamentId, {
            id: result.tournamentId,
            date: result.date,
            playerCount: 0,
            winner: '',
            prizePool: 0
          });
        }
        const tournament = tournamentMap.get(result.tournamentId)!;
        tournament.playerCount++;
        tournament.prizePool += result.cashWon || 0;
        if (result.position === 1) tournament.winner = player.name;
      });
    });

    return Array.from(tournamentMap.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [currentSeasonPlayers]);

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

  // Recent activity feed
  const recentActivity = useMemo(() => {
    const activities: Array<{
      id: string;
      type: 'win' | 'podium';
      playerName: string;
      description: string;
      date: string;
    }> = [];

    currentSeasonPlayers.forEach(player => {
      player.tournamentResults.forEach(result => {
        if (result.position === 1) {
          activities.push({
            id: `${player.id}-${result.tournamentId}`,
            type: 'win',
            playerName: player.name,
            description: 'won a tournament',
            date: result.date
          });
        } else if (result.position <= 3) {
          activities.push({
            id: `${player.id}-${result.tournamentId}`,
            type: 'podium',
            playerName: player.name,
            description: `finished ${result.position === 2 ? '2nd' : '3rd'}`,
            date: result.date
          });
        }
      });
    });

    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [currentSeasonPlayers]);

  const handleCreateSeason = async () => {
    if (!newSeasonName.trim()) return;
    setIsCreating(true);
    try {
      await addSeason({
        name: newSeasonName.trim(),
        startDate: new Date(newSeasonStart).toISOString(),
        endDate: new Date(newSeasonEnd).toISOString(),
        numberOfGames: newSeasonGames
      });
      setShowNewSeasonDialog(false);
      setNewSeasonName('');
    } catch (e) {
      console.error('Failed to create season:', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleEndSeason = async () => {
    if (!currentSeason) return;
    await updateSeason(currentSeason.id, { status: 'completed' });
  };

  if (!currentSeason) {
    return (
      <Card className="p-8" data-testid="season-dashboard-empty">
        <div className="text-center text-muted-foreground space-y-4">
          <Calendar className="h-12 w-12 mx-auto opacity-30" />
          <p>No active season. Create one to start tracking.</p>
          <Button onClick={() => setShowNewSeasonDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create First Season
          </Button>
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
            <Dialog open={showNewSeasonDialog} onOpenChange={setShowNewSeasonDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  New Season
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Season</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Season Name</Label>
                    <Input
                      value={newSeasonName}
                      onChange={e => setNewSeasonName(e.target.value)}
                      placeholder="e.g. Summer 2026"
                      autoFocus
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={newSeasonStart}
                        onChange={e => setNewSeasonStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={newSeasonEnd}
                        onChange={e => setNewSeasonEnd(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Games</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={newSeasonGames}
                      onChange={e => setNewSeasonGames(parseInt(e.target.value) || 12)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setShowNewSeasonDialog(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateSeason}
                      disabled={!newSeasonName.trim() || isCreating}
                    >
                      {isCreating ? 'Creating...' : 'Create Season'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

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

      {/* Recent Tournaments */}
      <div>
        <div className="flex items-center mb-4">
          <Target className="h-5 w-5 mr-2 text-primary" />
          <h3 className="text-xl font-semibold">Recent Tournaments</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            {recentTournaments.length > 0 ? (
              <div className="divide-y">
                {recentTournaments.map((tournament) => (
                  <div key={tournament.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">
                            {new Date(tournament.date).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {tournament.playerCount} players
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Winner: <span className="text-foreground font-medium">{tournament.winner || 'Unknown'}</span>
                        </p>
                      </div>
                      {tournament.prizePool > 0 && (
                        <div className="text-right">
                          <p className="font-mono font-bold text-lg">£{tournament.prizePool}</p>
                          <p className="text-xs text-muted-foreground">Prize Pool</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No tournaments recorded for {currentSeason.name} yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Feed */}
      <div>
        <div className="flex items-center mb-4">
          <Activity className="h-5 w-5 mr-2 text-primary" />
          <h3 className="text-xl font-semibold">Recent Activity</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            {recentActivity.length > 0 ? (
              <div className="divide-y">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      activity.type === 'win' ? 'bg-yellow-500/20' : 'bg-primary/20'
                    }`}>
                      {activity.type === 'win'
                        ? <Trophy className="h-4 w-4 text-yellow-500" />
                        : <Award className="h-4 w-4 text-primary" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-medium">{activity.playerName}</span>{' '}
                        {activity.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No activity for {currentSeason.name} yet</p>
              </div>
            )}
          </CardContent>
        </Card>
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