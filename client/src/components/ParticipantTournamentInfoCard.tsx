import { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Trophy, Users, Coins, RefreshCw, Zap, LogIn } from 'lucide-react';
import { cn } from "@/lib/utils";
import { calculatePrizePool } from "@/lib/prizePool";

const ordinal = (n: number) => ['1st','2nd','3rd'][n-1] ?? `${n}th`;
const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}k` : String(n);

function DetailRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between font-mono py-0.5 text-xs", highlight && "font-semibold")}>
      <span className={cn("font-sans", highlight ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={highlight ? "text-primary" : ""}>{value}</span>
    </div>
  );
}

export default function ParticipantTournamentInfoCard({ tournament }: { tournament: any }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const sym = tournament.settings?.currency || '£';
  const p = tournament.prizeStructure || {};
  const buyIn = p.buyIn || 0;
  const rebuyAmt = p.rebuyAmount || 0;
  const addonAmt = p.addonAmount || 0;
  const rakeType = p.rakeType || 'percentage';
  const rakePct = p.rakePercentage || 0;

  const players = tournament.players || [];
  const totalRebuys = players.reduce((s: number, pl: any) => s + (pl.rebuys || 0), 0);
  const totalAddons = players.reduce((s: number, pl: any) => s + (pl.addons || 0), 0);
  const totalReEntries = players.reduce((s: number, pl: any) => s + (pl.reEntries || 0), 0);

  const { rake, net: pool } = calculatePrizePool({
    buyIn, playerCount: players.length,
    totalRebuys, rebuyAmount: rebuyAmt,
    totalAddons, addonAmount: addonAmt,
    totalReEntries,
    reEntryRake: p.reEntryRake ?? true,
    reEntryRakeAmount: p.reEntryRakeAmount,
    rebuyRake: p.rebuyRake || false,
    rebuyRakeAmount: p.rebuyRakeAmount,
    rakeType, rakePercentage: rakePct,
    rakeAmount: p.rakeAmount || 0,
  });

  const startChips = p.startingChips || 10000;
  const rebuyChips = p.rebuyChips || startChips;
  const addonChips = p.addonChips || startChips;
  const totalChips = (startChips * players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
  const active = players.filter((pl: any) => pl.isActive !== false);
  const eliminated = players.filter((pl: any) => pl.isActive === false);
  const avg = active.length > 0 ? Math.floor(totalChips / active.length) : 0;
  const winner = active.length === 1 && eliminated.length > 0 ? active[0] : null;

  return (
    <Card className="card-glass-purple rounded-xl">
      <CardContent className="p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Tournament Info</span>
          </div>
          <button onClick={() => setIsExpanded(v => !v)}>
            {isExpanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
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
                  {eliminated.length > 0 ? `of ${players.length} active` : 'players'}
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
            {p.manualPayouts && p.manualPayouts.length > 0 && pool > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Payouts</span>
                </div>
                <div className="space-y-1.5">
                  {p.manualPayouts.map((po: any, i: number) => {
                    const amount = Math.floor(pool * po.percentage / 100);
                    const finisher = players.find((pl: any) => pl.position === i + 1);
                    const bountyBonus = (() => {
                      if (!finisher || !p.enableBounties || !p.bountyAmount) return 0;
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

            {/* 2×2 stat grid */}
            <div className="border-t border-border/20 pt-3">
              <div className="grid grid-cols-2 gap-2">

                {/* Players */}
                <div className="rounded-lg border border-teal-400/20 bg-teal-400/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Users className="h-3.5 w-3.5 text-teal-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-teal-400">Players</span>
                  </div>
                  <DetailRow label="Registered" value={players.length} />
                  <DetailRow label="Active" value={active.length} />
                  {eliminated.length > 0 && <DetailRow label="Eliminated" value={eliminated.length} />}
                </div>

                {/* Prize Pool */}
                <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Coins className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Prize Pool</span>
                  </div>
                  <DetailRow label={`Buy-in ×${players.length}`} value={`${sym}${(buyIn * players.length).toLocaleString()}`} />
                  {totalRebuys > 0 && <DetailRow label={`Rebuys (${totalRebuys}×)`} value={`${sym}${(rebuyAmt * totalRebuys).toLocaleString()}`} />}
                  {totalAddons > 0 && <DetailRow label={`Add-ons (${totalAddons}×)`} value={`${sym}${(addonAmt * totalAddons).toLocaleString()}`} />}
                  {rake > 0 && <DetailRow label={`Rake${rakeType === 'percentage' ? ` (${rakePct}%)` : ''}`} value={`-${sym}${rake.toLocaleString()}`} />}
                  <DetailRow label="Total" value={`${sym}${pool.toLocaleString()}`} highlight />
                </div>

                {/* Chips */}
                <div className={cn(
                  "rounded-lg border border-orange-400/20 bg-orange-400/5 p-3",
                  !p.allowRebuys && "col-span-2"
                )}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Chips</span>
                  </div>
                  <DetailRow label="Starting Stack" value={startChips.toLocaleString()} />
                  {avg > 0 && <DetailRow label="Average Stack" value={avg.toLocaleString()} highlight />}
                </div>

                {/* Rebuys */}
                {p.allowRebuys && (
                  <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <RefreshCw className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Rebuys</span>
                    </div>
                    <DetailRow label="Cost" value={`${sym}${p.rebuyAmount || 0}`} />
                    <DetailRow label="Chips" value={(p.rebuyChips || 10000).toLocaleString()} />
                    <DetailRow label="Used" value={totalRebuys} />
                  </div>
                )}

                {/* Re-entries */}
                {p.allowReEntry && (
                  <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3 col-span-2">
                    <div className="flex items-center gap-1.5 mb-2">
                      <LogIn className="h-3.5 w-3.5 text-orange-400" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Re-entries</span>
                    </div>
                    <DetailRow label="Cost" value={`${sym}${p.rebuyAmount || buyIn}`} />
                    {(p.maxReEntries ?? 0) > 0 && <DetailRow label="Max / player" value={p.maxReEntries} />}
                    <DetailRow label="Used" value={totalReEntries} />
                  </div>
                )}

                {/* Add-ons */}
                {p.allowAddons && (
                  <div className="rounded-lg border border-orange-400/20 bg-orange-400/5 p-3 col-span-2">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Coins className="h-3.5 w-3.5 text-teal-400" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-teal-400">Add-ons</span>
                    </div>
                    <DetailRow label="Cost" value={`${sym}${p.addonAmount || 0}`} />
                    <DetailRow label="Chips" value={(p.addonChips || 10000).toLocaleString()} />
                    <DetailRow label="Used" value={totalAddons} />
                  </div>
                )}

                {/* Bounties */}
                {p.enableBounties && p.bountyAmount > 0 && (
                  <div className="rounded-lg border border-yellow-400/20 bg-yellow-400/5 p-3 col-span-2">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                      <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Bounties</span>
                    </div>
                    <DetailRow label="Type" value={p.bountyType === 'progressive' ? 'Progressive (PKO)' : 'Standard'} />
                    <DetailRow label="Bounty" value={`${sym}${p.bountyAmount || 0}`} />
                  </div>
                )}

              </div>
            </div>

          </div>
        )}

      </CardContent>
    </Card>
  );
}
