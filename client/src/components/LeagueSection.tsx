import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, LayoutDashboard, Target, Calendar, Settings2 } from 'lucide-react';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import SeasonDashboard from '@/components/SeasonDashboard';
import LeagueTournaments from '@/components/LeagueTournaments';
import { LeagueSettingsContent } from '@/components/LeagueSettingsContent';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useState, useEffect } from 'react';

interface LeagueSectionProps {
  tournament?: any;
}

export default function LeagueSection({ tournament }: LeagueSectionProps) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { league, setActiveSeasonId } = useLeague();
  const { seasons, currentSeason, updateSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });

  // Update useLeague's active season when it changes
  useEffect(() => {
    if (currentSeason?.id) {
      setActiveSeasonId(String(currentSeason.id));
    }
  }, [currentSeason?.id, setActiveSeasonId]);

  const isSeasonTournament = 
    tournament?.isSeasonTournament === true || 
    tournament?.settings?.isSeasonTournament === true ||
    tournament?.state?.details?.type === 'season';

  const handleSeasonChange = async (seasonId: string) => {
    const numericId = parseInt(seasonId);
    if (!isNaN(numericId)) {
      await updateSeason(numericId, { status: 'active' });
      
      for (const season of seasons) {
        if (typeof season.id === 'number' && season.id !== numericId) {
          await updateSeason(season.id, { status: 'draft' });
        }
      }
    }
  };

  return (
    <div className="space-y-6" data-testid="league-section">
      {isSeasonTournament && (
        <>
          {seasons.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Season</CardTitle>
                  </div>
                  <Select 
                    value={currentSeason?.id?.toString()} 
                    onValueChange={handleSeasonChange}
                    data-testid="select-season"
                  >
                    <SelectTrigger className="w-full sm:w-[280px]">
                      <SelectValue placeholder="Select a season" />
                    </SelectTrigger>
                    <SelectContent>
                      {seasons.map((season) => (
                        <SelectItem 
                          key={season.id} 
                          value={season.id.toString()}
                          data-testid={`option-season-${season.id}`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{season.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatSeasonDateRange(season)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
            </Card>
          )}

          <RealTimeLeagueTable tournament={tournament} />

          <Collapsible open={showAnalytics} onOpenChange={setShowAnalytics}>
            <Card>
              <CollapsibleTrigger className="w-full" data-testid="button-toggle-analytics">
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-5 w-5 text-blue-500" />
                      <CardTitle>Season Analytics</CardTitle>
                    </div>
                    <ChevronDown className={`h-5 w-5 transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
                  </div>
                  <CardDescription className="text-left">
                    View comprehensive season statistics and performance metrics
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <SeasonDashboard />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <Collapsible open={showHistory} onOpenChange={setShowHistory}>
            <Card>
              <CollapsibleTrigger className="w-full" data-testid="button-toggle-history">
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-500" />
                      <CardTitle>Tournament History</CardTitle>
                    </div>
                    <ChevronDown className={`h-5 w-5 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                  </div>
                  <CardDescription className="text-left">
                    Browse past tournament results and player performance
                  </CardDescription>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <LeagueTournaments />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </>
      )}

      {!isSeasonTournament && (
        <Card className="bg-card rounded-xl shadow-lg overflow-hidden bg-gradient-to-r from-orange-600/10 to-amber-600/10 border border-orange-500/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-orange-500" />
              <CardTitle>League Mode</CardTitle>
            </div>
            <CardDescription>
              This tournament is not part of a league season. Configure your league settings below, then enable season mode to start tracking standings, analytics, and tournament history.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Collapsible open={showSettings} onOpenChange={setShowSettings}>
        <Card>
          <CollapsibleTrigger className="w-full" data-testid="button-toggle-league-settings">
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-orange-500" />
                  <CardTitle>League Settings</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
              </div>
              <CardDescription className="text-left">
                Configure points system, stats display, and season settings
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <LeagueSettingsContent />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
