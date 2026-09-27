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
 * Which player, if any, still carries the failsafe Rebuy button.
 *
 * The failsafe for a misclick. The offer appears once at the bust-out and a
 * director who means to press Rebuy can easily press "No — they are out"
 * instead, at the busiest moment of the night, and under a strict reading that
 * mistake is unrecoverable: the player's night is over on a stray tap.
 *
 * So exactly ONE player carries the button — the bust-out that was last asked
 * about — and it goes the moment somebody else busts, that player rebuys, or
 * the period ends. That is still "a rebuy is taken immediately": the window is
 * until the next bust-out, which is minutes, not the whole period.
 *
 * **It is keyed on the bust-out that was WITNESSED, not on whoever is most
 * recently busted right now, and that distinction is a bug this had.** Asking
 * the roster "who busted last" is a question whose answer MOVES BACKWARDS:
 * taking the failsafe makes that player active, so the next-most-recent
 * bust-out — an older one — becomes the answer and inherited the button.
 * Reported from a real game: rebuy Amy and Dave, who busted before her, gets a
 * button he should never have again. Positions cannot correct it, because
 * `positionsAfterReEntry` renumbers only players who finished AFTER the
 * returning one and there were none, so the roster ends up indistinguishable
 * from "Dave busted first and nobody has busted since".
 *
 * It is the same trap `rebuyToOffer` takes a SET for rather than a single key.
 * The dialog was already safe; this was not.
 *
 * **`offerKey` carrying the rebuy count is what makes it self-closing.** Once
 * that player rebuys their key moves from `id:0` to `id:1` and stops matching,
 * so nobody inherits anything; an earlier bust-out can never match, because the
 * key names a player. All three ways the button should vanish fall out of one
 * comparison.
 *
 * Deliberately independent of the answered-set: answering the dialog must not
 * take the failsafe away, or it would not be one.
 */
export function failsafeRebuyId(
  players: OfferablePlayer[] | null | undefined,
  structure: EntryLimitStructure | null | undefined,
  currentLevel: number,
  latestKey: string | null | undefined,
): string | null {
  if (!latestKey) return null;

  // Still busted, and still the same bust-out. The `isFinished` shape, for the
  // reason `mostRecentlyBusted` filters on it too: a busted player carrying no
  // finishing position is not a bust-out anyone can reason about.
  const player = (players || []).find(
    p => p.isActive === false
      && typeof p.position === 'number'
      && p.position > 0
      && offerKey(p) === latestKey,
  );
  if (!player) return null;

  return canRebuy(structure, player, currentLevel) ? player.id : null;
}

/**
 * The failsafe, remembered across a page refresh.
 *
 * `useRebuyOffer` tracks the latest witnessed bust-out in a ref, so a reload
 * starts it empty — and the seeding then marks every already-busted player as
 * seen, so the ref never advances for them and no button comes back until the
 * next bust-out. A director who refreshes seconds after a misclick lost the one
 * thing that was there to catch it.
 *
 * Only the KEY has to survive; everything else recomputes from the roster, and
 * `failsafeRebuyId` needs no change at all. Every property comes along for free:
 * a player who rebought before the reload has moved from `id:0` to `id:1`, so
 * the stored key stops matching and nobody holds it; a later bust-out means the
 * stored key is already the newer one; and a period that lapsed while the page
 * was away fails `canRebuy` on restore.
 *
 * **Stored WITH the game id, and that guard is the point.** Without it a key
 * left over from last night would be matched against tonight's roster.
 * `failsafeRebuyId` would almost certainly reject it, since it wants a player
 * with that exact id still busted — but "almost certainly", resting on player
 * ids never colliding, is a coincidence rather than a reason.
 */
export interface FailsafeMemory {
  gameId: string;
  key: string;
}

/** What to write. One entry, overwritten, rather than one per game. */
export function failsafeMemory(gameId: string | null | undefined, key: string | null | undefined): string | null {
  if (!gameId || !key) return null;
  return JSON.stringify({ gameId: String(gameId), key });
}

/**
 * What to restore, or null.
 *
 * Null for anything unusable — absent, unparseable, the wrong shape, or a
 * different game. Storage is read back from a place the app does not control,
 * so every one of those is an ordinary outcome rather than an error.
 */
export function rememberedFailsafeKey(
  raw: string | null | undefined,
  gameId: string | null | undefined,
): string | null {
  if (!raw || !gameId) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<FailsafeMemory> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (String(parsed.gameId ?? '') !== String(gameId)) return null;
    return typeof parsed.key === 'string' && parsed.key ? parsed.key : null;
  } catch {
    return null;
  }
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
