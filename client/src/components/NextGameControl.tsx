import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
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
import { nextGameNumber } from '@/lib/seasonProgress';
import { standaloneSettings } from '@/lib/tournamentMode';

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
 * THE NEXT GAME IS NOT ALWAYS THIS SEASON'S NEXT GAME. A weekly league night is
 * quite often followed by a one-off somewhere else, or by a different league's
 * game. Picking another league already worked; going standalone did not — the
 * only route out was a link reading "Full reset (clears structure & switches to
 * standalone)", which bundles two unrelated things and made a director throw
 * away their blind structure and buy-in to run one casual night. Those are
 * separate choices now.
 */
interface NextGameControlProps {
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>;
  league: ReturnType<typeof useLeague>['league'];
  userLeagues?: ReturnType<typeof useLeague>['userLeagues'];
  leaguePlayers?: ReturnType<typeof useLeague>['leaguePlayers'];
  switchLeague: ReturnType<typeof useLeague>['switchLeague'];
  currentSeason: ReturnType<typeof useSeasons>['currentSeason'];
  seasons: ReturnType<typeof useSeasons>['seasons'];
}

export default function NextGameControl({
  tournament,
  league,
  userLeagues = [],
  switchLeague,
  leaguePlayers = [],
  currentSeason,
  seasons,
}: NextGameControlProps) {
  const { state, resetTournament, updateSettings, updateTournamentDetails } = tournament;
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
    // ?home=1, not "/": PokerTimer restores the pin from the signed-in user's
    // most recent live tournament, which would otherwise reopen the very game
    // this button just finished with. The flag means "I asked to be here".
    setLocation('/?home=1');
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

  /**
   * A one-off that is not part of any league — keeping the blinds, the buy-in
   * and the payouts, because wanting to run a casual night at another venue is
   * not the same as wanting factory settings.
   *
   * `resetTournament` preserves `details.type: 'season'` for a league game, so
   * the type has to be written down as well as the settings; `standaloneSettings()`
   * is the same clearing the mode toggle does, from one place.
   */
  const handleOneOffGame = () => {
    setShowLeagueNewDialog(false);
    handleNewTournament(true);
    if (state.details?.type !== 'database') {
      updateTournamentDetails({ ...state.details, type: 'standalone' });
    }
    updateSettings(standaloneSettings());
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

  return (
    <>
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
            {/* Not "Start next league game": one of the three things this
                dialog offers is deliberately not a league game at all. */}
            <DialogTitle>Start the next game</DialogTitle>
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
            {/* The one-off. Keeps the structure, which is the whole point of it
                being separate from the reset below. */}
            <Button variant="outline" className="w-full" onClick={handleOneOffGame}>
              One-off game, not in a league
            </Button>
            <button
              onClick={() => { setShowLeagueNewDialog(false); handleNewTournament(false); }}
              className="text-xs text-destructive hover:text-destructive/80 text-center py-1"
            >
              Full reset (back to default blinds and buy-in)
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
