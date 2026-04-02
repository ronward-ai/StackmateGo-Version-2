import { useMemo } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Users,
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  Award,
  Activity
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import SeasonTournaments from './SeasonTournaments';

export default function SeasonDashboard() {
  const { league, leaguePlayers } = useLeague();
  const { currentSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });

  // Get current season players
  const currentSeasonPlayers = useMemo(() =>
    leaguePlayers.filter(p => p.seasonId === currentSeason?.id),
    [leaguePlayers, currentSeason?.id]
  );

  // Calculate season statistics
  const seasonStats = useMemo(() => {
    const allResults = currentSeasonPlayers.flatMap(p => p.tournamentResults);
    const uniqueTournaments = new Set(allResults.map(r => r.tournamentId)).size;
    const totalPrizePool = allResults.reduce((sum, r) => sum + (r.cashWon || 0), 0);
    const avgPlayersPerTournament = allResults.length > 0 ? allResults.length / uniqueTournaments : 0;

    return {
      totalPlayers: currentSeasonPlayers.length,
      totalTournaments: uniqueTournaments,
      totalPrizePool,
      avgPlayersPerTournament: Math.round(avgPlayersPerTournament)
    };
  }, [currentSeasonPlayers]);

  // Get recent tournaments with results
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

        if (result.position === 1) {
          tournament.winner = player.name;
        }
      });
    });

    return Array.from(tournamentMap.values())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [currentSeasonPlayers]);

  // Get top performers
  const topPerformers = useMemo(() => {
    return [...currentSeasonPlayers]
      .sort((a, b) => {
        // Sort by points, then by games played
        if (b.totalPoints !== a.totalPoints) {
          return b.totalPoints - a.totalPoints;
        }
        return a.tournamentResults.length - b.tournamentResults.length;
      })
      .slice(0, 3)
      .map((player, index) => {
        const wins = player.tournamentResults.filter(r => r.position === 1).length;
        const cashWon = player.tournamentResults.reduce((sum, r) => sum + (r.cashWon || 0), 0);
        const avgPosition = player.tournamentResults.length > 0
          ? player.tournamentResults.reduce((sum, r) => sum + r.position, 0) / player.tournamentResults.length
          : 0;

        return {
          ...player,
          rank: index + 1,
          wins,
          cashWon,
          avgPosition: avgPosition.toFixed(1)
        };
      });
  }, [currentSeasonPlayers]);

  // Get recent activity (last 10 tournament results)
  const recentActivity = useMemo(() => {
    const activities: Array<{
      id: string;
      type: 'win' | 'podium' | 'tournament';
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
            description: `won a tournament`,
            date: result.date
          });
        } else if (result.position <= 3) {
          activities.push({
            id: `${player.id}-${result.tournamentId}`,
            type: 'podium',
            playerName: player.name,
            description: `finished ${result.position}${result.position === 2 ? 'nd' : 'rd'}`,
            date: result.date
          });
        }
      });
    });

    return activities
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [currentSeasonPlayers]);

  if (!currentSeason) {
    return (
      <Card className="p-8" data-testid="season-dashboard-empty">
        <div className="text-center text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p data-testid="text-no-season">No active season. Create a season to get started.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="season-dashboard">
      {/* Season Header */}
      <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-xl border border-primary/20" data-testid="season-header">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-2xl font-bold" data-testid="text-season-name">{currentSeason.name}</h2>
          <Badge variant="default" data-testid="badge-season-status">Active</Badge>
        </div>
        <p className="text-muted-foreground" data-testid="text-season-dates">{formatSeasonDateRange(currentSeason)}</p>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-overview">
        <Card data-testid="card-total-players">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Players</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono" data-testid="stat-total-players">{seasonStats.totalPlayers}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered this season</p>
          </CardContent>
        </Card>

        <Card data-testid="card-total-tournaments">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tournaments</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono" data-testid="stat-total-tournaments">{seasonStats.totalTournaments}</div>
            <p className="text-xs text-muted-foreground mt-1">Completed so far</p>
          </CardContent>
        </Card>

        <Card data-testid="card-avg-players">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Players</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono" data-testid="stat-avg-players">{seasonStats.avgPlayersPerTournament}</div>
            <p className="text-xs text-muted-foreground mt-1">Per tournament</p>
          </CardContent>
        </Card>

        <Card data-testid="card-prize-pool">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Prize Pool</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold font-mono" data-testid="stat-prize-pool">£{seasonStats.totalPrizePool}</div>
            <p className="text-xs text-muted-foreground mt-1">Total distributed</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div data-testid="top-performers-section">
        <div className="flex items-center mb-4">
          <Trophy className="h-5 w-5 mr-2 text-yellow-500" />
          <h3 className="text-xl font-semibold">Top Performers</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topPerformers.map((player) => (
            <Card key={player.id} className={player.rank === 1 ? 'border-yellow-500/50' : ''} data-testid={`card-top-performer-${player.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold mr-3 ${
                      player.rank === 1 ? 'bg-yellow-500 text-black' :
                      player.rank === 2 ? 'bg-gray-400 text-black' :
                      'bg-orange-600 text-white'
                    }`} data-testid={`badge-player-rank-${player.id}`}>
                      {player.rank}
                    </div>
                    <div>
                      <p className="font-semibold text-lg" data-testid={`text-player-name-${player.id}`}>{player.name}</p>
                      <p className="text-sm text-muted-foreground" data-testid={`text-player-tournaments-${player.id}`}>{player.tournamentResults.length} tournaments</p>
                    </div>
                  </div>
                  {player.rank === 1 && <Trophy className="h-5 w-5 text-yellow-500" />}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t">
                  <div>
                    <p className="text-2xl font-bold font-mono" data-testid={`stat-player-points-${player.id}`}>{player.totalPoints}</p>
                    <p className="text-xs text-muted-foreground">Points</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono" data-testid={`stat-player-wins-${player.id}`}>{player.wins}</p>
                    <p className="text-xs text-muted-foreground">Wins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono" data-testid={`stat-player-earnings-${player.id}`}>£{player.cashWon}</p>
                    <p className="text-xs text-muted-foreground">Earned</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {topPerformers.length === 0 && (
            <Card className="col-span-3" data-testid="card-no-performers">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p data-testid="text-no-performers">No player data yet. Start recording tournament results!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Recent Tournaments */}
      <div data-testid="recent-tournaments-section">
        <div className="flex items-center mb-4">
          <Target className="h-5 w-5 mr-2 text-primary" />
          <h3 className="text-xl font-semibold">Recent Tournaments</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            {recentTournaments.length > 0 ? (
              <div className="divide-y">
                {recentTournaments.map((tournament) => (
                  <div key={tournament.id} className="p-4 hover:bg-muted/30 transition-colors" data-testid={`tournament-item-${tournament.id}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium" data-testid={`text-tournament-date-${tournament.id}`}>{new Date(tournament.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}</p>
                          <Badge variant="outline" className="text-xs" data-testid={`badge-tournament-players-${tournament.id}`}>
                            {tournament.playerCount} players
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Winner: <span className="text-foreground font-medium" data-testid={`text-tournament-winner-${tournament.id}`}>{tournament.winner || 'Unknown'}</span>
                        </p>
                      </div>
                      {tournament.prizePool > 0 && (
                        <div className="text-right">
                          <p className="font-mono font-bold text-lg" data-testid={`text-tournament-prizepool-${tournament.id}`}>£{tournament.prizePool}</p>
                          <p className="text-xs text-muted-foreground">Prize Pool</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="no-tournaments-message">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p data-testid="text-no-tournaments">No tournaments recorded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Season Tournaments */}
      <SeasonTournaments />

      {/* Recent Activity Feed */}
      <div data-testid="recent-activity-section">
        <div className="flex items-center mb-4">
          <Activity className="h-5 w-5 mr-2 text-primary" />
          <h3 className="text-xl font-semibold">Recent Activity</h3>
        </div>
        <Card>
          <CardContent className="p-0">
            {recentActivity.length > 0 ? (
              <div className="divide-y">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors" data-testid={`activity-item-${activity.id}`}>
                    <div className="flex items-center gap-3">
                      {activity.type === 'win' ? (
                        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                          <Trophy className="h-4 w-4 text-yellow-500" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                          <Award className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm" data-testid={`text-activity-description-${activity.id}`}>
                          <span className="font-medium">{activity.playerName}</span> {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-activity-date-${activity.id}`}>
                          {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="no-activity-message">
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p data-testid="text-no-activity">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}