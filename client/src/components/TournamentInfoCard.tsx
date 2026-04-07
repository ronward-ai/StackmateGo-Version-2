import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Trophy, Users, Coins, RefreshCw, Zap, Calculator } from 'lucide-react';
import { cn } from "@/lib/utils";
import { calculatePrizePool } from "@/lib/prizePool";
import ChipChopCalculator from './ChipChopCalculator';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
}

function InfoRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={cn(
      "flex items-center justify-between py-1.5 text-sm",
      highlight && "font-semibold text-foreground"
    )}>
      <span className={highlight ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className={highlight ? "text-primary font-mono text-base" : "font-mono"}>{value}</span>
    </div>
  );
}

function SectionDivider({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 border-t border-border/20 mt-1">
      <Icon className={cn("h-3.5 w-3.5", color)} />
      <span className={cn("text-xs font-semibold uppercase tracking-wide", color)}>{title}</span>
    </div>
  );
}

export default function TournamentInfoCard({ tournament }: TournamentInfoCardProps) {
  const { state } = tournament;
  const [isExpanded, setIsExpanded] = useState(true);
  const [showChipChop, setShowChipChop] = useState(false);
  const currencySymbol = state.settings.currency || '£';
  const p = state.prizeStructure;

  // Prize pool calculations
  const buyInAmount = p?.buyIn || 0;
  const rebuyAmount = p?.rebuyAmount || 0;
  const addonAmount = p?.addonAmount || 0;
  const rakePercentage = p?.rakePercentage || 0;
  const rakeType = p?.rakeType || 'percentage';

  const totalRebuys = state.players.reduce((sum, pl) => sum + (pl.rebuys || 0), 0);
  const totalAddons = state.players.reduce((sum, pl) => sum + (pl.addons || 0), 0);

  const { gross: grossPrizePool, rake: rakeAmount, net: totalPrizePool } = calculatePrizePool({
    buyIn: buyInAmount,
    playerCount: state.players.length,
    totalRebuys, rebuyAmount,
    totalAddons, addonAmount,
    rakeType, rakePercentage,
    rakeAmount: p?.rakeAmount || 0,
  });

  // Chip stats
  const startingChips = p?.startingChips || 10000;
  const rebuyChips = p?.rebuyChips || startingChips;
  const addonChips = p?.addonChips || startingChips;
  const totalChips = (startingChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
  const activePlayers = state.players.filter(p => p.isActive !== false);
  const avgStack = activePlayers.length > 0 ? Math.floor(totalChips / activePlayers.length) : 0;

  // Winner detection
  const eliminatedPlayers = state.players.filter(p => p.isActive === false);
  const tournamentFinished = activePlayers.length === 1 && eliminatedPlayers.length > 0;
  const winner = tournamentFinished ? activePlayers[0] : null;

  const ordinal = (n: number) => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

  return (
    <Card className="card-glass-purple rounded-xl">
      <CardContent className="p-5">
        {/* Header — tappable to expand/collapse */}
        <div className="flex items-center justify-between mb-0">
          <button
            className="flex-1 flex items-center gap-2 text-left"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Trophy className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
              Tournament Info
            </span>
            {state.players.length > 0 && (
              <span className="text-xs text-muted-foreground ml-1">
                · {activePlayers.length} active · {currencySymbol}{totalPrizePool.toLocaleString()} pool
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            {activePlayers.length >= 2 && totalPrizePool > 0 && (
              <button
                onClick={() => setShowChipChop(true)}
                className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors px-2 py-1 rounded-md hover:bg-orange-500/10"
                title="Chip Chop Calculator"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Chop</span>
              </button>
            )}
            <button onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
              }
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-1 fade-in">
            {/* Winner banner */}
            {winner && (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <div className="text-yellow-400 font-bold text-lg">🏆 {winner.name}</div>
                <div className="text-xs text-yellow-300/70 mt-0.5">Tournament Winner</div>
              </div>
            )}

            {/* Players summary */}
            <SectionDivider icon={Users} title="Players" color="text-blue-400" />
            <InfoRow label="Registered" value={state.players.length} />
            <InfoRow label="Active" value={activePlayers.length} />
            {eliminatedPlayers.length > 0 && (
              <InfoRow label="Eliminated" value={eliminatedPlayers.length} />
            )}

            {/* Prize pool */}
            <SectionDivider icon={Coins} title="Prize Pool" color="text-green-400" />
            <InfoRow label={`Buy-in (× ${state.players.length})`} value={`${currencySymbol}${(buyInAmount * state.players.length).toLocaleString()}`} />
            {p?.enableBounties && (p?.bountyAmount || 0) > 0 && (
              <InfoRow label="Bounty per KO" value={`${currencySymbol}${p.bountyAmount}`} />
            )}
            {totalRebuys > 0 && (
              <InfoRow
                label={`Rebuys (${totalRebuys} × ${currencySymbol}${rebuyAmount})`}
                value={`${currencySymbol}${(rebuyAmount * totalRebuys).toLocaleString()}`}
              />
            )}
            {totalAddons > 0 && (
              <InfoRow
                label={`Add-ons (${totalAddons} × ${currencySymbol}${addonAmount})`}
                value={`${currencySymbol}${(addonAmount * totalAddons).toLocaleString()}`}
              />
            )}
            {rakeAmount > 0 && (
              <>
                <InfoRow label="Gross Collected" value={`${currencySymbol}${grossPrizePool.toLocaleString()}`} />
                <InfoRow
                  label={`Rake ${rakeType === 'percentage' ? `(${rakePercentage}%)` : '(fixed)'}`}
                  value={`-${currencySymbol}${rakeAmount.toLocaleString()}`}
                />
              </>
            )}
            <InfoRow label="Net Prize Pool" value={`${currencySymbol}${totalPrizePool.toLocaleString()}`} highlight />

            {/* Prize distribution */}
            {p?.manualPayouts && p.manualPayouts.length > 0 && totalPrizePool > 0 && (
              <>
                <SectionDivider icon={Trophy} title="Payouts" color="text-yellow-400" />
                {p.manualPayouts.map((payout, i) => {
                  const amount = Math.floor(totalPrizePool * payout.percentage / 100);
                  const winnerForPosition = state.players.find(pl => pl.position === i + 1);
                  return (
                    <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-muted-foreground">
                        {ordinal(i + 1)} ({payout.percentage}%)
                        {winnerForPosition && (
                          <span className="ml-1.5 text-foreground font-medium">— {winnerForPosition.name}</span>
                        )}
                      </span>
                      <span className="font-mono text-green-400">{currencySymbol}{amount.toLocaleString()}</span>
                    </div>
                  );
                })}
              </>
            )}

            {/* Chips */}
            <SectionDivider icon={Zap} title="Chips" color="text-orange-400" />
            <InfoRow label="Starting Stack" value={startingChips.toLocaleString()} />
            {totalChips !== startingChips * state.players.length && (
              <InfoRow label="Total Chips in Play" value={totalChips.toLocaleString()} />
            )}
            {activePlayers.length > 0 && (
              <InfoRow label="Average Stack" value={avgStack.toLocaleString()} highlight />
            )}

            {/* Rebuy info */}
            {p?.allowRebuys && (
              <>
                <SectionDivider icon={RefreshCw} title="Rebuys" color="text-purple-400" />
                <InfoRow label="Rebuy Period" value={`First ${p.rebuyPeriodLevels || 3} levels`} />
                <InfoRow label="Rebuy Cost" value={`${currencySymbol}${p.rebuyAmount || 0}`} />
                <InfoRow label="Rebuy Chips" value={(p.rebuyChips || 10000).toLocaleString()} />
                <InfoRow label="Max Rebuys" value={p.maxRebuys ? String(p.maxRebuys) : 'Unlimited'} />
                <InfoRow label="Rebuys Used" value={totalRebuys} />
              </>
            )}

            {/* Add-on info */}
            {p?.allowAddons && (
              <>
                <SectionDivider icon={Coins} title="Add-ons" color="text-teal-400" />
                <InfoRow label="Available from Level" value={p.addonAvailableLevel || 6} />
                <InfoRow label="Add-on Cost" value={`${currencySymbol}${p.addonAmount || 0}`} />
                <InfoRow label="Add-on Chips" value={(p.addonChips || 10000).toLocaleString()} />
                <InfoRow label="Add-ons Used" value={totalAddons} />
              </>
            )}
          </div>
        )}
      </CardContent>

      <ChipChopCalculator
        open={showChipChop}
        onClose={() => setShowChipChop(false)}
        players={activePlayers}
        payouts={p?.manualPayouts?.map((po: any) => po.amount || po) || []}
        prizePool={totalPrizePool}
      />
    </Card>
  );
}