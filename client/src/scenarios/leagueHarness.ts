/**
 * A league that lives in memory, for scenario tests that play whole nights in
 * sequence (October 2026, after a new season's standings listed every past
 * player on 0 games — a bug no single-function test could see, because it only
 * appears once one season has ended and the next has begun).
 *
 * WHAT IS REAL: every DECISION. The night is played through the real
 * `useTournament` hook by the caller; the recorder's choices come from the real
 * `removalsDue` / `recordsDue` / `recordedForGame`; what each player put in and
 * collected from `recordedStatsFor` and `prizePoolFor`; points from the real
 * `pointsFor`; who-is-who from `findPlayerByName` / `alreadyRecorded` /
 * `resultsToWithdraw`; and the standings from `standingsFromDocs` +
 * `seasonRoster` + `compareStandings` — the same functions the screens use.
 *
 * WHAT IS A STAND-IN: Firestore (two arrays here), and the LOOP in
 * `PokerTimer`'s `syncLeagueResults` plus `useLeague`'s two writers, which are
 * mirrored below line for line because they live inside a page effect and a
 * Firebase hook. If either of those changes shape, change this with it.
 */
import { removalsDue, recordsDue, recordedForGame, findPlayerByName, alreadyRecorded, resultsToWithdraw } from '@/lib/leagueRecorder';
import { standingsFromDocs } from '@/lib/leagueStandings';
import { seasonRoster } from '@/lib/playerSeason';
import { compareStandings, bestFinishOf } from '@/lib/standingsOrder';
import { recordedStatsFor, buyInOf, investedIn } from '@/lib/resultStats';
import { prizePoolFor } from '@/lib/prizePool';
import { pointsFor } from '@/lib/points';
import type { PointsFormula } from '@/types/leagueSettings';

export interface StoredResult {
  id: string;
  leaguePlayerId: string;
  tournamentId: string;
  seasonId: string | null;
  position: number;
  totalPlayers: number;
  points: number;
  knockouts: number;
  prizeMoney: number;
  buyIn: number;
  rebuys: number;
  reEntries: number;
  addons: number;
  bountyWinnings: number;
  rebuyAmount: number;
  addonAmount: number;
  createdAt: string;
}

export function createLeague(formula: PointsFormula = { type: 'linear', baseMultiplier: 10, winnerMultiplier: 1 }) {
  const playerDocs: { id: string; name: string }[] = [];
  const results: StoredResult[] = [];
  let seq = 0;
  /** This tab's memory (PokerTimer's processedEliminationsRef). A new tab, or a reload, starts empty. */
  let memory = new Map<string, number>();

  const standings = () => standingsFromDocs(playerDocs, results);

  /** useLeague.recordResultByName, mirrored. */
  function recordResultByName(
    name: string, position: number, totalPlayers: number, knockouts: number, prizeMoney: number,
    buyIn: number, gameId: string, seasonId: string | null, allowReplace: boolean,
    stats: ReturnType<typeof recordedStatsFor> & { prizePool?: number },
  ) {
    let target: { id: string } | undefined = findPlayerByName(standings(), name) ?? findPlayerByName(playerDocs, name);
    if (!target) {
      target = { id: `lp${++seq}` };
      playerDocs.push({ id: target.id, name: name.trim() });
    }
    if (!allowReplace && alreadyRecorded(playerDocs, results, name, gameId, [target.id])) return;
    const costs = { buyIn, rebuys: stats.rebuys, addons: stats.addons, rebuyAmount: stats.rebuyAmount, addonAmount: stats.addonAmount };
    const points = pointsFor(formula, position, totalPlayers, knockouts, buyInOf(costs), investedIn(costs),
      stats.prizePool ?? buyInOf(costs) * totalPlayers);
    results.push({
      id: `r${++seq}`, leaguePlayerId: String(target.id), tournamentId: gameId, seasonId,
      position, totalPlayers, points, knockouts, prizeMoney, buyIn,
      rebuys: stats.rebuys, reEntries: stats.reEntries, addons: stats.addons,
      bountyWinnings: stats.bountyWinnings, rebuyAmount: stats.rebuyAmount, addonAmount: stats.addonAmount,
      createdAt: new Date(Date.UTC(2026, 9, 1) + seq * 60_000).toISOString(),
    });
  }

  /** useLeague.removeTournamentResultForPlayer, mirrored. */
  function removeResultForPlayer(name: string, gameId: string) {
    for (const doomed of resultsToWithdraw(playerDocs, results, name, gameId)) {
      results.splice(results.indexOf(doomed), 1);
    }
  }

  /**
   * One pass of PokerTimer's syncLeagueResults, mirrored. The page runs it on
   * every roster change; scenario tests call it after each step that matters.
   */
  function sync(state: { players: any[]; prizeStructure?: any }, gameId: string, seasonId: string | null) {
    const players = state.players || [];
    const active = players.filter(p => p.isActive !== false);
    const isFinished = active.length <= 1 && players.length > 1;
    const cloud = recordedForGame(standings(), gameId);
    const { back, moved } = removalsDue(players, memory, cloud);
    for (const p of [...back, ...moved]) { removeResultForPlayer(p.name, gameId); memory.set(p.id, 0); }
    for (const p of recordsDue(players, memory, cloud, isFinished)) {
      const replacing = memory.get(p.id) === 0;
      memory.set(p.id, p.position);
      recordResultByName(p.name, p.position, players.length, p.knockouts || 0, p.prizeMoney || 0,
        state.prizeStructure?.buyIn ?? 10, gameId, seasonId, replacing,
        { ...recordedStatsFor(p, state.prizeStructure), prizePool: prizePoolFor(players, state.prizeStructure).net });
    }
  }

  /** A reload or a second tab: the page's in-memory claims are gone. */
  function forgetTab() { memory = new Map(); }

  /** The standings table for a season, in the order the screen draws it. */
  function table(seasonId: string) {
    return seasonRoster(standings(), seasonId)
      .map((p: any) => ({
        name: p.name as string,
        games: p.tournamentResults.length as number,
        points: p.tournamentResults.reduce((s: number, r: any) => s + (r.points || 0), 0) as number,
        bestFinish: bestFinishOf(p.tournamentResults),
      }))
      .sort(compareStandings);
  }

  return { playerDocs, results, standings, sync, forgetTab, table, removeResultForPlayer, recordResultByName };
}
