import { buyInOf, bountyWinningsIn, investedIn, totalsAcross, type ResultCosts } from './resultStats';

/**
 * One player's season, game by game.
 *
 * The complaint that prompted this: on the software directors are coming from,
 * answering "how many hits has Dave had this season" means opening every game
 * of the season one at a time and adding them up by hand. The standings table
 * already answers it for the season as a whole; this answers it per GAME, which
 * is what a player actually asks about ("which night was that?").
 *
 * The arithmetic lives here rather than in the dialog because it is the same
 * arithmetic the league table does, and two places deriving what a player spent
 * is how Invested, Profit and ROI all read zero for a year.
 * `lib/resultStats.ts` owns the per-result fallbacks; this only aggregates.
 */

export interface SeasonGame extends ResultCosts {
  id?: string;
  position?: number;
  totalPlayers?: number;
  points?: number;
  playersEliminatedCount?: number;
  knockouts?: number;
  cashWon?: number;
  prizeMoney?: number;
  date?: string | null;
  tournamentDate?: string | null;
}

export interface SeasonGameRow {
  id: string;
  /** Most recent first, so 1 is the latest game played. */
  position: number | null;
  totalPlayers: number | null;
  points: number;
  hits: number;
  invested: number;
  cash: number;
  /** Cash minus what they put in, for this game alone. */
  net: number;
  playedAt: Date | null;
}

export interface SeasonSummary {
  games: number;
  points: number;
  hits: number;
  invested: number;
  cash: number;
  net: number;
  wins: number;
  /** Null rather than 0 for a player who has not played: there is no average. */
  averagePosition: number | null;
  bestFinish: number | null;
}

/** Knockouts are stored under two names — see the note in useLeague's whitelist. */
export function hitsIn(game: SeasonGame): number {
  return game.playersEliminatedCount ?? game.knockouts ?? 0;
}

/** Prize money has carried four different field names across the app's life. */
export function cashIn(game: SeasonGame): number {
  return game.cashWon ?? game.prizeMoney ?? 0;
}

function playedAtOf(game: SeasonGame): Date | null {
  const raw = game.date ?? game.tournamentDate;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * The player's games, most recent first.
 *
 * Newest first because the question being answered is almost always about a
 * recent night, and a director scrolling a long season should not have to
 * reach the bottom to find last week.
 *
 * A game with no usable date sorts to the end rather than being dropped: it is
 * still a real result, and losing it from the list would quietly disagree with
 * the totals below.
 */
export function seasonGames(results: SeasonGame[] | null | undefined): SeasonGameRow[] {
  return (results ?? [])
    .map((game, index) => {
      const invested = investedIn(game);
      const cash = cashIn(game) + bountyWinningsIn(game);
      return {
        id: game.id ?? String(index),
        position: game.position ?? null,
        totalPlayers: game.totalPlayers ?? null,
        points: game.points ?? 0,
        hits: hitsIn(game),
        invested,
        cash,
        net: cash - invested,
        playedAt: playedAtOf(game),
      };
    })
    .sort((a, b) => {
      if (!a.playedAt && !b.playedAt) return 0;
      if (!a.playedAt) return 1;
      if (!b.playedAt) return -1;
      return b.playedAt.getTime() - a.playedAt.getTime();
    });
}

/** The season totals, from the same rows the list shows. */
export function seasonSummary(results: SeasonGame[] | null | undefined): SeasonSummary {
  const games = results ?? [];
  const rows = seasonGames(games);
  const totals = totalsAcross(games);

  const placed = rows.map(r => r.position).filter((p): p is number => typeof p === 'number' && p > 0);

  return {
    games: rows.length,
    points: rows.reduce((sum, r) => sum + r.points, 0),
    hits: rows.reduce((sum, r) => sum + r.hits, 0),
    invested: totals.invested,
    cash: rows.reduce((sum, r) => sum + r.cash, 0),
    net: rows.reduce((sum, r) => sum + r.cash, 0) - totals.invested,
    wins: placed.filter(p => p === 1).length,
    averagePosition: placed.length
      ? Math.round((placed.reduce((sum, p) => sum + p, 0) / placed.length) * 10) / 10
      : null,
    bestFinish: placed.length ? Math.min(...placed) : null,
  };
}

/** Kept so the buy-in fallback has exactly one owner. */
export { buyInOf };
