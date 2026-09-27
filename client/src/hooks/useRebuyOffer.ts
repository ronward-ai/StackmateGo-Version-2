import { useEffect, useRef, useState } from 'react';
import {
  rebuyToOffer, offerKey, bustedKeys, failsafeRebuyId,
  failsafeMemory, rememberedFailsafeKey, type OfferablePlayer,
} from '@/lib/rebuyOffer';
import { mostRecentlyBusted } from '@/lib/eliminationOrder';

/**
 * Where the failsafe is remembered across a reload.
 *
 * Bare localStorage, NOT `lib/scopedStorage.ts`, and that is a decision rather
 * than a shortcut. A failed `setItem` through the scoped helpers flips a global
 * storage-health flag — any key, not just its own — which raises `PokerTimer`'s
 * standing "This device cannot keep a backup" banner. That banner is about the
 * local mirror, the thing whose loss costs a director their tournament.
 * Raising it because a rebuy-failsafe key could not be written would be a false
 * alarm about losing the game, over a convenience whose worst failure is a
 * button not coming back after a refresh.
 *
 * So it follows the other tier that `scopedStorage`'s own header describes —
 * `leaguePanelExpanded`, `smgo_unlocked`, `activeDirectorTournamentId` — which
 * write if they can and stay silent if they cannot. One entry, overwritten,
 * carrying the game it belongs to.
 */
const FAILSAFE_STORAGE_KEY = 'rebuyFailsafe';

function readFailsafe(): string | null {
  try { return localStorage.getItem(FAILSAFE_STORAGE_KEY); } catch { return null; }
}

function writeFailsafe(value: string | null): void {
  try {
    if (value) localStorage.setItem(FAILSAFE_STORAGE_KEY, value);
    else localStorage.removeItem(FAILSAFE_STORAGE_KEY);
  } catch { /* A lost failsafe is a lost convenience. Say nothing. */ }
}

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
  const latestKeyRef = useRef<string | null>(null);
  const [, bump] = useState(0);

  /**
   * Which game this console is on, so a key left over from last night cannot be
   * matched against tonight's roster. `failsafeRebuyId` would almost certainly
   * reject it — it wants a player with that exact id still busted — but
   * "almost certainly", resting on player ids never colliding, is a coincidence
   * rather than a reason.
   *
   * Every local game carries a `localGameId` since `lib/localGameId.ts`; the
   * fallback is for a database game opened straight from its URL.
   */
  const gameId = String(state.details?.localGameId ?? state.details?.id ?? '');

  if (seenRef.current === null && (state.players?.length ?? 0) > 0) {
    seenRef.current = new Set(bustedKeys(state.players as OfferablePlayer[]));
    // Restored in the same breath as the seeding, because the two answer one
    // question — what did this console already know? — and must not disagree by
    // a render. Without this a refresh loses the failsafe until the next
    // bust-out, since the seeding has just marked every existing one as seen.
    latestKeyRef.current = rememberedFailsafeKey(readFailsafe(), gameId);
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
  const latestKey = latestKeyRef.current;
  const failsafeFor = failsafeRebuyId(
    state.players as OfferablePlayer[],
    state.prizeStructure,
    state.currentLevel,
    latestKey,
  );

  /**
   * Persisted from an EFFECT, not from render.
   *
   * The ref advances during render, matching the seeding above it, but a
   * `localStorage` write is a real side effect and belongs after the commit —
   * React may render twice and discard one. Depending on the VALUE rather than
   * the ref is what makes this fire exactly when the key changes.
   */
  useEffect(() => {
    if (!gameId) return;
    writeFailsafe(failsafeMemory(gameId, latestKey));
  }, [gameId, latestKey]);

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
