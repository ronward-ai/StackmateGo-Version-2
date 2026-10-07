import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useLeague } from '@/hooks/useLeague';
import { useSeasons } from '@/hooks/useSeasons';
import { countGamesPlayed, nextGameNumber, nextGameLabel, nextGameState } from '@/lib/seasonProgress';
import { useSeasonSetup } from '@/hooks/useSeasonSetup';
import { useNewGame } from '@/hooks/useNewGame';
import type { AccountLiveGame } from '@/hooks/useAccountLiveGame';

/**
 * Starting the next game — the ONLY implementation of it.
 *
 * It used to live inside TournamentInfoCard as `TournamentNewButton`, mounted
 * in the Tournament Setup card's header. That is the wrong neighbourhood in
 * league mode: moving to the next game of a season is league business, and the
 * control sat two sections below the league panel with a block of banners in
 * between. It now mounts in LeagueSection's header for a league game, and stays
 * in the setup card for a standalone one, where there is no league panel to
 * hold it. One component, mounted once either way — `lib/tournamentDocument.ts`
 * is the single creation path and two ways to start a game is the trap this
 * codebase has already paid for.
 *
 * THE NEXT GAME IS NOT ALWAYS THIS SEASON'S NEXT GAME — a weekly league night
 * is quite often followed by a casual one somewhere else. Picking a different
 * LEAGUE belongs here, and the picker does it. Going standalone does NOT: that
 * is a change of the game's type, which is what the mode slider is for, and it
 * lives there (see `modeLockReason` in lib/tournamentMode.ts). A third button
 * in this dialog was tried and removed — a director whose league night has
 * ended reaches for the slider, not for a dialog called "start next league
 * game".
 *
 * The new game itself comes from `useNewGame`, shared with that slider, so
 * there is still one implementation of starting a game however it is asked for.
 */
interface NextGameControlProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  league: ReturnType<typeof useLeague>['league'];
  userLeagues?: ReturnType<typeof useLeague>['userLeagues'];
  leaguePlayers?: ReturnType<typeof useLeague>['leaguePlayers'];
  switchLeague: ReturnType<typeof useLeague>['switchLeague'];
  currentSeason: ReturnType<typeof useSeasons>['currentSeason'];
  seasons: ReturnType<typeof useSeasons>['seasons'];
  /** The account's live game when another device is running it — the guard. */
  otherLiveGame?: AccountLiveGame | null;
}

export default function NextGameControl({
  tournament,
  league,
  userLeagues = [],
  switchLeague,
  leaguePlayers = [],
  currentSeason,
  seasons,
  otherLiveGame,
}: NextGameControlProps) {
  const { state, updateSettings } = tournament;
  const { startNewGame, newGameGuard } = useNewGame(tournament, otherLiveGame, league?.name);
  const [dialogLeagueId, setDialogLeagueId] = useState<string | null>(null);
  const { seasons: dialogSeasonsList, isLoading: dialogSeasonsLoading } = useSeasons({ leagueId: dialogLeagueId ?? undefined });
  const [showLeagueNewDialog, setShowLeagueNewDialog] = useState(false);
  const [dialogSeasonId, setDialogSeasonId] = useState<string | number | null>(null);

  const isLeagueMode =
    state.details?.type === 'season' ||
    state.settings?.isSeasonTournament === true;

  const storedSeasonId = state.settings?.seasonId;
  const storedSeason = storedSeasonId
    ? ((seasons as any[]).find(s => String(s.id) === String(storedSeasonId)) ?? currentSeason)
    : currentSeason;
  /**
   * The season a next game defaults to. The game on screen carries the season it
   * was played in — and once that season has been ENDED, defaulting to it is how
   * "Game 13 of 12" was offered. If the league has since moved on, its current
   * season is the honest default.
   */
  const displaySeason = (storedSeason as any)?.status === 'completed'
    && currentSeason && (currentSeason as any).status !== 'completed'
    ? currentSeason
    : storedSeason;

  const handleLeagueNewGame = (seasonId: string | number | null) => {
    const sourceSeasons = dialogSeasonsList.length > 0 ? dialogSeasonsList : (seasons as any[]);
    const chosenSeason = (sourceSeasons as any[]).find(s => String(s.id) === String(seasonId));
    // An ENDED season takes no next game. The dialog offers no button for it;
    // this is the rule at the action, so a future caller cannot walk round it.
    if (chosenSeason && nextGameState(chosenSeason, 0) === 'ended') return;
    setShowLeagueNewDialog(false);
    // Passed as the continuation rather than written after the call: if the
    // guard defers the start, this must defer with it. Writing the league and
    // season against a game that was never reset is the half-applied state the
    // continuation exists to prevent.
    // The season goes INTO the reset, not into the continuation: from the
    // director route the continuation's setState never commits (Oct H3).
    startNewGame({
      keepStructure: true,
      settings: chosenSeason ? {
        isSeasonTournament: true,
        leagueId: String(dialogLeagueId ?? league?.id ?? ''),
        seasonId: String(chosenSeason.id),
        seasonName: chosenSeason.name,
        numberOfGames: chosenSeason.numberOfGames || 12,
      } : undefined,
    }, () => {
      // switchLeague persists its own scoped key synchronously, so it survives
      // the remount.
      if (dialogLeagueId && String(dialogLeagueId) !== String(league?.id)) {
        switchLeague(dialogLeagueId);
      }
    });
  };

  /**
   * The number the NEXT game will carry — `nextGameNumber`, never `gameNumberFor`.
   *
   * This button used to read the latter, which answers "which game is the one
   * in progress". That is right for the headers and wrong here: after game 1
   * had been played and was still on screen, the dialog offered "Start Game 1".
   */
  const dialogGameNumber = useMemo(() => {
    if (!dialogSeasonId) return displaySeason ? nextGameNumber(displaySeason.id, leaguePlayers) : null;
    // leaguePlayers covers the CURRENT league only, so counting another
    // league's games with it would be wrong rather than merely stale.
    if (dialogLeagueId && String(dialogLeagueId) !== String(league?.id)) return null;
    return nextGameNumber(dialogSeasonId, leaguePlayers);
  }, [dialogSeasonId, dialogLeagueId, league?.id, leaguePlayers, displaySeason?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalGames = displaySeason?.numberOfGames || 12;

  const dialogTotalGames = useMemo(() => {
    const dialogSeason = (dialogSeasonsList as any[]).find(s => String(s.id) === String(dialogSeasonId))
      || (seasons as any[]).find(s => String(s.id) === String(dialogSeasonId));
    return dialogSeason?.numberOfGames || totalGames;
  }, [dialogSeasonId, dialogSeasonsList, seasons, totalGames]);

  const sameLeague = !dialogLeagueId || String(dialogLeagueId) === String(league?.id);

  /** The season the dialog is about to start a game in. */
  const targetSeason: any = useMemo(() => {
    const id = dialogSeasonId ?? displaySeason?.id;
    return (dialogSeasonsList as any[]).find(s => String(s.id) === String(id))
      || (seasons as any[]).find(s => String(s.id) === String(id))
      || (String(displaySeason?.id) === String(id) ? displaySeason : null);
  }, [dialogSeasonId, dialogSeasonsList, seasons, displaySeason]);

  /**
   * Ended, full or open — `lib/seasonProgress.ts` decides. Only for the CURRENT
   * league: `leaguePlayers` cannot count another league's games, which is why the
   * game number already reads "Game — of —" there.
   */
  const seasonState = sameLeague && targetSeason
    ? nextGameState(targetSeason, countGamesPlayed(targetSeason.id, leaguePlayers))
    : 'open';

  // Start next season leads to the season set-up — Manage League → Seasons →
  // New Season — where the director says how the new season runs. Present
  // whenever this renders inside the league panel, which is the only place an
  // ended or full season can reach this dialog.
  const openSeasonSetup = useSeasonSetup();

  return (
    <>
      {newGameGuard}
      {isLeagueMode ? (
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => {
            setDialogLeagueId(league?.id ? String(league.id) : null);
            setDialogSeasonId(displaySeason?.id ?? null);
            setShowLeagueNewDialog(true);
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-label">Next Game</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
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
                onClick={() => startNewGame({ keepStructure: true })}
              >
                Keep structure
              </AlertDialogAction>
              <AlertDialogAction onClick={() => startNewGame({ keepStructure: false })}>
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
                const allSeasons = (dialogSeasonsList as any[]).length > 0
                  ? (dialogSeasonsList as any[])
                  : (seasons as any[]);
                // An ENDED season cannot take a next game, so it is not offered
                // as somewhere to put one.
                const displaySeasons = allSeasons.filter(s => nextGameState(s, 0) !== 'ended');
                const choice = displaySeasons.length > 1
                  || (displaySeasons.length === 1 && seasonState === 'ended');
                return choice ? (
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
                    {targetSeason?.name ?? displaySeasons[0]?.name ?? displaySeason?.name ?? '—'}
                  </p>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="dialog-game" className="text-sm font-medium text-foreground">Game</label>
              <div id="dialog-game" className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-orange-400 px-1">
                  {seasonState === 'ended'
                    ? '—'
                    : dialogGameNumber != null
                      ? nextGameLabel(dialogGameNumber, dialogTotalGames)
                      : 'Game — of —'}
                </span>
                <span className="text-xs text-muted-foreground">· auto-calculated</span>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {seasonState === 'open' ? (
              <Button
                className="w-full"
                disabled={dialogSeasonsLoading || (dialogLeagueId !== null && String(dialogLeagueId) !== String(league?.id) && dialogSeasonsList.length === 0)}
                onClick={() => handleLeagueNewGame(targetSeason?.id ?? dialogSeasonId)}
              >
                {dialogGameNumber != null ? `Start Game ${dialogGameNumber}` : 'Start Next Game'}
              </Button>
            ) : (
              /* Ended: the only way forward. Full: the obvious one, with the extra
                 game below it. Either way it opens the season set-up in Manage
                 League, where the new season is made and becomes current; Next
                 Game then offers its Game 1. */
              <>
                <p className="text-label text-muted-foreground text-center">
                  {seasonState === 'ended'
                    ? `${targetSeason?.name ?? 'This season'} has ended.`
                    : `All ${targetSeason?.numberOfGames} games of ${targetSeason?.name ?? 'this season'} have been played.`}
                </p>
                {openSeasonSetup && (
                  <Button
                    className="w-full"
                    onClick={() => { setShowLeagueNewDialog(false); openSeasonSetup(); }}
                  >
                    Start next season
                  </Button>
                )}
                {seasonState === 'full' && dialogGameNumber != null && (
                  <button
                    onClick={() => handleLeagueNewGame(targetSeason?.id ?? dialogSeasonId)}
                    className="text-xs text-muted-foreground hover:text-foreground text-center py-1"
                  >
                    Play an extra game in {targetSeason?.name ?? 'this season'} · {nextGameLabel(dialogGameNumber, dialogTotalGames)}
                  </button>
                )}
              </>
            )}
            {/* No "Full reset" here. Going standalone is a change of the game's
                type and lives on the mode slider; a dialog about the next LEAGUE
                game is the wrong place for it — the same reason a "One-off game"
                button was removed from it. */}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
