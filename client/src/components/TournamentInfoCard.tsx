import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, ChevronRight, Trophy, Users, Coins, RefreshCw, Zap, Calculator, LogIn, RotateCcw } from 'lucide-react';
import { cn } from "@/lib/utils";
import { calculatePrizePool } from "@/lib/prizePool";
import ChipChopCalculator from './ChipChopCalculator';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  league: ReturnType<typeof useLeague>['league'];
  userLeagues?: ReturnType<typeof useLeague>['userLeagues'];
  leaguePlayers?: ReturnType<typeof useLeague>['leaguePlayers'];
  switchLeague?: ReturnType<typeof useLeague>['switchLeague'];
  currentSeason: ReturnType<typeof useSeasons>['currentSeason'];
  seasons: ReturnType<typeof useSeasons>['seasons'];
}

type TournamentProp = TournamentInfoCardProps['tournament'];
type SharedLeagueProps = Omit<TournamentInfoCardProps, 'tournament'>;

const ordinal = (n: number) => ['1st','2nd','3rd'][n-1] ?? `${n}th`;

function DetailRow({ label, value, highlight, compact }: { label: string; value: string | number; highlight?: boolean; compact?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between font-mono",
      compact ? "py-0.5 text-xs" : "py-1 text-sm",
      highlight && "font-semibold"
    )}>
      <span className={cn("font-sans", highlight ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={highlight ? "text-primary" : ""}>{value}</span>
    </div>
  );
}

const activeStyle = {
  background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(249,115,22,0.06) 100%)',
  color: 'rgb(251,146,60)',
  borderColor: 'rgba(249,115,22,0.3)',
  boxShadow: '0 2px 8px rgba(249,115,22,0.15)',
};
const inactiveStyle = { borderColor: 'transparent', color: 'var(--muted-foreground)' };

export function TournamentModeToggle({ tournament, league, leaguePlayers = [], currentSeason, seasons }: { tournament: TournamentProp } & Pick<SharedLeagueProps, 'league' | 'leaguePlayers' | 'currentSeason' | 'seasons'>) {
  const { state, updateTournamentDetails, updateSettings } = tournament;

  const isLeagueMode =
    state.details?.type === 'season' ||
    state.settings?.isSeasonTournament === true;

  const handleEnableLeague = () => {
    updateTournamentDetails({ ...state.details, type: 'season' });
    if (league?.id) {
      updateSettings({ isSeasonTournament: true, leagueId: String(league.id) });
    }
  };

  return (
    <div className="inline-flex items-center bg-muted p-1 rounded-md flex-shrink-0">
      <button
        className="inline-flex items-center justify-center rounded-sm px-3 py-1 text-xs font-medium transition-all duration-200 border"
        style={!isLeagueMode ? activeStyle : inactiveStyle}
        onClick={() => {
          updateTournamentDetails({ ...state.details, type: 'standalone' });
          updateSettings({ isSeasonTournament: false });
        }}
      >
        Standalone
      </button>
      <button
        className="inline-flex items-center justify-center rounded-sm px-3 py-1 text-xs font-medium transition-all duration-200 border"
        style={isLeagueMode ? activeStyle : inactiveStyle}
        onClick={handleEnableLeague}
      >
        League
      </button>
    </div>
  );
}

export function TournamentNewButton({ tournament, league, userLeagues = [], switchLeague, leaguePlayers = [], currentSeason, seasons }: { tournament: TournamentProp } & Required<Pick<SharedLeagueProps, 'switchLeague'>> & Omit<SharedLeagueProps, 'switchLeague'>) {
  const { state, resetTournament, updateSettings } = tournament;
  const [, setLocation] = useLocation();
  const [dialogLeagueId, setDialogLeagueId] = useState<string | null>(null);
  const { seasons: dialogSeasonsList, isLoading: dialogSeasonsLoading } = useSeasons({ leagueId: dialogLeagueId ?? undefined });
  const [showLeagueNewDialog, setShowLeagueNewDialog] = useState(false);
  const [dialogSeasonId, setDialogSeasonId] = useState<string | number | null>(null);

  const isLeagueMode =
    state.details?.type === 'season' ||
    state.settings?.isSeasonTournament === true;

  const storedSeasonId = state.settings?.seasonId;
  const displaySeason = storedSeasonId
    ? ((seasons as any[]).find(s => String(s.id) === String(storedSeasonId)) ?? currentSeason)
    : currentSeason;

  const handleNewTournament = (keepStructure: boolean) => {
    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    resetTournament({ keepStructure });
    setLocation('/');
  };

  const handleLeagueNewGame = (seasonId: string | number | null) => {
    const sourceSeasons = dialogSeasonsList.length > 0 ? dialogSeasonsList : (seasons as any[]);
    const chosenSeason = (sourceSeasons as any[]).find(s => String(s.id) === String(seasonId));
    setShowLeagueNewDialog(false);
    handleNewTournament(true);
    if (dialogLeagueId && String(dialogLeagueId) !== String(league?.id)) {
      switchLeague(dialogLeagueId);
    }
    if (chosenSeason) {
      updateSettings({
        isSeasonTournament: true,
        leagueId: String(dialogLeagueId ?? league?.id ?? ''),
        seasonId: String(chosenSeason.id),
        seasonName: chosenSeason.name,
        numberOfGames: chosenSeason.numberOfGames || 12,
      });
    }
  };

  const gameNumber = useMemo(() => {
    if (!isLeagueMode || !displaySeason) return null;
    const ids = new Set<string>();
    leaguePlayers.forEach((player: any) => {
      (player.tournamentResults || [])
        .filter((r: any) => r.seasonId === String(displaySeason.id))
        .forEach((r: any) => { if (r.tournamentId) ids.add(String(r.tournamentId)); });
    });
    const localGameId = state.details?.localGameId;
    if (localGameId && ids.has(localGameId)) return ids.size;
    return ids.size + 1;
  }, [isLeagueMode, displaySeason?.id, leaguePlayers, state.details?.localGameId]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalGames = displaySeason?.numberOfGames || 12;

  const dialogGameNumber = useMemo(() => {
    if (!dialogSeasonId) return gameNumber;
    if (dialogLeagueId && String(dialogLeagueId) !== String(league?.id)) return null;
    const ids = new Set<string>();
    leaguePlayers.forEach((player: any) => {
      (player.tournamentResults || [])
        .filter((r: any) => r.seasonId === String(dialogSeasonId))
        .forEach((r: any) => { if (r.tournamentId) ids.add(String(r.tournamentId)); });
    });
    const localGameId = state.details?.localGameId;
    if (localGameId && ids.has(localGameId)) return ids.size;
    return ids.size + 1;
  }, [dialogSeasonId, dialogLeagueId, league?.id, leaguePlayers, state.details?.localGameId, gameNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const dialogTotalGames = useMemo(() => {
    const dialogSeason = (dialogSeasonsList as any[]).find(s => String(s.id) === String(dialogSeasonId))
      || (seasons as any[]).find(s => String(s.id) === String(dialogSeasonId));
    return dialogSeason?.numberOfGames || totalGames;
  }, [dialogSeasonId, dialogSeasonsList, seasons, totalGames]);

  return (
    <>
      {isLeagueMode ? (
        <button
          onClick={() => {
            setDialogLeagueId(league?.id ? String(league.id) : null);
            setDialogSeasonId(displaySeason?.id ?? null);
            setShowLeagueNewDialog(true);
          }}
          className="flex items-center gap-1 text-xs font-medium text-orange-400/80 hover:text-orange-300 border border-orange-400/20 hover:border-orange-400/40 px-2 py-1 rounded-md hover:bg-orange-500/10 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
          Next Game
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground border border-border/40 hover:border-border px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">
              <RotateCcw className="h-3.5 w-3.5" />
              New
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Start a new tournament?</AlertDialogTitle>
              <AlertDialogDescription>
                All players and results will be cleared. Choose whether to keep your current blind structure and buy-in settings.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-muted text-foreground hover:bg-muted/80"
                onClick={() => handleNewTournament(true)}
              >
                Keep structure
              </AlertDialogAction>
              <AlertDialogAction onClick={() => handleNewTournament(false)}>
                Full reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={showLeagueNewDialog} onOpenChange={setShowLeagueNewDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Start next league game</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(userLeagues as any[]).length > 1 && (
              <div className="space-y-1.5">
                <label htmlFor="dialog-league" className="text-sm font-medium text-foreground">League</label>
                <Select
                  value={String(dialogLeagueId ?? '')}
                  onValueChange={v => {
                    setDialogLeagueId(v);
                    setDialogSeasonId(null);
                  }}
                >
                  <SelectTrigger id="dialog-league" className="h-9">
                    <SelectValue placeholder="Select league" />
                  </SelectTrigger>
                  <SelectContent>
                    {(userLeagues as any[]).map((l: any) => (
                      <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="dialog-season" className="text-sm font-medium text-foreground">Season</label>
              {(() => {
                const displaySeasons = (dialogSeasonsList as any[]).length > 0
                  ? (dialogSeasonsList as any[])
                  : (seasons as any[]);
                return displaySeasons.length > 1 ? (
                  <Select
                    value={String(dialogSeasonId ?? '')}
                    onValueChange={v => setDialogSeasonId(v)}
                  >
                    <SelectTrigger id="dialog-season" className="h-9">
                      <SelectValue placeholder="Select season" />
                    </SelectTrigger>
                    <SelectContent>
                      {displaySeasons.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground px-1">
                    {displaySeasons[0]?.name ?? displaySeason?.name ?? '—'}
                  </p>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dialog-game" className="text-sm font-medium text-foreground">Game</label>
              <div id="dialog-game" className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-orange-400 px-1">
                  {dialogGameNumber != null
                    ? `Game ${dialogGameNumber} of ${dialogTotalGames}`
                    : 'Game — of —'}
                </span>
                <span className="text-xs text-muted-foreground">· auto-calculated</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full"
              disabled={dialogSeasonsLoading || (dialogLeagueId !== null && String(dialogLeagueId) !== String(league?.id) && dialogSeasonsList.length === 0)}
              onClick={() => handleLeagueNewGame(dialogSeasonId)}
            >
              {dialogGameNumber != null ? `Start Game ${dialogGameNumber}` : 'Start Next Game'}
            </Button>
            <button
              onClick={() => { setShowLeagueNewDialog(false); handleNewTournament(false); }}
              className="text-xs text-destructive hover:text-destructive/80 text-center py-1"
            >
              Full reset (clears structure &amp; switches to standalone)
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TournamentInfoCard({ tournament, league, currentSeason, seasons }: TournamentInfoCardProps) {
  const { state } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  const [showChipChop, setShowChipChop] = useState(false);

  const isLeagueMode =
    state.details?.type === 'season' ||
    state.settings?.isSeasonTournament === true;

  const storedSeasonId = state.settings?.seasonId;
  const displaySeason = storedSeasonId
    ? ((seasons as any[]).find(s => String(s.id) === String(storedSeasonId)) ?? currentSeason)
    : currentSeason;

  const lastLoadedSeasonId = useRef<string | number | null>(null);
  useEffect(() => {
    if (!isLeagueMode || !displaySeason) return;
    const saved = displaySeason.settings;
    if (!saved?.blindLevels || !saved?.prizeStructure) return;
    if (lastLoadedSeasonId.current === displaySeason.id) return;
    lastLoadedSeasonId.current = displaySeason.id;
    tournament.setBlindLevels(saved.blindLevels);
    tournament.updatePrizeStructure(saved.prizeStructure);
  }, [isLeagueMode, displaySeason?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sym = state.settings.currency || '£';
  const p = state.prizeStructure;
  const buyIn = p?.buyIn || 0;
  const rebuyAmt = p?.rebuyAmount || 0;
  const addonAmt = p?.addonAmount || 0;
  const rakeType = p?.rakeType || 'percentage';
  const rakePct = p?.rakePercentage || 0;
  const totalRebuys = state.players.reduce((s, pl) => s + (pl.rebuys || 0), 0);
  const totalAddons = state.players.reduce((s, pl) => s + (pl.addons || 0), 0);
  const totalReEntries = state.players.reduce((s, pl) => s + (pl.reEntries || 0), 0);

  const { rake, net: pool } = calculatePrizePool({
    buyIn, playerCount: state.players.length,
    totalRebuys, rebuyAmount: rebuyAmt,
    totalAddons, addonAmount: addonAmt,
    totalReEntries,
    reEntryRake: p?.reEntryRake ?? true,
    reEntryRakeAmount: p?.reEntryRakeAmount,
    rebuyRake: p?.rebuyRake || false,
    rebuyRakeAmount: p?.rebuyRakeAmount,
    rakeType, rakePercentage: rakePct,
    rakeAmount: p?.rakeAmount || 0,
  });

  const startChips = p?.startingChips || 10000;
  const rebuyChips = p?.rebuyChips || startChips;
  const addonChips = p?.addonChips || startChips;
  const totalChips = (startChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
  const active = state.players.filter(pl => pl.isActive !== false);
  const eliminated = state.players.filter(pl => pl.isActive === false);
  const avg = active.length > 0 ? Math.floor(totalChips / active.length) : 0;
  const winner = active.length === 1 && eliminated.length > 0 ? active[0] : null;

  const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}k` : String(n);

  return (
    <Card className="card-glass-purple rounded-xl">
      <CardContent className="p-5">

        {/* Header */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Trophy className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Tournament Info</span>
          </div>
          {isLeagueMode && state.settings?.seasonName && state.settings?.gameNumber != null && (
            <div className="absolute left-1/2 -translate-x-1/2 text-xs text-orange-400/70 whitespace-nowrap pointer-events-none">
              {state.settings.seasonName} · Game {state.settings.gameNumber} of {state.settings.numberOfGames || 12}
            </div>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            {active.length >= 2 && pool > 0 && (
              <button
                onClick={() => setShowChipChop(true)}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded-md hover:bg-orange-500/10"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chop</span>
              </button>
            )}
            <button onClick={() => setIsExpanded(v => !v)}>
              {isExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">

            {/* Winner */}
            {winner && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <div className="text-yellow-400 font-bold text-lg">🏆 {winner.name}</div>
                <div className="text-xs text-yellow-300/70 mt-0.5">Tournament Winner</div>
              </div>
            )}

            {/* Stat tiles */}
            <div className="flex gap-2">
              <div className="flex-1 bg-background/30 rounded-lg px-3 py-2.5 text-center">
                <div className="font-bold font-mono text-lg text-teal-400">{active.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {eliminated.length > 0 ? `of ${state.players.length} active` : 'players'}
                </div>
              </div>
              {pool > 0 && (
                <div className="flex-1 bg-background/30 rounded-lg px-3 py-2.5 text-center">
                  <div className="font-bold font-mono text-lg text-orange-400">{sym}{pool.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">prize pool</div>
                </div>
              )}
              {avg > 0 && (
                <div className="flex-1 bg-background/30 rounded-lg px-3 py-2.5 text-center">
                  <div className="font-bold font-mono text-lg text-orange-400">{fmt(avg)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">avg stack</div>
                </div>
              )}
            </div>

            {/* Payouts */}
            {p?.manualPayouts && p.manualPayouts.length > 0 && pool > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Payouts</span>
                </div>
                <div className="space-y-1.5">
                  {p.manualPayouts.map((po: any, i: number) => {
                    const amount = Math.floor(pool * po.percentage / 100);
                    const finisher = state.players.find((pl: any) => pl.position === i + 1);
                    const bountyBonus = (() => {
                      if (!finisher || !p?.enableBounties || !p?.bountyAmount) return 0;
                      if (p.bountyType === 'progressive') {
                        const winnings = finisher.bountyWinnings || 0;
                        const ownBounty = i === 0 ? (finisher.currentBounty || p.bountyAmount) : 0;
                        return winnings + ownBounty;
                      }
                      return ((finisher.knockouts || 0) + (i === 0 ? 1 : 0)) * p.bountyAmount;
                    })();
                    const total = amount + bountyBonus;
                    return (
                      <div key={i} className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2",
                        i === 0 ? "bg-yellow-500/10 border border-yellow-500/20"
                        : i === 1 ? "bg-gray-400/10 border border-gray-400/20"
                        : "bg-background/20"
                      )}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className={cn("font-semibold w-7",
                            i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"
                          )}>
                            {ordinal(i + 1)}
                          </span>
                          {finisher
                            ? <span className="text-foreground font-medium">{finisher.name}</span>
                            : <span className="text-muted-foreground">{po.percentage}%</span>}
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-green-400 text-sm">{sym}{total.toLocaleString()}</span>
                          {bountyBonus > 0 && (
                            <div className="text-xs text-muted-foreground">{sym}{amount} + {sym}{bountyBonus} bounty</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2x2 stat grid */}
            <div className="border-t border-border/20 pt-3">
              <div className="grid grid-cols-2 gap-2">

                {/* Players */}
                <div className="rounded-lg border border-teal-400/20 bg-teal-400/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="h-3.5 w-3.5 text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-teal-400">Players</span>
                  </div>
                  <DetailRow label="Registered" value={state.players.length} compact />
                  <DetailRow label="Active" value={active.length} compact />
                  {eliminated.length > 0 && <DetailRow label="Eliminated" value={eliminated.length} compact />}
                </div>

                {/* Prize Pool */}
                <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Coins className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Prize Pool</span>
                  </div>
                  <DetailRow label={`Buy-in ×${state.players.length}`} value={`${sym}${(buyIn * state.players.length).toLocaleString()}`} compact />
                  {totalRebuys > 0 && <DetailRow label={`Rebuys (${totalRebuys}×)`} value={`${sym}${(rebuyAmt * totalRebuys).toLocaleString()}`} compact />}
                  {totalAddons > 0 && <DetailRow label={`Add-ons (${totalAddons}×)`} value={`${sym}${(addonAmt * totalAddons).toLocaleString()}`} compact />}
                  {rake > 0 && <DetailRow label={`House fee${rakeType === 'percentage' ? ` (${rakePct}%)` : ''}`} value={`${sym}${rake.toLocaleString()}`} compact />}
                  <DetailRow label="Total" value={`${sym}${pool.toLocaleString()}`} highlight compact />
                </div>

                {/* Chips */}
                <div className={cn(
                  "rounded-lg border border-orange-400/20 bg-orange-400/5 p-3",
                  !p?.allowRebuys && "col-span-2"
                )}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Chips</span>
                  </div>
                  <DetailRow label="Starting Stack" value={startChips.toLocaleString()} compact />
                  {avg > 0 && <DetailRow label="Average Stack" value={avg.toLocaleString()} highlight compact />}
                </div>

                {/* Rebuys */}
                {p?.allowRebuys && (
                  <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Rebuys</span>
                    </div>
                    <DetailRow label="Cost" value={`${sym}${p?.rebuyAmount || 0}`} compact />
                    <DetailRow label="Chips" value={(p?.rebuyChips || 10000).toLocaleString()} compact />
                    <DetailRow label="Used" value={totalRebuys} compact />
                  </div>
                )}
              </div>

              {/* Optional sections */}
              {(p?.allowReEntry || p?.allowAddons || p?.enableBounties) && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {p?.allowReEntry && (
                    <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <LogIn className="h-3.5 w-3.5 text-orange-400" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Re-entries</span>
                      </div>
                      <DetailRow label="Cost" value={`${sym}${p?.rebuyAmount || buyIn}`} compact />
                      {(p?.maxReEntries ?? 0) > 0 && <DetailRow label="Max / player" value={p!.maxReEntries!} compact />}
                      <DetailRow label="Used" value={totalReEntries} compact />
                    </div>
                  )}
                  {p?.allowAddons && (
                    <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Coins className="h-3.5 w-3.5 text-orange-400" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Add-ons</span>
                      </div>
                      <DetailRow label="Cost" value={`${sym}${p?.addonAmount || 0}`} compact />
                      <DetailRow label="Chips" value={(p?.addonChips || 10000).toLocaleString()} compact />
                      <DetailRow label="Used" value={totalAddons} compact />
                    </div>
                  )}
                  {p?.enableBounties && (
                    <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                        <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Bounties</span>
                      </div>
                      <DetailRow label="Type" value={p.bountyType === 'progressive' ? 'Progressive (PKO)' : 'Standard'} compact />
                      <DetailRow label="Bounty" value={`${sym}${p.bountyAmount || 0}`} compact />
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </CardContent>

      <ChipChopCalculator
        open={showChipChop}
        onClose={() => setShowChipChop(false)}
        players={active}
        payouts={p?.manualPayouts?.map((po: any) => Math.floor(pool * (po.percentage || 0) / 100)) || []}
        prizePool={pool}
      />
    </Card>
  );
}
