import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trophy, Users, Calendar, ChevronDown, ChevronUp, Plus, Trash2, RefreshCw } from 'lucide-react';
import { cn } from "@/lib/utils";
import SeasonDashboard from '@/components/SeasonDashboard';
import { useSubscription } from '@/hooks/useSubscription';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';

interface LeagueSectionProps {
  tournament?: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  readOnly?: boolean;
}

const statusColor: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  draft:  'bg-gray-500/20 text-gray-400 border-gray-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  archived: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function LeagueSection({ tournament, readOnly = false }: LeagueSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonGames, setNewSeasonGames] = useState<number | ''>(12);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteLeague, setShowDeleteLeague] = useState(false);
  const [isDeletingSeason, setIsDeletingSeason] = useState(false);
  const [isDeletingLeague, setIsDeletingLeague] = useState(false);
  const [deleteLeagueConfirm, setDeleteLeagueConfirm] = useState('');

  const { league, userLeagues, switchLeague, createLeague, deleteLeague, setActiveSeasonId, leaguePlayers } = useLeague();
  const { seasons, currentSeason, addSeason, updateSeason, deleteSeason, formatSeasonDateRange } = useSeasons({ leagueId: league?.id });
  const { isPro } = useSubscription();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeHint, setUpgradeHint] = useState('');

  // Compute current game number — same logic as TournamentInfoCard
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

  useEffect(() => {
    if (currentSeason?.id) {
      setActiveSeasonId(String(currentSeason.id));
      // Keep season info in tournament settings so it syncs to Firestore and
      // the participant view can display season name and game number.
      if (tournament?.updateSettings) {
        tournament.updateSettings({
          seasonId: String(currentSeason.id),
          seasonName: currentSeason.name,
          numberOfGames: currentSeason.numberOfGames,
          gameNumber,
        });
      }
    }
  }, [currentSeason?.id, setActiveSeasonId]);

  // Keep gameNumber in sync as league results are recorded during the game
  useEffect(() => {
    if (tournament?.updateSettings && currentSeason?.id) {
      tournament.updateSettings({ gameNumber });
    }
  }, [gameNumber]);

  const isSeasonTournament =
    tournament?.state?.details?.type === 'season' ||
    (tournament?.state?.settings as any)?.isSeasonTournament === true;

  const handleSeasonChange = async (seasonId: string) => {
    const selected = seasons.find(s => String(s.id) === seasonId);
    setActiveSeasonId(seasonId);
    tournament?.updateSettings?.({
      seasonId,
      seasonName: selected?.name,
      numberOfGames: selected?.numberOfGames,
    });
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
        seasonName: currentSeason?.name,
        numberOfGames: currentSeason?.numberOfGames,
        gameNumber,
      });
    }
  };

  const handleCreateSeason = async () => {
    if (!newSeasonName.trim() || !dateRange?.from || !dateRange?.to) return;
    try {
      const newSeason = await addSeason({
        name: newSeasonName.trim(),
        startDate: dateRange.from.toISOString().split('T')[0],
        endDate: dateRange.to.toISOString().split('T')[0],
        numberOfGames: typeof newSeasonGames === 'number' ? newSeasonGames : 12,
        status: 'active',
      });
      if (newSeason?.id && newSeason.id !== 'default-season') {
        setActiveSeasonId(String(newSeason.id));
        tournament?.updateSettings?.({
          seasonId: String(newSeason.id),
          seasonName: newSeason.name,
          numberOfGames: newSeason.numberOfGames || 12,
        });
      }
      setShowNewSeason(false);
      setNewSeasonName('');
      setNewSeasonGames(12);
      setDateRange(undefined);
    } catch (err) {
      console.error('Failed to create season:', err);
    }
  };

  const handleDeleteSeason = async () => {
    if (!currentSeason || currentSeason.id === 'default-season') return;
    setIsDeletingSeason(true);
    try {
      await deleteSeason(currentSeason.id);
    } catch (err) {
      console.error('Failed to delete season:', err);
    } finally {
      setIsDeletingSeason(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (!league?.id || deleteLeagueConfirm !== league?.name) return;
    setIsDeletingLeague(true);
    try {
      await deleteLeague(String(league.id));
    } catch (err) {
      console.error('Failed to delete league:', err);
    } finally {
      setIsDeletingLeague(false);
      setShowDeleteLeague(false);
      setDeleteLeagueConfirm('');
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
    <>
      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowUpgrade(false)}>
          <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-4 text-center space-y-3">
            <Trophy className="h-8 w-8 text-orange-400 mx-auto" />
            <h3 className="font-bold text-lg">Pro Feature</h3>
            <p className="text-sm text-muted-foreground">{upgradeHint} requires a Pro subscription.</p>
            <Button className="w-full" onClick={() => setShowUpgrade(false)}>OK</Button>
          </div>
        </div>
      )}

      <Card className="card-glass-purple rounded-xl">
        <CardContent className="p-5">

          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-orange-400" />
              <span className="text-sm font-semibold text-foreground uppercase tracking-wide">League</span>
            </div>
            <div className="flex items-center gap-2">
              {userLeagues.length > 1 && (
                <Select
                  value={league?.id?.toString()}
                  onValueChange={id => switchLeague(id)}
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
              )}
              {userLeagues.length <= 1 && (
                <span className="text-sm font-semibold text-foreground">{league?.name || 'My League'}</span>
              )}
              <button onClick={() => setIsExpanded(v => !v)}>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          {isExpanded && (
            <div className="space-y-4">

              {/* League mode toggle */}
              {!readOnly && !isSeasonTournament && (
                <div className="flex items-center justify-between p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-orange-400">Enable League Mode</p>
                    <p className="text-xs text-muted-foreground">Track results across multiple games</p>
                  </div>
                  <Button size="sm" onClick={handleSwitchToLeague} className="bg-orange-500 hover:bg-orange-600 text-white">
                    Enable
                  </Button>
                </div>
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
                        onClick={() => setShowDeleteConfirm(true)}
                        title="Delete season"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* New season form */}
                  {showNewSeason && (
                    <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Season Name</Label>
                        <Input
                          value={newSeasonName}
                          onChange={e => setNewSeasonName(e.target.value)}
                          placeholder="e.g. Season 2"
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Number of Games</Label>
                        <Input
                          type="number"
                          value={newSeasonGames}
                          onChange={e => setNewSeasonGames(e.target.value === '' ? '' : Number(e.target.value))}
                          min={1}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Start Date</Label>
                          <Input
                            type="date"
                            className="mt-1 h-8 text-sm"
                            value={dateRange?.from ? dateRange.from.toISOString().split('T')[0] : ''}
                            onChange={e => setDateRange(prev => ({ from: e.target.value ? new Date(e.target.value) : undefined, to: prev?.to }))}
                          />
                        </div>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">End Date</Label>
                          <Input
                            type="date"
                            className="mt-1 h-8 text-sm"
                            value={dateRange?.to ? dateRange.to.toISOString().split('T')[0] : ''}
                            onChange={e => setDateRange(prev => ({ from: prev?.from, to: e.target.value ? new Date(e.target.value) : undefined }))}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1" onClick={handleCreateSeason}>
                          Create Season
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setShowNewSeason(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Season dashboard */}
              {currentSeason && (
                <SeasonDashboard
                  season={currentSeason}
                  leaguePlayers={leaguePlayers}
                  tournament={tournament}
                />
              )}

              {/* Danger zone */}
              {!readOnly && (
                <div className="border-t border-border/20 pt-3">
                  <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete season?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{currentSeason?.name}</strong> and all its tournament results. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/80"
                          onClick={handleDeleteSeason}
                          disabled={isDeletingSeason}
                        >
                          {isDeletingSeason ? 'Deleting...' : 'Delete Season'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog open={showDeleteLeague} onOpenChange={setShowDeleteLeague}>
                    <AlertDialogTrigger asChild>
                      <button className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                        Delete entire league
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete league?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete <strong>{league?.name}</strong> including all seasons, players, and tournament results. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="px-6 pb-2">
                        <Label className="text-xs text-muted-foreground">Type the league name to confirm</Label>
                        <Input
                          value={deleteLeagueConfirm}
                          onChange={e => setDeleteLeagueConfirm(e.target.value)}
                          placeholder={league?.name}
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDeleteLeagueConfirm('')}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/80"
                          onClick={handleDeleteLeague}
                          disabled={isDeletingLeague || deleteLeagueConfirm !== league?.name}
                        >
                          {isDeletingLeague ? 'Deleting...' : 'Delete League'}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}

            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}