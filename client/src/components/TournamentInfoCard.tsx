import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Trophy, Users, Coins, RefreshCw, Zap, Calculator } from 'lucide-react';
import { cn } from "@/lib/utils";
import { calculatePrizePool } from "@/lib/prizePool";
import ChipChopCalculator from './ChipChopCalculator';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

function StatTile({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="flex-1 bg-background/30 rounded-lg px-3 py-2.5 text-center min-w-0">
      <div className={cn("font-bold font-mono text-lg leading-tight truncate", color ?? "text-foreground")}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/60 truncate">{sub}</div>}
    </div>
  );
}

const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

export default function TournamentInfoCard({ tournament }: TournamentInfoCardProps) {
  const { state } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  const [showChipChop, setShowChipChop] = useState(false);
  const currencySymbol = state.settings.currency || '£';
  const p = state.prizeStructure;

  const buyInAmount = p?.buyIn || 0;
  const rebuyAmount = p?.rebuyAmount || 0;
  const addonAmount = p?.addonAmount || 0;
  const rakePercentage = p?.rakePercentage || 0;
  const rakeType = p?.rakeType || 'percentage';
  const totalRebuys = state.players.reduce((sum, pl) => sum + (pl.rebuys || 0), 0);
  const totalAddons = state.players.reduce((sum, pl) => sum + (pl.addons || 0), 0);

  const { gross: grossPrizePool, rake: rakeAmountVal, net: totalPrizePool } = calculatePrizePool({
    buyIn: buyInAmount,
    playerCount: state.players.length,
    totalRebuys, rebuyAmount,
    totalAddons, addonAmount,
    rakeType, rakePercentage,
    rakeAmount: p?.rakeAmount || 0,
  });

  const startingChips = p?.startingChips || 10000;
  const rebuyChips = p?.rebuyChips || startingChips;
  const addonChips = p?.addonChips || startingChips;
  const totalChips = (startingChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
  const activePlayers = state.players.filter(pl => pl.isActive !== false);
  const eliminatedPlayers = state.players.filter(pl => pl.isActive === false);
  const avgStack = activePlayers.length > 0 ? Math.floor(totalChips / activePlayers.length) : 0;

  const tournamentFinished = activePlayers.length === 1 && eliminatedPlayers.length > 0;
  const winner = tournamentFinished ? activePlayers[0] : null;

  const hasPayouts = p?.manualPayouts && p.manualPayouts.length > 0 && totalPrizePool > 0;
  const hasRebuys = p?.allowRebuys;
  const hasAddons = p?.allowAddons;

  // Format large chip numbers compactly
  const fmtChips = (n: number) => n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
    ? `${(n / 1000).toFixed(0)}k`
    : String(n);

  return (
    <Card className="card-glass-purple rounded-xl">
      <CardContent className="p-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Tournament Info
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activePlayers.length >= 2 && totalPrizePool > 0 && (
              <button
                onClick={() => setShowChipChop(true)}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 rounded-md hover:bg-orange-500/10"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chop</span>
              </button>
            )}
            <button onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {isExpanded && (<>

        {/* Winner banner */}
        {winner && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
            <div className="text-yellow-400 font-bold text-lg">🏆 {winner.name}</div>
            <div className="text-xs text-yellow-300/70 mt-0.5">Tournament Winner</div>
          </div>
        )}

        {/* Stat tiles — always shown */}
        <div className="flex gap-2 mb-4">
            <StatTile
              label="Active"
              value={activePlayers.length}
              sub={state.players.length > activePlayers.length ? `of ${state.players.length}` : undefined}
              color="text-blue-400"
            />
            {totalPrizePool > 0 && (
              <StatTile
                label="Prize Pool"
                value={`${currencySymbol}${totalPrizePool.toLocaleString()}`}
                color="text-green-400"
              />
            )}
            {avgStack > 0 && (
              <StatTile
                label="Avg Stack"
                value={fmtChips(avgStack)}
                color="text-orange-400"
              />
            )}
          </div>
        </div>

        {/* Payouts — shown directly, always visible */}
        {hasPayouts && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Payouts</span>
            </div>
            <div className="space-y-1.5">
              {p!.manualPayouts.map((payout: any, i: number) => {
                const amount = Math.floor(totalPrizePool * payout.percentage / 100);
                const finisher = state.players.find(pl => pl.position === i + 1);
                const isCurrentLeader = !finisher && activePlayers[0] && i === 0 && activePlayers.length > 1;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-3 py-2",
                      i === 0 ? "bg-yellow-500/10 border border-yellow-500/20"
                        : i === 1 ? "bg-gray-400/10 border border-gray-400/20"
                        : "bg-background/20"
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className={cn(
                        "font-semibold w-7",
                        i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-muted-foreground"
                      )}>
                        {ordinal(i + 1)}
                      </span>
                      {finisher
                        ? <span className="text-foreground font-medium">{finisher.name}</span>
                        : <span className="text-muted-foreground">{payout.percentage}%</span>
                      }
                    </div>
                    <span className="font-mono font-bold text-green-400 text-sm">
                      {currencySymbol}{amount.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Details */}
        <div className="mt-3 space-y-0.5 text-sm">

            {/* Players */}
            <div className="flex items-center gap-2 py-1.5 border-b border-border/20 mb-1">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">Players</span>
            </div>
            <DetailRow label="Registered" value={state.players.length} />
            <DetailRow label="Active" value={activePlayers.length} />
            {eliminatedPlayers.length > 0 && <DetailRow label="Eliminated" value={eliminatedPlayers.length} />}

            {/* Prize pool breakdown */}
            <div className="flex items-center gap-2 py-1.5 border-b border-border/20 mt-3 mb-1">
              <Coins className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-green-400">Prize Pool</span>
            </div>
            <DetailRow label={`Buy-in × ${state.players.length}`} value={`${currencySymbol}${(buyInAmount * state.players.length).toLocaleString()}`} />
            {totalRebuys > 0 && <DetailRow label={`Rebuys (${totalRebuys} × ${currencySymbol}${rebuyAmount})`} value={`${currencySymbol}${(rebuyAmount * totalRebuys).toLocaleString()}`} />}
            {totalAddons > 0 && <DetailRow label={`Add-ons (${totalAddons} × ${currencySymbol}${addonAmount})`} value={`${currencySymbol}${(addonAmount * totalAddons).toLocaleString()}`} />}
            {rakeAmountVal > 0 && <>
              <DetailRow label="Gross" value={`${currencySymbol}${grossPrizePool.toLocaleString()}`} />
              <DetailRow label={`Rake ${rakeType === 'percentage' ? `(${rakePercentage}%)` : '(fixed)'}`} value={`-${currencySymbol}${rakeAmountVal.toLocaleString()}`} />
            </>}
            <DetailRow label="Net Prize Pool" value={`${currencySymbol}${totalPrizePool.toLocaleString()}`} highlight />

            {/* Chips */}
            <div className="flex items-center gap-2 py-1.5 border-b border-border/20 mt-3 mb-1">
              <Zap className="h-3.5 w-3.5 text-orange-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Chips</span>
            </div>
            <DetailRow label="Starting Stack" value={startingChips.toLocaleString()} />
            {totalChips !== startingChips * state.players.length && <DetailRow label="Total in Play" value={totalChips.toLocaleString()} />}
            {avgStack > 0 && <DetailRow label="Average Stack" value={avgStack.toLocaleString()} highlight />}

            {/* Rebuys */}
            {hasRebuys && <>
              <div className="flex items-center gap-2 py-1.5 border-b border-border/20 mt-3 mb-1">
                <RefreshCw className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-purple-400">Rebuys</span>
              </div>
              <DetailRow label="Period" value={`First ${p?.rebuyPeriodLevels || 3} levels`} />
              <DetailRow label="Cost" value={`${currencySymbol}${p?.rebuyAmount || 0}`} />
              <DetailRow label="Chips" value={(p?.rebuyChips || 10000).toLocaleString()} />
              <DetailRow label="Max" value={p?.maxRebuys ? String(p.maxRebuys) : 'Unlimited'} />
              <DetailRow label="Used" value={totalRebuys} />
            </>}

            {/* Add-ons */}
            {hasAddons && <>
              <div className="flex items-center gap-2 py-1.5 border-b border-border/20 mt-3 mb-1">
                <Coins className="h-3.5 w-3.5 text-teal-400" />
                <span className="text-xs font-semibold uppercase tracking-wide text-teal-400">Add-ons</span>
              </div>
              <DetailRow label="Available from Level" value={p?.addonAvailableLevel || 6} />
              <DetailRow label="Cost" value={`${currencySymbol}${p?.addonAmount || 0}`} />
              <DetailRow label="Chips" value={(p?.addonChips || 10000).toLocaleString()} />
              <DetailRow label="Used" value={totalAddons} />
            </>}
        </div>

        </>)}
      </CardContent>

      <ChipChopCalculator
        open={showChipChop}
        onClose={() => setShowChipChop(false)}
        players={activePlayers}
        payouts={p?.manualPayouts?.map((po: any) => typeof po === 'number' ? po : Math.floor(totalPrizePool * (po.percentage || 0) / 100)) || []}
        prizePool={totalPrizePool}
      />
    </Card>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1 text-sm", highlight && "font-semibold")}>
      <span className={highlight ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-mono", highlight ? "text-primary" : "")}>{value}</span>
    </div>
  );
}
