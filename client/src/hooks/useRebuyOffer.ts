import { useRef, useState } from 'react';
import { rebuyToOffer, offerKey, bustedKeys, type OfferablePlayer } from '@/lib/rebuyOffer';

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

  return { player, answer };
}
