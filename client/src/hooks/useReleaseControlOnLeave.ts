import { useEffect, useRef } from 'react';
import { releaseLiveGameControl } from '@/lib/liveGameWrite';

/**
 * Hand back the game this device has moved OFF.
 *
 * **The third release, and the one that explains the other two were not enough.**
 * Every console that opens a game nobody holds CLAIMS it — `PokerTimer`'s
 * automatic claim, which is right on its own and is what makes an ordinary
 * single-device night never meet the lock at all. But the two existing releases
 * act on ONE game each: the one being held at sign-out, and the one being
 * finished. So:
 *
 *   Open game A — this device claims it. Move to game B (New Tournament, or the
 *   "other live game" banner) without signing out, and **A keeps this device as
 *   its holder, for good.**
 *
 * Every later device that opens A is then read-only under a banner about a game
 * nobody is running, clearable only by an explicit Take control. That is exactly
 * how a night of testing left a pile of old games stuck, and why the director who
 * reported it kept meeting the message on games that had long finished.
 *
 * **A console drives one game at a time, so holding a claim on a game it has left
 * is never right.**
 *
 * This is still RELEASE, not a steal: `releaseLiveGameControl` is a transaction
 * that reads the live holder and clears the field only when the claim is ours, so
 * even a wrong id here cannot touch another device's claim. There is no timeout
 * and nothing is taken — the reasoning under Take control is unchanged.
 *
 * A hook rather than six lines inside `PokerTimer` because the thing most likely
 * to be wrong is **whether the effect fires at all**, and an effect inline in that
 * page has no test by construction — the shape this codebase has paid for with a
 * guard dialog that silently never rendered. `useRebuyOffer.test.tsx` is the
 * precedent for driving one of these across real state changes.
 */
export function useReleaseControlOnLeave(
  /** The game this console is driving, from `consoleTournamentId()`. */
  activeTournamentId: string | null | undefined,
  myDeviceId: string,
  /** Whether a real account is signed in. */
  signedIn: boolean,
): void {
  const previousRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    const current = activeTournamentId || null;
    previousRef.current = current;

    // The first game a console opens leaves nothing behind, and an unchanged id
    // is every ordinary re-render — this page re-renders once a second, because
    // that is how the clock advances, so writing here would be a write a second.
    if (!previous || previous === current) return;

    // Moving to NO game counts as leaving, and is the commonest way here: New
    // Tournament makes the game local again, so `consoleTournamentId()` returns
    // null and the console is plainly no longer driving the one it held.

    // Signed out, the write is refused anyway — the rule is `isExistingDocOwner`
    // — so this would only fail noisily. Sign-out has its own release inside
    // `logout()`, deliberately ordered BEFORE `signOut(auth)` for that reason.
    if (!signedIn) return;

    // Best effort. A game that cannot be handed back must never get in the way of
    // opening the next one, and the cost of failing is one stale holder — exactly
    // what the director clears with a single Take control.
    void releaseLiveGameControl(previous, myDeviceId).catch(err => {
      console.error('Could not hand back control of the game being left:', err);
    });
  }, [activeTournamentId, myDeviceId, signedIn]);
}
