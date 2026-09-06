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
  /** League points, when the game is a league game and the player has finished. */
  points?: number;
  prize?: number;
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
 * you did, what it cost you, what you won. Keeping it fixed means a row does not
 * reshuffle as the night goes on.
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

  if ((input.prize || 0) > 0) {
    badges.push({ key: 'prize', figure: `${sym}${Math.round(input.prize as number)}`, tone: 'money' });
  }

  if ((input.bounty || 0) > 0) {
    badges.push({
      key: 'bounty',
      figure: `${sym}${Math.round(input.bounty as number)}`,
      label: 'bounty',
      tone: 'bounty',
    });
  }

  return badges;
}
