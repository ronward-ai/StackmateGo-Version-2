import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Trophy, Users, Coins, RefreshCw, Zap, Calculator } from 'lucide-react';
import { cn } from "@/lib/utils";
import { calculatePrizePool } from "@/lib/prizePool";
import ChipChopCalculator from './ChipChopCalculator';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

const ordinal = (n: number) => ['1st','2nd','3rd'][n-1] ?? `${n}th`;

function DetailRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1 text-sm", highlight && "font-semibold")}>
      <span className={highlight ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-mono", highlight ? "text-primary" : "")}>{value}</span>
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

export default function TournamentInfoCard({ tournament }: TournamentInfoCardProps) {
  const { state, updateTournamentDetails, updateSettings } = tournament;
  const { league, leaguePlayers } = useLeague();
  const { currentSeason } = useSeasons({ leagueId: league?.id });
  const [isExpanded, setIsExpanded] = useState(true);
  const [showChipChop, setShowChipChop] = useState(false);

  const isLeagueMode =
    state.details?.type === 'season' ||
    (state.settings as any)?.isSeasonTournament === true;

  const handleEnableLeague = () => {
    updateTournamentDetails({ ...state.details, type: 'season' });
    if (league?.id) {
      updateSettings({ isSeasonTournament: true, leagueId: String(league.id) } as any);
    }
  };

  // Auto-load structure when league mode activates or season switches
  const lastLoadedSeasonId = useRef<string | number | null>(null);
  useEffect(() => {
    if (!isLeagueMode || !currentSeason) return;
    const saved = currentSeason.settings;
    if (!saved?.blindLevels || !saved?.prizeStructure) return;
    if (lastLoadedSeasonId.current === currentSeason.id) return;
    lastLoadedSeasonId.current = currentSeason.id;
    tournament.setBlindLevels(saved.blindLevels);
    tournament.updatePrizeStructure(saved.prizeStructure);
  }, [isLeagueMode, currentSeason?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count completed games in this season by counting unique tournamentIds across all league players
  const completedGames = useMemo(() => {
    if (!isLeagueMode || !currentSeason) return 0;
    const ids = new Set<string>();
    leaguePlayers.forEach((player: any) => {
      (player.tournamentResults || [])
        .filter((r: any) => r.seasonId === String(currentSeason.id))
        .forEach((r: any) => { if (r.tournamentId) ids.add(String(r.tournamentId)); });
    });
    return ids.size;
  }, [isLeagueMode, currentSeason?.id, leaguePlayers]); // eslint-disable-line react-hooks/exhaustive-deps
  const gameNumber = isLeagueMode && currentSeason ? completedGames + 1 : null;
  const totalGames = currentSeason?.numberOfGames || 12;

  const sym = state.settings.currency || '£';
  const p = state.prizeStructure;
  const buyIn = p?.buyIn || 0;
  const rebuyAmt = p?.rebuyAmount || 0;
  const addonAmt = p?.addonAmount || 0;
  const rakeType = p?.rakeType || 'percentage';
  const rakePct = p?.rakePercentage || 0;
  const totalRebuys = state.players.reduce((s, pl) => s + (pl.rebuys || 0), 0);
  const totalAddons = state.players.reduce((s, pl) => s + (pl.addons || 0), 0);

  const { gross, rake, net: pool } = calculatePrizePool({
    buyIn, playerCount: state.players.length,
    totalRebuys, rebuyAmount: rebuyAmt,
    totalAddons, addonAmount: addonAmt,
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Tournament Info</span>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Mode toggle — left-aligned, below header, always visible */}
        <div className="flex items-center gap-3 mt-2">
          <div className="inline-flex items-center bg-muted p-1 rounded-md">
            <button
              className="inline-flex items-center justify-center rounded-sm px-3 py-1 text-xs font-medium transition-all duration-200 border"
              style={!isLeagueMode ? activeStyle : inactiveStyle}
              onClick={() => {
                updateTournamentDetails({ ...state.details, type: 'standalone' });
                updateSettings({ isSeasonTournament: false } as any);
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
          {isLeagueMode && gameNumber !== null && (
            <span className="text-xs font-medium text-orange-400">
              Game {gameNumber} of {totalGames}
            </span>
          )}
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
                <div className="font-bold font-mono text-lg text-blue-400">{active.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {eliminated.length > 0 ? `of ${state.players.length} active` : 'players'}
                </div>
              </div>
              {pool > 0 && (
                <div className="flex-1 bg-background/30 rounded-lg px-3 py-2.5 text-center">
                  <div className="font-bold font-mono text-lg text-green-400">{sym}{pool.toLocaleString()}</div>
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
                    const finisher = state.players.find(pl => pl.position === i + 1);
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
                        <span className="font-mono font-bold text-green-400 text-sm">{sym}{amount.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detail rows */}
            <div className="border-t border-border/20 pt-3 space-y-0.5 text-sm">
              <div className="flex items-center gap-2 pb-1 mb-1">
                <Users className="h-3.5 w-3.5 text-blue-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">Players</span>
              </div>
              <DetailRow label="Registered" value={state.players.length} />
              <DetailRow label="Active" value={active.length} />
              {eliminated.length > 0 && <DetailRow label="Eliminated" value={eliminated.length} />}

              <div className="flex items-center gap-2 pt-3 pb-1">
                <Coins className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-green-400">Prize Pool</span>
              </div>
              <DetailRow label={`Buy-in × ${state.players.length}`} value={`${sym}${(buyIn * state.players.length).toLocaleString()}`} />
              {totalRebuys > 0 && <DetailRow label={`Rebuys (${totalRebuys} × ${sym}${rebuyAmt})`} value={`${sym}${(rebuyAmt * totalRebuys).toLocaleString()}`} />}
              {totalAddons > 0 && <DetailRow label={`Add-ons (${totalAddons} × ${sym}${addonAmt})`} value={`${sym}${(addonAmt * totalAddons).toLocaleString()}`} />}
              {rake > 0 && <DetailRow label={`Rake ${rakeType === 'percentage' ? `(${rakePct}%)` : '(fixed)'}`} value={`-${sym}${rake.toLocaleString()}`} />}
              <DetailRow label="Net Prize Pool" value={`${sym}${pool.toLocaleString()}`} highlight />

              <div className="flex items-center gap-2 pt-3 pb-1">
                <Zap className="h-3.5 w-3.5 text-orange-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Chips</span>
              </div>
              <DetailRow label="Starting Stack" value={startChips.toLocaleString()} />
              {avg > 0 && <DetailRow label="Average Stack" value={avg.toLocaleString()} highlight />}

              {p?.allowRebuys && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <RefreshCw className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-purple-400">Rebuys</span>
                  </div>
                  <DetailRow label="Cost" value={`${sym}${p?.rebuyAmount || 0}`} />
                  <DetailRow label="Chips" value={(p?.rebuyChips || 10000).toLocaleString()} />
                  <DetailRow label="Used" value={totalRebuys} />
                </>
              )}

              {p?.allowAddons && (
                <>
                  <div className="flex items-center gap-2 pt-3 pb-1">
                    <Coins className="h-3.5 w-3.5 text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-teal-400">Add-ons</span>
                  </div>
                  <DetailRow label="Cost" value={`${sym}${p?.addonAmount || 0}`} />
                  <DetailRow label="Chips" value={(p?.addonChips || 10000).toLocaleString()} />
                  <DetailRow label="Used" value={totalAddons} />
                </>
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
