import { useState, useEffect, useRef, useMemo } from 'react';
import { ordinal } from '@/lib/ordinal';
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp, Trophy, Users, Coins, RefreshCw, Zap, Calculator, LogIn, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";
import { isUnlimited, lateEntryOpen } from '@/lib/entryLimits';
import { gameTypeIsLocked, standaloneSettings } from '@/lib/tournamentMode';
import { gameIsOver, winnerOf } from '@/lib/gameOver';
import { payoutsOf } from '@/lib/payoutTemplates';
import { countEntries, payoutAmount, prizePoolFor } from '@/lib/prizePool';
import { gameNumberFor } from "@/lib/seasonProgress";
import ChipChopCalculator from './ChipChopCalculator';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { currencyOf } from '@/lib/currency';

interface TournamentInfoCardProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  league: ReturnType<typeof useLeague>['league'];
  userLeagues?: ReturnType<typeof useLeague>['userLeagues'];
  leaguePlayers?: ReturnType<typeof useLeague>['leaguePlayers'];
  switchLeague?: ReturnType<typeof useLeague>['switchLeague'];
  currentSeason: ReturnType<typeof useSeasons>['currentSeason'];
  seasons: ReturnType<typeof useSeasons>['seasons'];
  gameNumber?: number | null;
  totalGames?: number;
}

type TournamentProp = TournamentInfoCardProps['tournament'];
type SharedLeagueProps = Omit<TournamentInfoCardProps, 'tournament'>;


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

// The selected side of the mode toggle. These were inline style objects
// hard-coding rgba(249,115,22,…) — the .btn-* gradient pattern in JavaScript
// form, which is how it survived the sweep of the CSS ones.
const modeButton = 'inline-flex items-center justify-center rounded-sm px-3 py-1 text-label font-medium transition-colors border';
const modeActive = 'bg-primary/10 text-primary border-primary/30';
const modeInactive = 'border-transparent text-muted-foreground hover:text-foreground';

export function TournamentModeToggle({ tournament, league, leaguePlayers = [], currentSeason, seasons }: { tournament: TournamentProp } & Pick<SharedLeagueProps, 'league' | 'leaguePlayers' | 'currentSeason' | 'seasons'>) {
  const { state, updateTournamentDetails, updateSettings } = tournament;

  const isLeagueMode =
    state.details?.type === 'season' ||
    state.settings?.isSeasonTournament === true;

  // `details.type` is OVERLOADED: it says both "league or standalone" and "saved
  // to Firestore". Writing the first meaning over the second un-saved the game —
  // the Firestore listener only attaches for 'database', so it tore down,
  // hasLoadedRemoteState reset, and the three sync effects that wait on it went
  // quiet. A removed player then came back from the document on the next
  // snapshot, and re-adding produced a duplicate.
  //
  // League-ness is carried by `settings.isSeasonTournament`, which every reader
  // of isLeagueMode already honours, so the type is a redundant second copy of
  // it. A stored game keeps 'database'.
  const setMode = (localType: 'season' | 'standalone') => {
    if (state.details?.type !== 'database') {
      updateTournamentDetails({ ...state.details, type: localType });
    }
  };

  const handleEnableLeague = () => {
    if (gameTypeIsLocked(state.players)) return;
    setMode('season');
    if (league?.id) {
      updateSettings({ isSeasonTournament: true, leagueId: String(league.id) });
    }
  };

  const storedSeasonId = state.settings?.seasonId;
  const displaySeason = storedSeasonId
    ? ((seasons as any[]).find(s => String(s.id) === String(storedSeasonId)) ?? currentSeason)
    : currentSeason;

  const gameNumber = useMemo(
    () => (isLeagueMode && displaySeason
      ? gameNumberFor(displaySeason.id, leaguePlayers, state.details?.localGameId)
      : null),
    [isLeagueMode, displaySeason?.id, leaguePlayers, state.details?.localGameId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalGames = displaySeason?.numberOfGames || 12;

  /**
   * Once a player has busted, what KIND of game this is stops being a free
   * choice — see gameTypeIsLocked. League result recording gates on the flag
   * this toggle writes and back-fills every elimination so far, so flipping
   * mid-game wrote a whole standalone night into whichever league was selected.
   * The reverse abandons results already recorded. Locked both ways.
   */
  const typeLocked = gameTypeIsLocked(state.players);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex items-center bg-muted p-1 rounded-md flex-shrink-0"
        title={typeLocked ? 'This game has started, so its type is fixed.' : undefined}
      >
        <button
          disabled={typeLocked}
          className={cn(modeButton, !isLeagueMode ? modeActive : modeInactive, typeLocked && 'opacity-50 cursor-not-allowed')}
          onClick={() => {
            if (typeLocked) return;
            setMode('standalone');
            // standaloneSettings() clears the whole league context, not just
            // the flag — see lib/tournamentMode.ts. The next-game dialog's
            // one-off path writes the same thing.
            updateSettings(standaloneSettings());
          }}
        >
          Standalone
        </button>
        <button
          disabled={typeLocked}
          className={cn(modeButton, isLeagueMode ? modeActive : modeInactive, typeLocked && 'opacity-50 cursor-not-allowed')}
          onClick={handleEnableLeague}
        >
          League
        </button>
      </div>
      {/* Say why, rather than leaving a dead control. An unexplained disabled
          button is what sent a director to ask what the slider does. */}
      {typeLocked && (
        <span className="text-caption text-muted-foreground">
          This game has started, so its type is fixed.
        </span>
      )}
      {/* The only copy of this line. TournamentInfoCard's header printed the
          identical sentence in the identical colour, so in league mode the same
          fact appeared twice on one screen. Beside the toggle is the better
          home: "League" and "Spring 2026 · Game 4 of 13" read as one statement. */}
      {isLeagueMode && gameNumber !== null && (
        <span className="text-label font-medium text-primary truncate min-w-0">
          {displaySeason?.name && `${displaySeason.name} · `}Game {gameNumber} of {totalGames}
        </span>
      )}
    </div>
  );
}

export default function TournamentInfoCard({ tournament, league, leaguePlayers = [], currentSeason, seasons, gameNumber: gameNumberProp, totalGames: totalGamesProp }: TournamentInfoCardProps) {
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

  // Prefer the value computed by the parent (PokerTimer) to guarantee consistency
  // with TournamentModeToggle, which is also computed there from the same data.
  const gameNumber = gameNumberProp !== undefined ? gameNumberProp : null;
  const totalGames = totalGamesProp ?? displaySeason?.numberOfGames ?? 12;

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

  const sym = currencyOf(state.settings);
  const p = state.prizeStructure;
  const buyIn = p?.buyIn || 0;
  const rebuyAmt = p?.rebuyAmount || 0;
  const addonAmt = p?.addonAmount || 0;
  const rakeType = p?.rakeType || 'percentage';
  const rakePct = p?.rakePercentage || 0;
  const { totalRebuys, totalAddons, totalReEntries } = countEntries(state.players);

  const { rake, net: pool } = prizePoolFor(state.players, p);

  // What each paid position is worth, derived once. The Payouts list below and
  // the chop calculator both read this — they used to compute it separately
  // from the same two inputs, which is how two figures for one number start.
  const payoutAmounts = useMemo(
    () => payoutsOf(p).map((po) => payoutAmount(pool, po.percentage)),
    [p?.manualPayouts, pool],
  );

  const startChips = p?.startingChips || 10000;
  const rebuyChips = p?.rebuyChips || startChips;
  const addonChips = p?.addonChips || startChips;
  const totalChips = (startChips * state.players.length) + (rebuyChips * totalRebuys) + (addonChips * totalAddons);
  const active = state.players.filter(pl => pl.isActive !== false);
  const eliminated = state.players.filter(pl => pl.isActive === false);
  const avg = active.length > 0 ? Math.floor(totalChips / active.length) : 0;
  // At the true end of a game EVERY player is inactive, the winner included —
  // eliminatePlayer awards position 1 and isActive: false in the same update.
  // So `active.length === 1` is zero exactly when this card should appear, and
  // it never did. lib/gameOver.ts answers this once, for the three screens that
  // all had it wrong.
  const winner = gameIsOver(state.players) ? winnerOf(state.players) : null;

  const fmt = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n/1000).toFixed(0)}k` : String(n);

  // Raised: it sits directly under the timer and holds the money — the one card
  // on the console that earns the extra elevation.
  return (
    <Card variant="raised" className="rounded-xl">
      <CardContent className="p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Tournament Info</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsExpanded(v => !v)}>
              {isExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* What KIND of game this is, which is as much this card's business as the
            prize pool: it lived in the Tournament Setup card, where flipping it
            summoned the league panel below a very tall card, off-screen. The
            league panel now sits directly beneath this card.

            Outside the collapse on purpose — folding the body away must not take
            the mode control with it. */}
        <div className="mt-3">
          <TournamentModeToggle
            tournament={tournament}
            league={league}
            leaguePlayers={leaguePlayers}
            currentSeason={currentSeason}
            seasons={seasons}
          />
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">

            {/* Winner */}
            {winner && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-center">
                <div className="text-yellow-400 font-bold text-lg flex items-center justify-center gap-2">
                  <Trophy className="h-5 w-5" />
                  {winner.name}
                </div>
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-yellow-400">Payouts</span>
                  </div>
                  {active.length >= 2 && (
                    <button
                      onClick={() => setShowChipChop(true)}
                      className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 px-2 py-1 rounded-md hover:bg-orange-500/10 transition-colors"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      Chop
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {p.manualPayouts.map((po: any, i: number) => {
                    const amount = payoutAmounts[i] || 0;
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

              {/* Late entry, stated where the director will read it.
                  
                  Shown only when a window was actually set — "all game" is the
                  default and saying so on every tournament is noise. The app
                  backs this up: adding a player after it closes warns first
                  (see attemptAddPlayer in PlayerSection), because printing a
                  window and then ignoring it silently is exactly what the rebuy
                  and re-entry periods did for years. */}
              {!isUnlimited(p?.lateEntryLevels) && (
                <div className="mt-2 rounded-lg border border-orange-400/20 bg-orange-400/5 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="h-3.5 w-3.5 text-orange-400" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-orange-400">Late entry</span>
                  </div>
                  <DetailRow
                    label={lateEntryOpen(p, state.currentLevel) ? 'Closes after' : 'Closed after'}
                    value={`Level ${p!.lateEntryLevels}`}
                    compact
                  />
                  <DetailRow
                    label="Status"
                    value={lateEntryOpen(p, state.currentLevel) ? 'Open' : 'Closed'}
                    compact
                  />
                </div>
              )}

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
                      {!isUnlimited(p?.maxReEntries) && <DetailRow label="Max / player" value={p!.maxReEntries!} compact />}
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
        payouts={payoutAmounts}
        currencySymbol={sym}
      />
    </Card>
  );
}
