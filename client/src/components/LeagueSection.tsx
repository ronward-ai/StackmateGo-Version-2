import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import SeasonDashboard from '@/components/SeasonDashboard';
import { LeagueSettingsDialog } from '@/components/LeagueSettingsDialog';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';

interface LeagueSectionProps {
  tournament?: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  readOnly?: boolean;
}

/**
 * The League tab.
 *
 * The header is read-only context — which league, which season, how far through.
 * Everything that CHANGES the league (switch season, create, end, delete,
 * points, stats, delete league) lives behind Manage League, in the tabbed
 * dialog.
 *
 * This replaced a single dense row holding two borderless dropdowns that
 * rendered as plain text — and that silently became plain `<span>`s when only
 * one league or season existed, so the affordance appeared and disappeared
 * depending on the data — separated by a breadcrumb chevron implying navigation
 * rather than selection, followed by a status pill and three unlabelled icon
 * buttons, one of which opened a menu titled "Season actions" that contained
 * Delete League.
 */
export default function LeagueSection({ tournament, readOnly = false }: LeagueSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showLeagueSettings, setShowLeagueSettings] = useState(false);

  const { league, leaguePlayers } = useLeague();
  const { currentSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });

  // Game number for the current season.
  // NOTE: this derivation is duplicated in TournamentInfoCard and PokerTimer and
  // the copies disagree about which season to count against. Consolidating them
  // into one tested helper is a separate, planned change.
  const gameNumber = useMemo(() => {
    if (!currentSeason?.id || !leaguePlayers) return 1;
    const ids = new Set<string>();
    leaguePlayers.forEach((player: any) => {
      (player.tournamentResults || [])
        .filter((r: any) => r.seasonId === String(currentSeason.id))
        .forEach((r: any) => { if (r.tournamentId) ids.add(String(r.tournamentId)); });
    });
    const localGameId = tournament?.state?.details?.localGameId;
    if (localGameId && ids.has(localGameId)) return ids.size;
    return ids.size + 1;
  }, [currentSeason?.id, leaguePlayers, tournament?.state?.details?.localGameId]);

  /** One line of context under the title: progress, then the date range. */
  const seasonSummary = useMemo(() => {
    if (!currentSeason) return 'No season yet';
    const parts: string[] = [];
    if (currentSeason.numberOfGames) {
      parts.push(`Game ${gameNumber} of ${currentSeason.numberOfGames}`);
    }
    const range = formatSeasonDateRange(currentSeason);
    if (range) parts.push(range);
    if ((currentSeason as any).status === 'completed') parts.push('Ended');
    return parts.join(' · ');
  }, [currentSeason, gameNumber, formatSeasonDateRange]);

  // Keep season info in tournament settings so it syncs to Firestore and the
  // participant view can show the season name and game number.
  useEffect(() => {
    if (!currentSeason?.id || !tournament?.updateSettings) return;
    tournament.updateSettings({
      seasonId: String(currentSeason.id),
      seasonName: currentSeason.name,
      numberOfGames: currentSeason.numberOfGames,
      gameNumber,
    });
  }, [currentSeason?.id, gameNumber]);

  return (
    <>
      <LeagueSettingsDialog open={showLeagueSettings} onOpenChange={setShowLeagueSettings} />

      <Card className="card-glass-purple rounded-xl">
        <CardContent className="p-5">

          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <Trophy className="h-4 w-4 text-orange-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-foreground truncate">
                  {league?.name || 'My League'}
                  <span className="text-muted-foreground font-normal">
                    {' — '}{currentSeason?.name || 'Season 1'}
                  </span>
                </h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1 ml-6 truncate">{seasonSummary}</p>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {!readOnly && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5"
                  onClick={() => setShowLeagueSettings(true)}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="text-xs">Manage League</span>
                </Button>
              )}
              <button
                onClick={() => setIsExpanded(v => !v)}
                className="p-1 text-muted-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {isExpanded && currentSeason && (
            <SeasonDashboard
              season={currentSeason}
              leaguePlayers={leaguePlayers}
              tournament={tournament}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
