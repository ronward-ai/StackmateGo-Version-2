import { useRef, useState } from 'react';
import { rebuyToOffer, offerKey, bustedKeys, failsafeRebuyId, type OfferablePlayer } from '@/lib/rebuyOffer';
import { mostRecentlyBusted } from '@/lib/eliminationOrder';

/**
 * Whether a rebuy is being offered right now, and to whom.
 *
 * A HOOK rather than state inside the dialog, and that is not tidiness — it is
 * a race that was caught by driving a real bust-out. The dialog owned the
 * answer and reported it upward through `onOpenChange`, which is an effect, so
 * "a rebuy offer is up" only became true on the NEXT render. In that one-render
 * window the final-table prompt's own effect ran, saw nothing standing in its
 * way, and opened on top of the rebuy offer — two dialogs about one bust-out,
 * which is exactly what the stand-down was written to prevent.
 *
 * Derived here, every consumer sees the same answer in the same render. One
 * fact, one derivation, no ordering to get right — the same reasoning that put
 * `consoleTournamentId()` in a lib when the QR code and the sync effects each
 * worked it out for themselves and disagreed.
 */
export function useRebuyOffer(
  tournament: ReturnType<typeof import('@/hooks/useTournament').useTournament>,
) {
  const { state, processRebuy } = tournament;

  /**
   * Every bust-out already asked about — or already out when this console
   * started watching.
   *
   * Seeding is load-bearing: a director who refreshes mid-game must not be
   * asked to rebuy someone who busted an hour ago, because that moment has
   * passed, which is the whole rule. Seeded on the first render with a real
   * roster rather than on mount, since local state starts empty and the roster
   * arrives from Firestore a beat later — seeding from the empty one would
   * treat every existing bust-out as fresh.
   */
  const seenRef = useRef<Set<string> | null>(null);
  const [, bump] = useState(0);

  if (seenRef.current === null && (state.players?.length ?? 0) > 0) {
    seenRef.current = new Set(bustedKeys(state.players as OfferablePlayer[]));
  }

  const player = seenRef.current
    ? rebuyToOffer(state.players as OfferablePlayer[], state.prizeStructure, state.currentLevel, seenRef.current)
    : null;

  /**
   * The bust-out this console last WITNESSED, which is what the failsafe Rebuy
   * button hangs on — not "whoever is most recently busted", which is a
   * question whose answer moves backwards.
   *
   * Taking the failsafe makes that player active, so the roster's answer
   * becomes the NEXT most recent bust-out — an older one — and it inherited the
   * button. Reported from a real game: rebuy Amy and Dave, who busted before
   * her, gets a button he should never have again.
   *
   * The ref advances only for a key that is NOT already in `seen` — a genuinely
   * new bust-out. That one condition is what keeps Dave out of the running: his
   * key was recorded when he busted, so his reappearance as "most recent" is
   * ignored. It reuses the set that already exists rather than keeping a second
   * memory that could disagree with it.
   *
   * Mutating a ref in render, like the seeding above and for the same reason:
   * every consumer must see this in the SAME render, or the button lags a beat
   * behind the dialog. Idempotent, so a double render costs nothing.
   */
  const latestKeyRef = useRef<string | null>(null);
  if (seenRef.current) {
    const justBustedKey = offerKey(mostRecentlyBusted(state.players as OfferablePlayer[]));
    if (justBustedKey && !seenRef.current.has(justBustedKey)) {
      latestKeyRef.current = justBustedKey;
    }
  }

  /**
   * Null when nobody holds it — which is the ordinary state between bust-outs,
   * and the state immediately after the failsafe is used.
   */
  const failsafeFor = failsafeRebuyId(
    state.players as OfferablePlayer[],
    state.prizeStructure,
    state.currentLevel,
    latestKeyRef.current,
  );

  /**
   * Both answers record the bust-out, so neither can be asked again — "a count
   * recurs; a question does not". The key carries the rebuy count, so the same
   * player busting again after buying in is a new question.
   */
  const answer = (rebuy: boolean) => {
    const key = offerKey(player);
    if (key) seenRef.current?.add(key);
    if (rebuy && player) processRebuy(player.id);
    // The answer lives in a ref, so a decline would otherwise re-render nothing.
    bump(n => n + 1);
  };

  return { player, answer, failsafeFor };
}
