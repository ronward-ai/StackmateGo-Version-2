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
  BarChart2,
  History
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function StandingsTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  const gridTemplate = `auto 1fr ${columns.map(() => 'auto').join(' ')}`;
  return (
    <Card>
      <CardContent className="p-0">
        <div
          className="grid items-center px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide border-b gap-x-4"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span>#</span>
          <span>Player</span>
          {columns.map(key => (
            <span key={key} className="text-right">{STAT_DEFS[key].label}</span>
          ))}
        </div>
        <div className="divide-y">
          {rows.map((player, i) => (
            <div
              key={player.name}
              className="grid items-center px-4 py-3 gap-x-4"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <span className={`text-sm font-bold w-6 text-center ${i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                {i + 1}
              </span>
              <span className="font-medium truncate">{player.name}</span>
              {columns.map(key => (
                <span key={key} className="font-mono text-right text-sm text-muted-foreground">
                  {STAT_DEFS[key].fmt(player)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Stat column definitions — label + value extractor
const STAT_DEFS: Record<string, { label: string; fmt: (p: any) => string | number }> = {
  points:                { label: 'Pts',        fmt: p => p.points },
  games:                 { label: 'Played',     fmt: p => p.tournaments },
  averagePoints:         { label: 'Avg Pts',    fmt: p => p.averagePoints },
  firstPlaceFinishes:    { label: '1st',        fmt: p => p.wins },
  secondPlaceFinishes:   { label: '2nd',        fmt: p => p.secondPlaces },
  thirdPlaceFinishes:    { label: '3rd',        fmt: p => p.thirdPlaces },
  cashWinnings:          { label: 'Prize',      fmt: p => p.prize > 0 ? `£${p.prize}` : '—' },
  averagePosition:       { label: 'Avg Pos',    fmt: p => p.averagePosition ?? '—' },
  finalTableAppearances: { label: 'Finals',     fmt: p => p.finalTables },
  hits:                  { label: 'Hits',       fmt: p => p.hits },
  rebuys:                { label: 'Rebuys',     fmt: p => p.rebuys },
  reEntries:             { label: 'Re-entries', fmt: p => p.reEntries },
  addOns:                { label: 'Add-ons',    fmt: p => p.addOns },
  winRate:               { label: 'Win %',      fmt: p => `${p.winRate}%` },
  bestFinish:            { label: 'Best',       fmt: p => p.bestFinish ?? '—' },
  worstFinish:           { label: 'Worst',      fmt: p => p.worstFinish ?? '—' },
  itmPercentage:         { label: 'ITM %',      fmt: p => `${p.itmPercentage}%` },
  biggestWin:            { label: 'Best Win',   fmt: p => p.biggestWin > 0 ? `£${p.biggestWin}` : '—' },
  attendancePercent:     { label: 'Attend %',   fmt: p => p.attendancePercent != null ? `${p.attendancePercent}%` : '—' },
  bountiesWon:           { label: 'Bounties',   fmt: p => p.bountiesWon },
  totalInvested:         { label: 'Invested',   fmt: p => p.totalInvested > 0 ? `£${p.totalInvested}` : '—' },
  profit:                { label: 'Profit',     fmt: p => p.profit !== 0 ? `£${p.profit}` : '—' },
  roi:                   { label: 'ROI %',      fmt: p => p.totalInvested > 0 ? `${p.roi}%` : '—' },
};

function computeStats(results: any[], seasonTotalGames = 0) {
  const tournaments = new Set(results.map(r => r.tournamentId)).size;
  const wins = results.filter(r => r.position === 1).length;
  const points = results.reduce((sum, r) => sum + (r.points || 0), 0);
  const prize = results.reduce((sum, r) => sum + (r.cashWon ?? r.prizeMoney ?? 0), 0);
  const secondPlaces = results.filter(r => r.position === 2).length;
  const thirdPlaces = results.filter(r => r.position === 3).length;
  const finalTables = results.filter(r => r.position && r.position <= 6).length;
  const hits = results.reduce((sum, r) => sum + ((r as any).knockouts || 0), 0);
  const rebuys = results.reduce((sum, r) => sum + ((r as any).rebuys || 0), 0);
  const reEntries = results.reduce((sum, r) => sum + ((r as any).reEntries || 0), 0);
  const addOns = results.reduce((sum, r) => sum + ((r as any).addons || 0), 0);
  const bountiesWon = results.reduce((sum, r) => sum + ((r as any).bountiesWon || (r as any).bounties || 0), 0);
  const posResults = results.filter(r => r.position);
  const averagePosition = posResults.length > 0
    ? Math.round((posResults.reduce((s, r) => s + r.position, 0) / posResults.length) * 10) / 10
    : null;
  const averagePoints = tournaments > 0 ? Math.round((points / tournaments) * 10) / 10 : 0;
  const positions = posResults.map(r => r.position);
  const bestFinish = positions.length > 0 ? Math.min(...positions) : null;
  const worstFinish = positions.length > 0 ? Math.max(...positions) : null;
  const winRate = tournaments > 0 ? Math.round((wins / tournaments) * 100) : 0;
  const itmCount = results.filter(r => (r.cashWon ?? r.prizeMoney ?? 0) > 0).length;
  const itmPercentage = tournaments > 0 ? Math.round((itmCount / tournaments) * 100) : 0;
  const attendancePercent = seasonTotalGames > 0 ? Math.round((tournaments / seasonTotalGames) * 100) : null;
  const biggestWin = results.length > 0 ? Math.max(...results.map(r => r.cashWon ?? r.prizeMoney ?? 0)) : 0;
  const totalInvested = results.reduce((sum, r) => {
    const buyIn = r.buyIn || (r as any).buyInAmount || 0;
    const rebuyAmt = ((r as any).rebuys || 0) * ((r as any).rebuyAmount || buyIn);
    const addonAmt = ((r as any).addons || 0) * ((r as any).addonAmount || buyIn);
    return sum + buyIn + rebuyAmt + addonAmt;
  }, 0);
  const profit = prize - totalInvested;
  const roi = totalInvested > 0 ? Math.round((profit / totalInvested) * 100 * 10) / 10 : 0;
  return {
    tournaments, wins, points, prize, secondPlaces, thirdPlaces, finalTables,
    hits, rebuys, reEntries, addOns, bountiesWon, averagePosition, averagePoints,
    bestFinish, worstFinish, winRate, itmPercentage, attendancePercent, biggestWin,
    totalInvested, profit, roi,
  };
}

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
