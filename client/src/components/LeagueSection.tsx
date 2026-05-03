import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, LayoutDashboard, Target, Calendar, CalendarIcon, Plus, Trophy, Trash2 } from 'lucide-react';
import RealTimeLeagueTable from '@/components/RealTimeLeagueTable';
import SeasonDashboard from '@/components/SeasonDashboard';
import LeagueTournaments from '@/components/LeagueTournaments';
import { LeagueSettingsContent } from '@/components/LeagueSettingsContent';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { useSubscription } from '@/hooks/useSubscription';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';

interface LeagueSectionProps {
  tournament?: any;
}

export default function LeagueSection({ tournament }: LeagueSectionProps) {
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [leagueView, setLeagueView] = useState<'overview' | 'settings'>('overview');
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonGames, setNewSeasonGames] = useState(12);
  const [showNewLeague, setShowNewLeague] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [isCreatingLeague, setIsCreatingLeague] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const from = new Date();
    const to = new Date();
    to.setMonth(to.getMonth() + 3);
    return { from, to };
  });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteSeason, setShowDeleteSeason] = useState(false);
  const [showDeleteLeague, setShowDeleteLeague] = useState(false);
  const [isDeletingSeason, setIsDeletingSeason] = useState(false);
  const [isDeletingLeague, setIsDeletingLeague] = useState(false);
  const [deleteLeagueConfirm, setDeleteLeagueConfirm] = useState('');

  const { league, userLeagues, switchLeague, createLeague, deleteLeague, setActiveSeasonId, leaguePlayers } = useLeague();
  const { seasons, currentSeason, addSeason, updateSeason, deleteSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });
  const { isPro } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeHint, setUpgradeHint] = useState('');

  useEffect(() => {
    if (currentSeason?.id) {
      setActiveSeasonId(String(currentSeason.id));
      // Keep seasonId in tournament settings so handover restores the right season
      if (tournament?.updateSettings) {
        tournament.updateSettings({ seasonId: String(currentSeason.id) });
      }
    }
  }, [currentSeason?.id, setActiveSeasonId]);

  const isSeasonTournament =
    tournament?.state?.details?.type === 'season' ||
    (tournament?.state?.settings as any)?.isSeasonTournament === true;

  const handleSeasonChange = async (seasonId: string) => {
    setActiveSeasonId(seasonId);
    tournament?.updateSettings?.({ seasonId });
    await updateSeason(seasonId, { status: 'active' });
    for (const season of seasons) {
      if (String(season.id) !== seasonId) {
        await updateSeason(season.id, { status: 'draft' });
      }
    }
  };

  const handleSwitchToLeague = () => {
    tournament?.updateTournamentDetails?.({
      ...tournament?.state?.details,
      type: 'season',
    });
    // Persist leagueId, seasonId + flag into tournament settings so any director
    // on any device can restore the full league/season context via handover.
    if (league?.id) {
      tournament?.updateSettings?.({
        isSeasonTournament: true,
        leagueId: String(league.id),
        seasonId: currentSeason?.id ? String(currentSeason.id) : undefined,
      });
    }
  };

  const handleCreateSeason = async () => {
    if (!newSeasonName.trim() || !dateRange?.from || !dateRange?.to) return;
    setIsCreating(true);
    try {
      const newSeason = await addSeason({
        name: newSeasonName.trim(),
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
        numberOfGames: newSeasonGames,
      });
      // Auto-activate the new season and demote all others
      if (newSeason?.id && newSeason.id !== 'default-season') {
        for (const season of seasons) {
          await updateSeason(season.id, { status: 'draft' });
        }
        await updateSeason(newSeason.id, { status: 'active' });
        setActiveSeasonId(String(newSeason.id));
      }
      setShowNewSeason(false);
      setNewSeasonName('');
      setNewSeasonGames(12);
      const from = new Date();
      const to = new Date();
      to.setMonth(to.getMonth() + 3);
      setDateRange({ from, to });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateLeague = async () => {
    if (!newLeagueName.trim()) return;
    setIsCreatingLeague(true);
    try {
      await createLeague(newLeagueName.trim());
      setShowNewLeague(false);
      setNewLeagueName('');
    } finally {
      setIsCreatingLeague(false);
    }
  };

  const handleDeleteSeason = async () => {
    if (!currentSeason?.id) return;
    setIsDeletingSeason(true);
    try {
      await deleteSeason(currentSeason.id);
      setShowDeleteSeason(false);
    } finally {
      setIsDeletingSeason(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (!league?.id || league.id === 'pending') return;
    setIsDeletingLeague(true);
    try {
      await deleteLeague(league.id);
      setShowDeleteLeague(false);
      setDeleteLeagueConfirm('');
    } finally {
      setIsDeletingLeague(false);
    }
  };

  const gamesPlayed = useMemo(() => {
    if (!currentSeason) return 0;
    const ids = new Set<string>();
    leaguePlayers.forEach((player: any) => {
      (player.tournamentResults || [])
        .filter((r: any) => r.seasonId === String(currentSeason.id))
        .forEach((r: any) => { if (r.tournamentId) ids.add(String(r.tournamentId)); });
    });
    return ids.size;
  }, [currentSeason?.id, leaguePlayers]);
  const totalGames = currentSeason?.numberOfGames || 12;

  const statusColor: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    draft:  'bg-gray-500/20 text-gray-400 border-gray-500/30',
    completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    archived: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="space-y-4" data-testid="league-section">

      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} featureHint={upgradeHint} />

      {/* New Season dialog */}
      <Dialog open={showNewSeason} onOpenChange={setShowNewSeason}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Season</DialogTitle>
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
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Popover open={rangeOpen} onOpenChange={setRangeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "d MMM yyyy")}
                          {" → "}
                          {format(dateRange.to, "d MMM yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "d MMM yyyy")
                      )
                    ) : (
                      <span>Pick start → end</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      if (range?.from && range?.to) setRangeOpen(false);
                    }}
                    numberOfMonths={2}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
              <Button variant="outline" onClick={() => setShowNewSeason(false)}>Cancel</Button>
              <Button
                onClick={handleCreateSeason}
                disabled={!newSeasonName.trim() || !dateRange?.from || !dateRange?.to || isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Season'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New League dialog */}
      <Dialog open={showNewLeague} onOpenChange={setShowNewLeague}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New League</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>League Name</Label>
              <Input
                value={newLeagueName}
                onChange={e => setNewLeagueName(e.target.value)}
                placeholder="e.g. Thursday Night Pub League"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleCreateLeague(); }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewLeague(false)}>Cancel</Button>
              <Button
                onClick={handleCreateLeague}
                disabled={!newLeagueName.trim() || isCreatingLeague}
              >
                {isCreatingLeague ? 'Creating...' : 'Create League'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Season confirmation */}
      <AlertDialog open={showDeleteSeason} onOpenChange={setShowDeleteSeason}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete season?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{currentSeason?.name}</strong> and all its tournament results will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteSeason}
              disabled={isDeletingSeason}
            >
              {isDeletingSeason ? 'Deleting...' : 'Delete Season'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete League confirmation */}
      <Dialog open={showDeleteLeague} onOpenChange={(open) => { setShowDeleteLeague(open); if (!open) setDeleteLeagueConfirm(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete league?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{league?.name}</strong> including all seasons, players, and tournament results. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-muted-foreground">Type <span className="font-mono font-semibold text-foreground">{league?.name}</span> to confirm:</p>
            <Input
              value={deleteLeagueConfirm}
              onChange={e => setDeleteLeagueConfirm(e.target.value)}
              placeholder={league?.name}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setShowDeleteLeague(false); setDeleteLeagueConfirm(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteLeagueConfirm !== league?.name || isDeletingLeague}
              onClick={handleDeleteLeague}
            >
              {isDeletingLeague ? 'Deleting...' : 'Delete League'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={leagueView} onValueChange={(v) => setLeagueView(v as 'overview' | 'settings')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview" variant="league">Overview</TabsTrigger>
          <TabsTrigger value="settings" variant="settings">Settings</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {!isSeasonTournament && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>League mode is off.</p>
              <p className="mt-1">Enable it via the <span className="text-foreground font-medium">Tournament Info</span> card above the tabs.</p>
            </div>
          )}

          {isSeasonTournament && (
            <>
              {/* League header — only when a real league exists */}
              {league.id !== 'pending' && (
                <Card className="rounded-xl border border-border/40">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Trophy className="h-4 w-4 text-yellow-400 flex-shrink-0" />
                        {userLeagues.length > 1 ? (
                          <Select
                            value={league?.id}
                            onValueChange={switchLeague}
                          >
                            <SelectTrigger className="border-0 p-0 h-auto bg-transparent font-semibold text-foreground focus:ring-0 w-auto min-w-0">
                              <SelectValue placeholder="Select league" />
                            </SelectTrigger>
                            <SelectContent>
                              {userLeagues.map((l: any) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="font-semibold text-foreground truncate">
                            {league.name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => { if (!isPro) { setUpgradeHint('Creating leagues'); setShowUpgrade(true); } else setShowNewLeague(true); }}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          New League
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => setShowDeleteLeague(true)}
                          title="Delete league"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Season header */}
              <Card className="rounded-xl border border-border/40">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                      {seasons.length > 1 ? (
                        <Select
                          value={currentSeason?.id?.toString()}
                          onValueChange={handleSeasonChange}
                        >
                          <SelectTrigger className="border-0 p-0 h-auto bg-transparent font-semibold text-foreground focus:ring-0 w-auto min-w-0">
                            <SelectValue placeholder="Select season" />
                          </SelectTrigger>
                          <SelectContent>
                            {seasons.map(season => (
                              <SelectItem key={season.id} value={season.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <span>{season.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatSeasonDateRange(season)}
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="font-semibold text-foreground truncate">
                          {currentSeason?.name || 'Season 1'}
                        </span>
                      )}
                      {(currentSeason as any)?.status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${statusColor[(currentSeason as any).status] || statusColor.draft}`}>
                          {(currentSeason as any).status.charAt(0).toUpperCase() + (currentSeason as any).status.slice(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {currentSeason && (
                        <span className="text-xs text-muted-foreground hidden sm:block mr-1">
                          {gamesPlayed}/{totalGames} games
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => { if (!isPro) { setUpgradeHint('Creating seasons'); setShowUpgrade(true); } else setShowNewSeason(true); }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        New Season
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setShowDeleteSeason(true)}
                        title="Delete season"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {currentSeason && (
                    <p className="text-xs text-muted-foreground mt-2 ml-7">
                      {formatSeasonDateRange(currentSeason)}
                      {' · '}
                      {gamesPlayed} of {totalGames} games played
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Live standings */}
              <RealTimeLeagueTable tournament={tournament} />

              {/* Season Analytics */}
              <Collapsible open={showAnalytics} onOpenChange={setShowAnalytics}>
                <Card className="rounded-xl">
                  <CollapsibleTrigger className="w-full" data-testid="button-toggle-analytics">
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-xl">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-semibold">Season Analytics</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showAnalytics ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <SeasonDashboard />
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {/* Tournament history */}
              <Collapsible open={showHistory} onOpenChange={setShowHistory}>
                <Card className="rounded-xl">
                  <CollapsibleTrigger className="w-full" data-testid="button-toggle-history">
                    <div className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors rounded-xl">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-purple-400" />
                        <span className="text-sm font-semibold">Tournament History</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showHistory ? 'rotate-180' : ''}`} />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4">
                      <LeagueTournaments />
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </>
          )}
        </TabsContent>

        {/* ── Settings tab ── */}
        <TabsContent value="settings" className="mt-4">
          <LeagueSettingsContent
            leagueId={league?.id && league.id !== 'pending' ? String(league.id) : null}
            leagueName={league?.id && league.id !== 'pending' ? league.name : null}
          />
        </TabsContent>
      </Tabs>

    </div>
  );
}
