import { useMemo, useState } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Target,
  TrendingUp,
  Calendar,
  DollarSign,
  History
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Note: a local StandingsTable, a STAT_DEFS label/format map and a computeStats
// helper used to live here. All three were defined but never called — the only
// standings actually rendered come from RealTimeLeagueTable. Removed along with
// the other dead league components; RealTimeLeagueTable is now the single
// standings renderer in the app.

interface SeasonDashboardProps {
  tournament?: any;
  /** Season to display. When omitted, falls back to the hook's active season. */
  season?: any;
  /** League players to display. When omitted, falls back to the hook's list. */
  leaguePlayers?: any[];
}

export default function SeasonDashboard({
  tournament,
  season,
  leaguePlayers: leaguePlayersProp,
}: SeasonDashboardProps) {
  const { league, leaguePlayers: leaguePlayersFromHook } = useLeague();
  const {
    currentSeason: currentSeasonFromHook,
    seasons,
    formatSeasonDateRange,
  } = useSeasons({ leagueId: league?.id });

  // Prefer what the parent passed so this dashboard can never disagree with the
  // season shown in the League header. The hook values are a fallback for when
  // the component is rendered without props.
  const currentSeason = season ?? currentSeasonFromHook;
  const leaguePlayers = leaguePlayersProp ?? leaguePlayersFromHook;

  const [selectedPastSeasonId, setSelectedPastSeasonId] = useState<string | null>(null);

  const pastSeasons = useMemo(
    () => seasons.filter(s => String(s.id) !== String(currentSeason?.id)),
    [seasons, currentSeason?.id]
  );

  const currentSeasonPlayers = useMemo(() => {
    if (!currentSeason) return [];
    return leaguePlayers
      .map(player => ({
        ...player,
        tournamentResults: player.tournamentResults.filter(
          r => String(r.seasonId) === String(currentSeason.id)
        )
      }))
      .filter(player => player.tournamentResults.length > 0);
  }, [leaguePlayers, currentSeason?.id]);

  const seasonStats = useMemo(() => {
    const allResults = currentSeasonPlayers.flatMap(p => p.tournamentResults);
    const uniqueTournaments = new Set(allResults.map(r => r.tournamentId)).size;
    const totalPrizePool = allResults.reduce((sum, r) => sum + (r.cashWon ?? r.prizeMoney ?? 0), 0);
    const avgPlayersPerTournament = uniqueTournaments > 0
      ? Math.round(allResults.length / uniqueTournaments)
      : 0;
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
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h2 className="text-2xl font-bold truncate">{currentSeason.name}</h2>
          <Badge variant={isCompleted ? 'secondary' : 'default'}>
            {isCompleted ? 'Completed' : 'Active'}
          </Badge>
        </div>
        <p className="text-muted-foreground text-sm">{formatSeasonDateRange(currentSeason)}</p>
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

      {/* Current Season Standings */}
      <RealTimeLeagueTable tournament={tournament} />

      {/* Previous Seasons */}
      {pastSeasons.length > 0 && (
        <div>
          <div className="flex items-center mb-4">
            <History className="h-5 w-5 mr-2 text-primary" />
            <h3 className="text-xl font-semibold">Previous Seasons</h3>
          </div>
          <Select
            value={selectedPastSeasonId ?? ''}
            onValueChange={val => setSelectedPastSeasonId(val || null)}
          >
            <SelectTrigger className="w-full mb-4">
              <SelectValue placeholder="Select a season to view standings" />
            </SelectTrigger>
            <SelectContent>
              {pastSeasons.map(season => (
                <SelectItem key={season.id} value={String(season.id)}>
                  <span className="font-medium">{season.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{formatSeasonDateRange(season)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPastSeasonId && (
            <RealTimeLeagueTable tournament={tournament} seasonIdOverride={selectedPastSeasonId} />
          )}
        </div>
      )}
    </div>
  );
}
