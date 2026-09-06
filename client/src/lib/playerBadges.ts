/**
 * What the chips beside a player's name say.
 *
 * The director's row, the exported PNG and the participant's phone each used to
 * build these independently, and they had drifted into three vocabularies for
 * the same facts: knockouts were `🎯 3` on screen, `KO x3` in the export and
 * `3 KOs` on a player's phone — in orange, brown and red respectively. Same
 * class of drift as the rake formula and the duplicated timer.
 *
 * Free of React, per the lib/ convention, so the export builder — which writes
 * plain DOM nodes for html2canvas rather than JSX — can render from exactly the
 * same list the screen does.
 *
 * THE TONES ARE SEMANTIC, and there are deliberately few. A player row could
 * previously carry six hues (blue seat, orange knockouts, red elimination,
 * yellow points, purple rebuys, green cash) chosen by whoever wrote the line.
 * Seat numbers, knockouts and rebuys are all just facts about the game, so they
 * share the neutral chip — which is what lets the money and the red mean
 * something on a busy row.
 */

export type BadgeTone = 'neutral' | 'money' | 'bounty' | 'eliminated' | 'points';

export interface PlayerBadge {
  /** Stable across renders, for React keys. */
  key: string;
  /** The figure, set in the mono face so digits line up down a column. */
  figure?: string;
  /** The word after it, if any. */
  label?: string;
  tone: BadgeTone;
}

export interface BadgeInputs {
  seat?: { tableIndex: number; seatIndex: number } | null;
  /** Seats stop being interesting once the game is over. */
  seated?: boolean;
  gameFinished: boolean;
  knockouts?: number;
  /** The player who knocked this one out, already resolved to a name. */
  eliminatedByName?: string | null;
  rebuys?: number;
  /**
   * How many bounties this player collected — heads taken, plus their own back
   * if they won. That +1 is already in the money arithmetic, so surfacing the
   * count here means the two multiply out against each other on the same row.
   */
  bountiesCollected?: number;
  /** League points, when the game is a league game and the player has finished. */
  points?: number;
  /** Payout for their finishing position. */
  prize?: number;
  /** Bounty money. Added to the prize — the row shows one total, not both. */
  bounty?: number;
  currencySymbol: string;
}

/** One chip's text, for somewhere that cannot render two spans — the PNG export. */
export function badgeText(badge: PlayerBadge): string {
  return [badge.figure, badge.label].filter(Boolean).join(' ');
}

/**
 * The chips for one player, in a fixed order.
 *
 * Order is where they are, not what they are worth: where you were sitting, what
 * you did, what it cost you, what you won. The bounty count sits beside the
 * knockout count it derives from, and the money is last, where the eye ends up.
 * Keeping it fixed means a row does not reshuffle as the night goes on.
 */
export function badgesFor(input: BadgeInputs): PlayerBadge[] {
  const badges: PlayerBadge[] = [];
  const sym = input.currencySymbol;

  if (!input.gameFinished && input.seated && input.seat) {
    badges.push({
      key: 'seat',
      figure: `T${input.seat.tableIndex + 1}·S${input.seat.seatIndex + 1}`,
      tone: 'neutral',
    });
  }

  if ((input.knockouts || 0) > 0) {
    badges.push({ key: 'ko', figure: String(input.knockouts), label: 'KO', tone: 'neutral' });
  }

  if ((input.bountiesCollected || 0) > 0) {
    badges.push({
      key: 'bounties',
      figure: String(input.bountiesCollected),
      label: input.bountiesCollected === 1 ? 'bounty' : 'bounties',
      tone: 'bounty',
    });
  }

  if (input.eliminatedByName) {
    badges.push({ key: 'out', label: `out to ${input.eliminatedByName}`, tone: 'eliminated' });
  }

  if ((input.rebuys || 0) > 0) {
    badges.push({
      key: 'rebuys',
      figure: String(input.rebuys),
      label: input.rebuys === 1 ? 'rebuy' : 'rebuys',
      tone: 'neutral',
    });
  }

  if ((input.points || 0) > 0) {
    badges.push({ key: 'points', figure: String(input.points), label: 'pts', tone: 'points' });
  }

  // ONE money chip. The payout and the bounty money used to sit side by side in
  // green and amber, which asked the reader to add up two numbers to answer the
  // only question anyone actually asks: what did I win? The split is still on
  // the Payouts panel. The module does the adding so two call sites cannot
  // disagree about what "total" means.
  const cash = (input.prize || 0) + (input.bounty || 0);
  if (cash > 0) {
    badges.push({ key: 'cash', figure: `${sym}${Math.round(cash)}`, tone: 'money' });
  }

  return badges;
}
