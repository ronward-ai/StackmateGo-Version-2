import { useCallback } from 'react';
import { useLocation } from 'wouter';

/**
 * Starting a fresh game — the one implementation of it.
 *
 * There are two entry points now: the Next Game control, and the mode slider,
 * which starts a standalone game when a director flips a finished league night
 * over to Standalone. Two copies of these three steps is exactly the shape this
 * codebase has paid for before — `lib/tournamentDocument.ts` is the single
 * creation path for the same reason.
 *
 * `?home=1`, not "/": PokerTimer restores the pin from the signed-in user's
 * most recent live tournament, which would otherwise reopen the very game this
 * has just finished with. The flag means "I asked to be here".
 *
 * The pin is cleared BEFORE the navigation for the same reason.
 *
 * What survives is `resetTournament`'s business: with `keepStructure` it keeps
 * the levels, the prize structure and the settings, and clears the players.
 */
export function useNewGame(
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>,
) {
  const [, setLocation] = useLocation();
  const { resetTournament } = tournament;

  return useCallback((options?: { keepStructure?: boolean }) => {
    const keepStructure = options?.keepStructure ?? true;
    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    resetTournament({ keepStructure });
    setLocation('/?home=1');
  }, [resetTournament, setLocation]);
}
