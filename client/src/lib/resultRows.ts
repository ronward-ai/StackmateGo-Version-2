import { ordinal } from '@/lib/ordinal';
import { gameIsOver } from '@/lib/gameOver';
import { payoutAmount, prizePoolFor } from '@/lib/prizePool';
import { buyInOf, investedIn, bountyTakeFor } from '@/lib/resultStats';

/**
 * The finishing order of the game being run: who is where, what their place is
 * called, and what the chips beside their name say.
 *
 * **FOUR screens each answered this separately, and they disagreed about the
 * one thing nobody could get wrong by accident — the name of a place.**
 *
 * | Where | Rank read |
 * |---|---|
 * | the director's own row (`PlayerSection`) | `1st`, `2nd`, `3rd`, and then **`21th`** |
 * | the participant's phone (`PlayerSectionReadOnly`) | **`#9`** — no ordinal, no medal, 1st indistinguishable from 9th |
 * | the exported PNG (`PlayerSection`, again) | `21st`, correctly |
 *
 * `lib/ordinal.ts` exists for exactly that string and its own comment records
 * four implementations being wrong past tenth. It was applied to the EXPORT and
 * not to the row above it, so the console said *21th* all night and the picture
 * the director posted afterwards said *21st*. A fix at one call site out of two
 * is the fault this codebase keeps paying for, and the only cure is that there
 * stops being a second call site.
 *
 * Three more divergences were hiding under that one, none of them visible:
 *
 * - **"Is the game finished" was spelled twice and neither was `gameIsOver`.**
 *   The row asked `(active === 0 && eliminated > 0) || (active === 1 && …)`, off
 *   `filter(p => p.isActive)` — TRUTHY, so a player whose flag is absent read as
 *   inactive, which `lib/gameOver.ts` is explicit about having cost before. The
 *   export asked `some(position === 1) || active <= 1`. That flag decides whether
 *   seat chips show, so the two could draw a different row for one player.
 * - **The points chip was fed different money.** The row passed `buyInOf(...)`
 *   and `investedIn(...)`; the export passed a raw `prizeStructure.buyIn || 0`.
 *   `buyInOf` falls back to 10 for a game that never recorded a price, so any
 *   formula weighted on `b` or `c` scored one number on screen and another in
 *   the image — of the same player, in the same game, seconds apart.
 * - **The payout guard differed**: the row required `percentage > 0`, the export
 *   did not.
 *
 * Kept free of React and Firebase per the lib/ convention, which is what lets
 * the export sheet render from the identical list rather than rebuilding it —
 * the same trade `lib/playerBadges.ts` already makes for the chips themselves.
 * `calculatePoints` arrives as a CALLBACK for that reason: it lives on
 * `useLeagueSettings`, and importing a hook here would end the property that
 * makes this module worth having.
 */

/** Only what building a results row needs. A `Player` satisfies it. */
export interface ResultPlayerLike {
  id: string | number;
  name: string;
  isActive?: boolean | null;
  position?: number | null;
  knockouts?: number | null;
  rebuys?: number | null;
  addons?: number | null;
  seated?: boolean;
  tableAssignment?: { tableIndex: number; seatIndex: number } | null;
  reEntries?: number | null;
  eliminatedBy?: string | number | null;
  /**
   * What the player was recorded as winning, written onto them at bust-out.
   * Read only as a FALLBACK — see the prize derivation below.
   */
  prizeMoney?: number | null;
}

/**
 * Which of the five treatments a place wears.
 *
 * **A NAME, NOT A COLOUR, and that is the point.** The screen and the exported
 * image are deliberately different media — one is glass over a dark page, the
 * other is flat and high-contrast so it survives being posted to a group chat —
 * so they cannot share a hex value. What they must share is which places are
 * special, and a name is the only thing both can agree on without one of them
 * having to look like the other.
 *
 * It also kills a shipped bug by construction. The export worked its text
 * colour out arithmetically — `position <= 2 ? black : white` — and an ACTIVE
 * player's position is 0, which is `<= 2`, so the picture drew black text on
 * the green badge where the screen drew white. Once "which colour" is a lookup
 * on a named tone rather than a sum over the position, there is nowhere for
 * that to live.
 */
export type RankTone = 'gold' | 'silver' | 'bronze' | 'out' | 'active';

export function rankTone(position?: number | null): RankTone {
  const pos = Number(position) || 0;
  if (pos === 1) return 'gold';
  if (pos === 2) return 'silver';
  if (pos === 3) return 'bronze';
  return pos > 0 ? 'out' : 'active';
}

/**
 * What the badge says: a real ordinal, or `Active` for somebody still in.
 *
 * This one line is the fix. Every caller goes through `ordinal`, so there is no
 * longer anywhere for `` `${position}th` `` to be written.
 */
export function rankLabel(position?: number | null): string {
  const pos = Number(position) || 0;
  return pos > 0 ? ordinal(pos) : 'Active';
}

/**
 * Everything one night knows about one player, already derived.
 *
 * The row used to carry a finished `PlayerBadge[]` and nothing else, which was
 * right while the results were a ragged strip of chips and wrong the moment they
 * became a table: a column needs the FIGURE, not a rendered chip. All of these
 * were being computed here already and thrown straight into `badgesFor` — so
 * exposing them adds no derivation, it stops one being discarded.
 *
 * `lib/resultColumns.ts` is the only consumer that decides what any of it looks
 * like. This module answers what is true.
 */
export interface RowStats {
  knockouts: number;
  /** Heads taken, plus the winner's own bounty back. */
  bountiesCollected: number;
  bountyMoney: number;
  rebuys: number;
  reEntries: number;
  addons: number;
  /** Buy-in plus everything put in again — `investedIn`. */
  invested: number;
  /** The payout for their finishing place. */
  prize: number;
  /** Prize plus bounty money: the one figure anybody actually asks about. */
  won: number;
  profit: number;
  points: number;
  seat: { tableIndex: number; seatIndex: number } | null;
  eliminatedByName: string | null;
}

export interface ResultRow<T> {
  player: T;
  /** 0 while they are still in. */
  position: number;
  rankLabel: string;
  rankTone: RankTone;
  stats: RowStats;
}

export interface ResultRowOptions {
  /** `state.prizeStructure`. */
  prizeStructure?: any;
  /**
   * `state.settings`. Kept because callers pass it and the prize structure is
   * read beside it — but NOT for the currency symbol, which is a question about
   * how a figure is spelled rather than what it is, and belongs with the rest of
   * the formatting in `lib/resultColumns.ts`.
   */
  settings?: { currency?: string } | null;
  /** Whether tonight is a league game, so the points chip is worth showing. */
  isLeagueMode?: boolean;
  /**
   * `useLeagueSettings`'s scorer. Absent means no points chip — which is right
   * for the participant's phone, which has no league settings of its own to
   * score with and must not invent a figure that disagrees with the standings.
   */
  calculatePoints?: (
    position: number,
    totalPlayers: number,
    knockouts?: number,
    buyIn?: number,
    totalCost?: number,
    prizepool?: number,
  ) => number;
}

/**
 * The display order: whoever is still in first, then the finishers.
 *
 * Active players sort by name because there is nothing else true to sort them
 * by — chip counts are not tracked — and the finishers sort by place, so the
 * winner heads the list of people who are out. `|| 999` parks a finisher with
 * no number at the end rather than ahead of first place.
 *
 * Exported so a test can pin it without going through the badges.
 */
export function sortForResults<T extends ResultPlayerLike>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => {
    const aIn = a.isActive !== false;
    const bIn = b.isActive !== false;
    if (aIn && !bIn) return -1;
    if (!aIn && bIn) return 1;
    if (aIn && bIn) return a.name.localeCompare(b.name);
    return (Number(a.position) || 999) - (Number(b.position) || 999);
  });
}

/**
 * Every row of the finishing order, ready to render.
 *
 * The money is derived here rather than by each caller because `prizePoolFor`
 * is the one entry point for it (`lib/prizePool.ts`) and the bounty `+1` — the
 * winner taking their own bounty back — has to land in the same place as the
 * count it multiplies against, or the chip and the figure disagree on one row.
 */
export function resultRowsFor<T extends ResultPlayerLike>(
  players: readonly T[] | null | undefined,
  options: ResultRowOptions = {},
): ResultRow<T>[] {
  const roster = players || [];
  const { prizeStructure: ps, isLeagueMode, calculatePoints } = options;

  const { net: prizePool } = prizePoolFor(roster as any, ps);

  // ONE predicate, and it is the app's own. Seat chips stop being interesting
  // once the game is over, which is the only thing this decides — but the two
  // old spellings could answer differently for the same roster, so one row
  // could carry a seat in the picture and not on the screen.
  const finished = gameIsOver(roster as any);

  const buyIn = buyInOf({ buyIn: ps?.buyIn });

  return sortForResults(roster).map(player => {
    const pos = Number(player.position) || 0;

    // The winner takes their own bounty back at the end — that is the +1, and
    // it is why the count and the money have to be worked out together.
    // `bountyTakeFor` is the one derivation: the Payouts panels and the league
    // recorder read it too, and the recorder having its own answer (none) is
    // what made the season's Bounties column read £0 for every ordinary game.
    const { count: bountiesCollected, money: bounty } = bountyTakeFor(player as any, ps as any);

    // DERIVED FIRST, STORED AS A FALLBACK, and the order is deliberate.
    // `manualPayouts` is the one source of every money figure in this app
    // (`lib/payoutTemplates.ts`), so where there is a structure it wins — a
    // director who fixes a payout percentage mid-game expects the rows to
    // follow. But a tournament document written without a prize structure still
    // carries `prizeMoney` on each player from the moment they busted, and that
    // is all a participant's phone has ever had to show. Deriving only would
    // have silently emptied the money column on every older game.
    //
    // Narrow by construction: the fallback can only ever ADD a figure where the
    // derivation found none, so it cannot disagree with the Payouts panel.
    let prize = 0;
    if (pos > 0 && ps?.manualPayouts) {
      const payout = ps.manualPayouts.find((p: any) => Number(p?.position) === pos);
      if (payout && Number(payout.percentage) > 0) {
        prize = payoutAmount(prizePool, payout.percentage);
      }
    }
    //
    // AND THE STORED FIGURE IS A TOTAL, NOT A PAYOUT. `eliminatePlayer` folds
    // the bounty money into it at the bust-out — `prizeMoney += knockouts *
    // bountyAmount` — so reading it as the payout and then adding `bounty`
    // below counted the same money twice. Reported from a real game: a £3
    // bounty showing £6 in the Won column on every busted row, which is every
    // row outside the places. Subtracting the bounty back out is what makes one
    // stored total split correctly into the two columns it feeds.
    const storedTotal = pos > 0 ? Math.max(0, Number(player.prizeMoney) || 0) : 0;
    if (prize <= 0 && storedTotal > 0) prize = Math.max(0, storedTotal - bounty);

    const eliminatedByName = player.isActive === false && player.eliminatedBy
      ? roster.find(p => String(p.id) === String(player.eliminatedBy))?.name ?? null
      : null;

    const points = isLeagueMode && pos > 0 && calculatePoints
      // All six the standings score with. Passing a narrower set is how the
      // chip beside a name and the league table came to disagree for any
      // formula weighted on what a player spent.
      ? calculatePoints(
          pos,
          roster.length,
          Number(player.knockouts) || 0,
          buyIn,
          investedIn({ buyIn: ps?.buyIn, rebuys: player.rebuys ?? 0, addons: player.addons ?? 0 }),
          // (the same figure as `invested` below; kept inline so the six
          //  arguments read in the order the formula documents them)
          buyIn * roster.length,
        )
      : 0;

    const invested = investedIn({
      buyIn: ps?.buyIn, rebuys: player.rebuys ?? 0, addons: player.addons ?? 0,
    });
    // ONE total, added here so two columns cannot disagree about what "won"
    // means — the same reason `badgesFor` adds the prize and the bounty into a
    // single money chip rather than printing two for the reader to add up.
    //
    // ONE expression for both paths, which is what keeps the three money
    // columns consistent by construction: taking the bounty back out of the
    // stored total above and adding it again here returns exactly that total,
    // while a stored figure SMALLER than the derived bounty — a document that
    // never recorded the bounty money — floors the prize at zero and still
    // shows the bounty. A second expression here is where they could disagree.
    const won = prize + bounty;

    return {
      player,
      position: pos,
      rankLabel: rankLabel(pos),
      rankTone: rankTone(pos),
      stats: {
        knockouts: Number(player.knockouts) || 0,
        bountiesCollected,
        bountyMoney: bounty,
        rebuys: Number(player.rebuys) || 0,
        reEntries: Number(player.reEntries) || 0,
        addons: Number(player.addons) || 0,
        invested,
        prize,
        won,
        profit: won - invested,
        points,
        // A seat stops being interesting once the game is over — the same call
        // the chips made, kept so the column agrees with what the strip showed.
        seat: !finished && player.seated && player.tableAssignment
          ? player.tableAssignment
          : null,
        eliminatedByName,
      },
    };
  });
}
