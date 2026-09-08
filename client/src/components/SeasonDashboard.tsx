import { useMemo, useState } from 'react';
import { useSeasons } from '@/hooks/useSeasons';
import { useLeague } from '@/hooks/useLeague';
import EmptyState from '@/components/ui/empty-state';
import { countGamesPlayed, isSeasonComplete, clampedGameNumber, nextSeasonDates } from '@/lib/seasonProgress';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import { Badge } from "@/components/ui/badge";
import { Calendar, History } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { CheckCircle2 } from 'lucide-react';
import { useSeasonRollover } from '@/hooks/useSeasonRollover';
import { currencyOf, money } from '@/lib/currency';

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
  // The prize pool was hard-coded to £ while every other money figure in the app
  // honours settings.currency.
  const sym = currencyOf(tournament?.state?.settings);
  const leaguePlayers = leaguePlayersProp ?? leaguePlayersFromHook;

  const [selectedPastSeasonId, setSelectedPastSeasonId] = useState<string | null>(null);
  const {
    endCurrentSeason, startNextSeason, busy: rolloverBusy, error: rolloverError,
  } = useSeasonRollover(currentSeason);

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
    const uniqueTournaments = countGamesPlayed(currentSeason?.id, leaguePlayers);
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
      <div data-testid="season-dashboard-empty">
        <EmptyState
          icon={Calendar}
          title="No season yet"
        >
          A season groups games together so points, standings and game numbers
          add up across the weeks. Start one from <span className="text-foreground font-medium">Manage
          League &rarr; Seasons</span>.
        </EmptyState>
      </div>
    );
  }

  const isCompleted = (currentSeason as any).status === 'completed';

  return (
    <div className="space-y-6" data-testid="season-dashboard">

      {/* The season, said ONCE.
          LeagueSection used to describe it above — name, dates, "Game 4 of 13" —
          and this opened with all of it again in a tinted panel, followed by four
          Cards nested inside the League card for four figures. Five boxes before
          the standings, which is what the tab is opened for. The card is already
          the surface; a tint inside a tint is what made the Share tab muddy. */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-title font-bold truncate">{currentSeason.name}</h2>
          <Badge variant={isCompleted ? 'secondary' : 'default'}>
            {isCompleted ? 'Completed' : 'Active'}
          </Badge>
        </div>
        <p className="text-label text-muted-foreground mt-0.5">{formatSeasonDateRange(currentSeason)}</p>

        {(currentSeason.numberOfGames || 0) > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-caption text-muted-foreground mb-1.5">
              <span className="font-mono">
                Game {clampedGameNumber(seasonStats.totalTournaments, currentSeason)} of {currentSeason.numberOfGames}
              </span>
              <span>{seasonStats.gamesRemaining} remaining</span>
            </div>
            <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500"
                style={{ width: `${seasonStats.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Four figures, no boxes. Every number in the app is set in the mono
            face, and the labels take the caption step — the same treatment as
            the Payouts panel. */}
        <div className="flex flex-wrap gap-x-8 gap-y-4 mt-4 pt-4 border-t border-border/40">
          {[
            { label: 'Players', value: String(seasonStats.totalPlayers) },
            { label: 'Games', value: String(seasonStats.totalTournaments) },
            { label: 'Avg field', value: String(seasonStats.avgPlayersPerTournament) },
            { label: 'Prize pool', value: money(seasonStats.totalPrizePool, sym) },
          ].map(stat => (
            <div key={stat.label}>
              <div className="font-mono text-xl font-bold leading-tight">{stat.value}</div>
              <div className="text-caption text-muted-foreground uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Season complete. Advisory only — nothing ends a season automatically,
          because a cancelled week means "past the end date" is not the same as
          "finished". The director decides. */}
      {!isCompleted && isSeasonComplete(currentSeason, seasonStats.totalTournaments) && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
          <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-400">This season looks finished</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {seasonStats.totalTournaments >= (currentSeason.numberOfGames || 0)
                ? `All ${currentSeason.numberOfGames} games have been played.`
                : 'The season\u2019s end date has passed.'}
              {' '}Standings stay exactly as they are once you end it.
            </p>
            {rolloverError && <p className="text-xs text-destructive mt-1">{rolloverError}</p>}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" disabled={rolloverBusy} onClick={endCurrentSeason}>
              End Season
            </Button>
            <Button size="sm" disabled={rolloverBusy} onClick={startNextSeason}>
              {rolloverBusy ? 'Working\u2026' : 'Start Next Season'}
            </Button>
          </div>
        </div>
      )}

      {/* One standings table. Selecting a past season SWAPS what this table
          shows rather than appending a second table below the current one —
          two tables on screen made it ambiguous which was authoritative. */}
      {pastSeasons.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <History className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground">Viewing</span>
          <Select
            value={selectedPastSeasonId ?? 'current'}
            onValueChange={val => setSelectedPastSeasonId(val === 'current' ? null : val)}
          >
            <SelectTrigger className="w-auto min-w-[200px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">
                <span className="font-medium">{currentSeason.name}</span>
                <span className="ml-2 text-muted-foreground text-xs">current</span>
              </SelectItem>
              {pastSeasons.map(season => (
                <SelectItem key={season.id} value={String(season.id)}>
                  <span className="font-medium">{season.name}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{formatSeasonDateRange(season)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPastSeasonId && (
            <span className="text-xs text-amber-400">
              Past season — this is a view only, it does not change which season games count toward
            </span>
          )}
        </div>
      )}

      <RealTimeLeagueTable
        tournament={tournament}
        seasonIdOverride={selectedPastSeasonId}
      />

    </div>
  );
}
