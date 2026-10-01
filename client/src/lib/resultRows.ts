import { ordinal } from '@/lib/ordinal';
import { gameIsOver } from '@/lib/gameOver';
import { badgesFor, type PlayerBadge } from '@/lib/playerBadges';
import { payoutAmount, prizePoolFor } from '@/lib/prizePool';
import { buyInOf, investedIn } from '@/lib/resultStats';
import { currencyOf } from '@/lib/currency';

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

export interface ResultRow<T> {
  player: T;
  /** 0 while they are still in. */
  position: number;
  rankLabel: string;
  rankTone: RankTone;
  badges: PlayerBadge[];
}

export interface ResultRowOptions {
  /** `state.prizeStructure`. */
  prizeStructure?: any;
  /** `state.settings` — read only for the currency symbol. */
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
  const { prizeStructure: ps, settings, isLeagueMode, calculatePoints } = options;

  const sym = currencyOf(settings);
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
    let bountiesCollected = 0;
    let bounty = 0;
    if (ps?.enableBounties && ps?.bountyAmount) {
      const kos = Number(player.knockouts) || 0;
      bountiesCollected = pos === 1 ? kos + 1 : kos;
      bounty = bountiesCollected * ps.bountyAmount;
    }

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
    if (prize <= 0 && pos > 0) prize = Math.max(0, Number(player.prizeMoney) || 0);

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
          buyIn * roster.length,
        )
      : 0;

    return {
      player,
      position: pos,
      rankLabel: rankLabel(pos),
      rankTone: rankTone(pos),
      badges: badgesFor({
        seat: player.tableAssignment,
        seated: player.seated,
        gameFinished: finished,
        knockouts: player.knockouts ?? 0,
        eliminatedByName,
        rebuys: player.rebuys ?? 0,
        bountiesCollected,
        points,
        prize,
        bounty,
        currencySymbol: sym,
      }),
    };
  });
}
