import type { Player } from '@/types';

/**
 * How an incoming tournament snapshot's players array meets the one on screen.
 *
 * WHY THIS IS A MODULE: these four rules decide whether a night's roster
 * survives, and until they were moved here they had no test at all. They lived
 * inline in `useTournament`'s `onSnapshot` callback, where they could not be
 * reached without a Firestore mock.
 *
 * **The default is deliberately biased toward LOCAL**, and that is correct for
 * the device driving the game: the console applies a bust-out optimistically and
 * the echo of its own write arrives moments later, so a snapshot that simply
 * replaced the roster would undo every action the instant it came back. The
 * comment the original carried — "CRITICAL: Protect eliminated players from
 * being restored by sync" — is the whole reason.
 *
 * **But bias toward local is only safe while local is the truth**, which stops
 * being so the moment this device stands down. See `adopt` below.
 */

export interface MergeOptions {
  /**
   * Take the incoming array verbatim, bypassing every rule below.
   *
   * Set on exactly one transition: this device has been READ-ONLY and has just
   * taken control (`shouldAdoptRemote` in `lib/directorControl.ts` owns that
   * decision). While it was standing down, someone else was driving, so its
   * local roster is not an optimistic update waiting to be confirmed — it is
   * simply stale, and the merge rules would push that staleness back into the
   * live game.
   *
   * The divergence is otherwise STICKY: the rules run on every snapshot, so a
   * read-only console that was prodded once keeps its phantom elimination for
   * the rest of the night, and `Take control` writes it over the real game.
   *
   * This is the clean slate the old handover got from a full page load on
   * sign-out — CLAUDE.md records that reload as load-bearing, and `Take control`
   * has no reload to lean on.
   */
  adopt?: boolean;
}

export function mergePlayersFromSnapshot(
  currentPlayers: Player[] | null | undefined,
  incomingPlayers: unknown,
  options: MergeOptions = {},
): Player[] {
  const current = Array.isArray(currentPlayers) ? currentPlayers : [];

  // Not an array means the document said nothing about players — keep what is
  // on screen rather than emptying the roster.
  if (!Array.isArray(incomingPlayers)) return current;

  // A clean slate. Nothing local survives, which is the point.
  if (options.adopt) return incomingPlayers as Player[];

  const merged = (incomingPlayers as any[]).map((incomingPlayer: any) => {
    const currentPlayer = current.find(p => p.id === incomingPlayer.id);

    // Eliminated locally, active in the document: keep the elimination. The
    // console busts a player out optimistically and this stops the echo
    // resurrecting them before the write lands.
    if (currentPlayer && (currentPlayer as any).isActive === false && incomingPlayer.isActive !== false) {
      return currentPlayer;
    }

    // Eliminated in the document, active locally: allow it. Another device, or
    // this one before a reload, busted them out.
    if (currentPlayer && (currentPlayer as any).isActive !== false && incomingPlayer.isActive === false) {
      return incomingPlayer;
    }

    // Both active: preserve the counts that only ever go up, which may not have
    // been flushed to Firestore yet.
    if (currentPlayer && (currentPlayer as any).isActive !== false) {
      return {
        ...incomingPlayer,
        knockouts: Math.max(incomingPlayer.knockouts || 0, (currentPlayer as any).knockouts || 0),
        rebuys: Math.max(incomingPlayer.rebuys || 0, (currentPlayer as any).rebuys || 0),
        reEntries: Math.max(incomingPlayer.reEntries || 0, (currentPlayer as any).reEntries || 0),
        prizeMoney: (currentPlayer as any).prizeMoney || incomingPlayer.prizeMoney || 0,
      };
    }

    return incomingPlayer;
  });

  // A player on screen that the document has never heard of is kept — they were
  // added locally and the write has not landed.
  const incomingIds = new Set((incomingPlayers as any[]).map((p: any) => p.id));
  const missing = current.filter(p => !incomingIds.has(p.id));

  return [...merged, ...missing] as Player[];
}
