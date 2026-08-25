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
