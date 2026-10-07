/**
 * The league's standings rows, built from its raw documents (October audit,
 * coverage).
 *
 * Extracted from useLeague, where it sat inline with no test, because two
 * things in it are load-bearing and were unprotected:
 *
 *  - **The duplicate merge.** Concurrent recording can create two player
 *    documents for one person; they are merged into ONE row by `nameKey`, with
 *    results deduplicated by game. The recorder's dedupe depends on knowing
 *    this happens — see `alreadyRecorded` in lib/leagueRecorder.ts.
 *  - **The read whitelist.** Every result is rebuilt from an explicit list of
 *    fields, so a field added to the document alone reads 0 in every column —
 *    which is exactly how Rebuys, Re-entries, Add-ons and Bounties read 0 for
 *    every player in every league. `knockouts` is renamed
 *    `playersEliminatedCount` and `prizeMoney` `cashWon`, which is why readers
 *    accept both shapes.
 */
import { nameKey } from '@/lib/leagueRecorder';

export function standingsFromDocs(cloudPlayers: readonly any[], cloudResults: readonly any[]): any[] {
  const byName = new Map<string, { primaryPlayer: any; mergedResults: any[] }>();

  cloudPlayers.forEach((player: any) => {
    const key = nameKey(player.name);
    const playerResults = cloudResults.filter((r: any) => r.leaguePlayerId === player.id);

    if (byName.has(key)) {
      const entry = byName.get(key)!;
      playerResults.forEach(r => {
        const alreadyPresent = r.tournamentId
          ? entry.mergedResults.some(existing => existing.tournamentId === r.tournamentId)
          : false;
        if (!alreadyPresent) entry.mergedResults.push(r);
      });
    } else {
      byName.set(key, { primaryPlayer: player, mergedResults: [...playerResults] });
    }
  });

  return Array.from(byName.values()).map(({ primaryPlayer, mergedResults }) => {
    const totalPoints = mergedResults.reduce((sum, r) => sum + (r.points || 0), 0);
    return {
      id: primaryPlayer.id.toString(),
      name: primaryPlayer.name,
      totalPoints,
      tournamentResults: mergedResults.map((result: any) => ({
        id: result.id.toString(),
        tournamentId: result.tournamentId,
        tournamentDate: result.tournamentDate || null,
        seasonId: result.seasonId || null,
        position: result.position,
        totalPlayers: result.totalPlayers,
        points: result.points,
        playersEliminatedCount: result.knockouts,
        cashWon: result.prizeMoney,
        buyIn: result.buyIn,
        // What the player put in again, and what they took off other players'
        // heads. Rebuilding each result from an explicit whitelist is why
        // adding these to the document alone was not enough: the columns
        // would still have read 0.
        rebuys: result.rebuys,
        rebuyAmount: result.rebuyAmount,
        addons: result.addons,
        addonAmount: result.addonAmount,
        reEntries: result.reEntries,
        bountyWinnings: result.bountyWinnings,
        date: result.createdAt?.toDate?.()?.toISOString() || result.createdAt || new Date().toISOString()
      }))
    };
  });
}
