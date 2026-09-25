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
  position?: number;
}

/**
 * Is the game's TYPE now fixed — standalone or league, settled?
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
 * Flipping back does not undo it: the removal path only fires for a player who
 * becomes active again, which is a rebuy, not a mode change. And the reverse
 * direction is just as bad — League → Standalone abandons results already
 * written and leaves a half-recorded game in the table. One lock covers both.
 *
 * LOCKED AT THE FIRST BUST-OUT, not before. Until someone has a finishing
 * position there is nothing to back-fill, and flipping is a legitimate
 * correction: a director realising this should be tonight's league game after
 * all. It is the moment results become recordable that the decision stops being
 * free.
 */
export function gameTypeIsLocked(players?: PlacedPlayer[] | null): boolean {
  if (!players || players.length === 0) return false;
  return players.some(p => typeof p.position === 'number' && p.position > 0);
}
