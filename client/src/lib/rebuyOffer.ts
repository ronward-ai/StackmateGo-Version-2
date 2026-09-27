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
 * May this player still be bought back in from a BUTTON, as opposed to the
 * offer dialog?
 *
 * The failsafe for a misclick. The offer appears once at the bust-out and a
 * director who means to press Rebuy can easily press "No — they are out"
 * instead, at the busiest moment of the night, and under a strict reading that
 * mistake is unrecoverable: the player's night is over on a stray tap.
 *
 * So exactly ONE player carries a Rebuy button at any time — whoever busted
 * most recently — and it goes the moment somebody else busts or the rebuy
 * period ends. That is still "a rebuy is taken immediately": the window is
 * until the next bust-out, which is minutes, not the whole period. What it is
 * NOT is the old behaviour, where every busted player kept a Rebuy button for
 * the length of the period and a director could rebuy a level-2 bust-out in
 * level 6.
 *
 * Deliberately independent of the answered-set: this is not "has the question
 * been asked", it is "is this still the live bust-out". Answering the dialog
 * must not take the failsafe away, or it would not be one.
 */
export function rebuyStillOpenFor(
  players: OfferablePlayer[] | null | undefined,
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
  playerId: string | null | undefined,
): boolean {
  if (!playerId) return false;
  const justBusted = mostRecentlyBusted(players || []);
  if (!justBusted || justBusted.id !== playerId) return false;
  return canRebuy(structure, justBusted, currentLevel);
}

/** Every bust-out currently on the roster, as offer keys. */
export function bustedKeys(players: OfferablePlayer[] | null | undefined): string[] {
  return (players || [])
    .filter(p => p.isActive === false && typeof p.position === 'number' && p.position > 0)
    .map(p => offerKey(p))
    .filter((k): k is string => k !== null);
}

/**
 * Who to offer a rebuy to, or null.
 *
 * `seen` is every bust-out already offered for — or present before this console
 * started watching, so a page refresh mid-game does not re-offer a rebuy for a
 * bust-out that happened an hour ago. The moment has passed; that is the point.
 *
 * **A set, not a single "last answered" key**, and the difference is a real bug
 * rather than bookkeeping. Accepting an offer makes that player active again,
 * so `mostRecentlyBusted` immediately returns the NEXT most recent bust-out —
 * an older one — and a single-key guard would not match it, so the dialog would
 * reopen offering a rebuy for a player who busted long before. That is exactly
 * the lingering offer this whole change removes, rebuilt as a popup.
 *
 * Null when: nobody has busted, rebuys are off, this player is out of rebuys or
 * past the period, or this bust-out has already been asked about.
 */
export function rebuyToOffer<T extends OfferablePlayer>(
  players: T[] | null | undefined,
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
  seen: ReadonlySet<string>,
): T | null {
  const justBusted = mostRecentlyBusted(players || []) as T | null;
  if (!justBusted) return null;

  const key = offerKey(justBusted);
  if (!key || seen.has(key)) return null;

  if (!canRebuy(structure, justBusted, currentLevel)) return null;

  return justBusted;
}
