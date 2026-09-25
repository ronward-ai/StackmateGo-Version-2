/**
 * Decides whether a tournament should be treated as a league (season) game.
 *
 * Extracted from RealTimeLeagueTable so the precedence is testable, after a bug
 * where spectators saw a league standings table on a tournament the director had
 * explicitly set to Standalone.
 *
 * The precedence that matters:
 *
 *  1. An explicit flag wins, in either direction. `false` means standalone and
 *     must not be overridden.
 *  2. Only when no flag is present at all do we infer from leagueId. That
 *     fallback exists for a real race: a participant can scan the QR before
 *     isSeasonTournament has been written to the Firestore document, and
 *     leagueId is the earlier signal.
 *
 * The original expression was
 *
 *   isSeasonTournament === true || settings.isSeasonTournament === true || !!leagueId
 *
 * which let a stale leagueId beat an explicit `false` — and leagueId was stale
 * precisely because the Standalone toggle cleared the flag without clearing it.
 */
import { gameIsOver } from './gameOver';

export interface TournamentModeInput {
  /** Flag as stored on the tournament document itself. */
  isSeasonTournament?: boolean;
  settings?: {
    isSeasonTournament?: boolean;
    leagueId?: string | null;
  } | null;
}

export function isLeagueTournament(tournament?: TournamentModeInput | null): boolean {
  const explicit = tournament?.isSeasonTournament ?? tournament?.settings?.isSeasonTournament;

  if (explicit === true) return true;
  if (explicit === false) return false;

  // No explicit flag — fall back to the presence of a linked league.
  return !!tournament?.settings?.leagueId;
}

/**
 * The settings that make a game standalone.
 *
 * ONE ANSWER TO "make this standalone", because there are now two ways to ask:
 * the mode toggle, and starting a one-off game from the next-game dialog — a
 * weekly league director running a single night at another venue.
 *
 * It clears the whole league context rather than only the flag. Leaving
 * `leagueId` behind is what once made spectators see a league standings table
 * on a tournament that had been switched back to Standalone: `isLeagueTournament`
 * falls back to `leagueId` when no flag is present, and a stale id beat it.
 *
 * Returns a fresh object each call — a shared literal handed to `updateSettings`
 * is a mutable value two call sites would be holding at once.
 */
export function standaloneSettings() {
  return {
    isSeasonTournament: false,
    leagueId: undefined,
    seasonId: undefined,
    seasonName: undefined,
    gameNumber: undefined,
  };
}

/** Only what deciding "has play started" needs. A `Player` satisfies it. */
export interface PlacedPlayer {
  /** A finishing position, set when a player busts. */
  position?: number | null;
  /** Cleared when a player busts — and for the winner too, at the end. */
  isActive?: boolean | null;
}

export type GameType = 'standalone' | 'league';

/**
 * Why this game's type cannot be changed to `target` — or null when it can.
 *
 * The Standalone ↔ League slider was live for the whole game, and league result
 * recording gates on nothing but the flag it writes (`PokerTimer`'s
 * `syncLeagueResults`). That effect records every eliminated player not already
 * processed, not just newly eliminated ones — so flipping to League part way
 * through a standalone night wrote the WHOLE game's bust-outs into whichever
 * league happened to be selected, silently, as real results. A director showing
 * a colleague what league mode looks like corrupted a league's standings by
 * doing it.
 *
 * THE FIRST VERSION OF THIS LOCKED BOTH DIRECTIONS FOREVER, on one question:
 * has anybody got a finishing position? True from the first bust-out and true
 * for good — so the slider was still dead on a game that had finished hours
 * ago, and a director whose league night was over could not say "the next one
 * is a casual game" in the one control that means exactly that.
 *
 * One question was covering two, and they have different answers:
 *
 *  - **A finished league game → Standalone.** Its results were written at each
 *    bust-out and are already in the standings; the game is already in History.
 *    Nothing is half-recorded, nothing is abandoned. Switching takes nothing
 *    back — it only says what the NEXT game is.
 *  - **A finished standalone game → League.** `syncLeagueResults` would
 *    back-fill that entire night into whichever league is selected, as real
 *    results with real points. That is the original catastrophe, and no amount
 *    of the game being over makes it safe.
 *
 * So: free before the first bust-out; locked both ways while the game is in
 * play; and once it is over you may stop it being a league game, but you may
 * never turn a finished game into one. **Stopping takes nothing back. Starting
 * invents a night the league never had.**
 *
 * It returns the REASON rather than a boolean because the two blocked cases are
 * different facts and an unexplained dead control is what sent a director to
 * ask what the slider does in the first place.
 */
export function modeLockReason(
  players: PlacedPlayer[] | null | undefined,
  target: GameType,
): string | null {
  if (!players || players.length === 0) return null;

  const anyoneOut = players.some(p => Number(p?.position) > 0);
  if (!anyoneOut) return null;

  if (gameIsOver(players)) {
    if (target === 'standalone') return null;
    return 'This game has finished, so it cannot be made a league game — its results would be recorded into the league.';
  }

  return 'This game has started, so its type is fixed.';
}
