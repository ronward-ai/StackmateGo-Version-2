import { canRebuy, type EntryLimitStructure } from '@/lib/entryLimits';
import { mostRecentlyBusted } from '@/lib/eliminationOrder';

/**
 * Whether to offer a rebuy right now, and to whom.
 *
 * **In poker a rebuy is taken immediately.** The player has just busted, they
 * are still in their chair, and they buy more chips there and then — which is
 * why `processRebuy` puts them back in the seat they never left. Coming back
 * LATER, and being given a new seat, is a re-entry. They are different actions
 * with different prices, and the app treated them as one thing with two seat
 * behaviours.
 *
 * Concretely it drew a Rebuy button beside every busted player's name, in the
 * Busted strip and the players list, for as long as the rebuy period ran. A
 * director could bust someone in level 2 and "rebuy" them in level 6, which is
 * not a rebuy in any cardroom.
 *
 * So the offer is made ONCE, at the bust-out, and nothing lingers. The way back
 * in after that is a re-entry, which is exactly what a re-entry is for.
 *
 * `lib/entryLimits.ts` still owns whether a rebuy is ALLOWED — the cap and the
 * period are unchanged. This only decides when it is ASKED.
 *
 * A happy consequence: at the moment of the bust-out the current level IS the
 * level the player busted in, so the period check needs no record of when they
 * went out. The immediacy rule removes the off-by-one rather than needing a new
 * field to fix it.
 */

export interface OfferablePlayer {
  id: string;
  name?: string;
  isActive?: boolean;
  position?: number;
  rebuys?: number;
}

/**
 * The key an answered offer is remembered against.
 *
 * NOT the player id alone. A player who busts, rebuys and busts again is a NEW
 * question, and a key that could not tell those apart would swallow the second
 * one — the fault `dismissalIsStale` exists to stop on the final-table prompt,
 * where "a count recurs; a question does not". The rebuy count changes the
 * moment the first offer is accepted, so the next bust-out asks again.
 */
export function offerKey(player: OfferablePlayer | null | undefined): string | null {
  if (!player?.id) return null;
  return `${player.id}:${player.rebuys || 0}`;
}

/**
 * Who to offer a rebuy to, or null.
 *
 * Null when: nobody has just busted, rebuys are off, this player is out of
 * rebuys or past the period, or the offer for THIS bust-out has been answered.
 */
export function rebuyToOffer<T extends OfferablePlayer>(
  players: T[] | null | undefined,
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
  answeredKey: string | null,
): T | null {
  const justBusted = mostRecentlyBusted(players || []) as T | null;
  if (!justBusted) return null;

  // Asked and answered for this bust-out. Asking twice about one player is the
  // nagging `promptDismissedFor` caps on the final-table prompt.
  if (answeredKey && offerKey(justBusted) === answeredKey) return null;

  if (!canRebuy(structure, justBusted, currentLevel)) return null;

  return justBusted;
}
