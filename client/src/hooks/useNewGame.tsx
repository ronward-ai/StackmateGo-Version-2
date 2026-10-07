import { useCallback, useState } from 'react';
import { useLocation } from 'wouter';
import NewGameGuardDialog from '@/components/NewGameGuardDialog';
import { useOpenLiveGame } from '@/hooks/useOpenLiveGame';
import type { AccountLiveGame } from '@/hooks/useAccountLiveGame';
import type { Settings } from '@/types';

/**
 * Starting a fresh game — the one implementation of it.
 *
 * There are two entry points: the Next Game control, and the mode slider, which
 * starts a standalone game when a director flips a finished league night over to
 * Standalone. Two copies of these three steps is exactly the shape this codebase
 * has paid for before — `lib/tournamentDocument.ts` is the single creation path
 * for the same reason.
 *
 * `?home=1`, not "/": PokerTimer restores the pin from the signed-in user's most
 * recent live tournament, which would otherwise reopen the very game this has
 * just finished with. The flag means "I asked to be here".
 *
 * The pin is cleared BEFORE the navigation for the same reason.
 *
 * What survives is `resetTournament`'s business: with `keepStructure` it keeps
 * the levels, the prize structure and the settings, and clears the players.
 *
 * ── THE GUARD ───────────────────────────────────────────────────────────────
 *
 * `blockedBy` is the account's live game when it is being run on ANOTHER device
 * (`hooks/useAccountLiveGame.ts`). Pressing Next Game then asks first, because
 * this is the exact action that was reported: a director running game 5 on a
 * phone started a second game 5 on a laptop, and two devices minting two
 * `localGameId`s write two DOCUMENTS that no lock can reconcile.
 *
 * **One gate, here, rather than one per button.** There are five call sites
 * across two components; a check at each is what `attemptAddPlayer` and
 * `seatablePlayers()` exist to avoid — the next caller simply walks around it.
 *
 * **`after` is why the gate can live here at all.** Three of those call sites do
 * more work immediately after starting the game (switching league, writing the
 * season, forcing standalone), so deferring only the reset would leave the
 * settings written against a game that was never reset. The continuation is held
 * with the pending options and runs in the same order it does today — after the
 * navigation, not before — so a confirmed start is byte-for-byte the old path.
 *
 * **`after` must not set anything about the new GAME** — that goes in
 * `options.settings`. From the director route the navigation replaces the
 * console in the same batch, so a `setState` in `after` lands on a console that
 * is already gone (October audit, H3). Only work that persists itself
 * synchronously belongs there — `switchLeague` writes its scoped key directly.
 */
export function useNewGame(
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>,
  blockedBy?: AccountLiveGame | null,
  leagueName?: string | null,
) {
  const [, setLocation] = useLocation();
  const openLiveGame = useOpenLiveGame();
  const { resetTournament } = tournament;
  const [pending, setPending] = useState<{ keepStructure: boolean; settings?: Partial<Settings>; after?: () => void } | null>(null);

  const run = useCallback((keepStructure: boolean, settings?: Partial<Settings>, after?: () => void) => {
    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    // What the next game IS goes into the reset, not into `after`: from the
    // director route the navigation below replaces the console in the same
    // batch, so a setState made after it never commits. resetTournament writes
    // the new game's setup to storage, which the next console reads either way.
    resetTournament({ keepStructure, settings });
    setLocation('/?home=1');
    // Last, matching the order these callers have always run in: they called
    // this hook and then did their own work when it returned.
    after?.();
  }, [resetTournament, setLocation]);

  const startNewGame = useCallback((
    options?: { keepStructure?: boolean; settings?: Partial<Settings> },
    after?: () => void,
  ) => {
    const keepStructure = options?.keepStructure ?? true;
    if (blockedBy) {
      setPending({ keepStructure, settings: options?.settings, after });
      return;
    }
    run(keepStructure, options?.settings, after);
  }, [blockedBy, run]);

  /**
   * Rendered by the caller. A hook cannot put it on screen itself, and the
   * alternative — a check in each component — is the thing the single gate
   * above exists to prevent.
   */
  const newGameGuard = (
    <NewGameGuardDialog
      game={blockedBy ?? null}
      open={!!pending}
      leagueName={leagueName}
      onCancel={() => setPending(null)}
      onOpenOther={id => { setPending(null); openLiveGame(id); }}
      onProceed={() => {
        const p = pending;
        setPending(null);
        if (p) run(p.keepStructure, p.settings, p.after);
      }}
    />
  );

  return { startNewGame, newGameGuard };
}
