/**
 * A stable id for this browser.
 *
 * Two things rely on it:
 *
 *  - **Player check-in.** A participant claims a seat, and their device needs to
 *    recognise the seat as theirs on a later visit.
 *  - **Director control.** With both directors sharing one login, Firestore
 *    cannot tell the two devices apart — they authenticate identically — so the
 *    tournament records which *device* is driving, and this is that identity.
 *
 * The storage key is unchanged from when this lived in `PlayerClaimView`, so
 * seats already claimed on a player's phone keep working.
 */

const STORAGE_KEY = 'playerDeviceId';

function mint(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fallback identity for when localStorage throws — Safari private mode, or a
 * browser set to block site data.
 *
 * Held at module scope on purpose. The original returned a fresh id on every
 * call in that case, which is harmless for a one-shot seat claim but fatal for
 * the control lock: the device would never match itself and would appear to
 * lose control on every render.
 */
let sessionFallback: string | null = null;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = mint();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    if (!sessionFallback) sessionFallback = mint();
    return sessionFallback;
  }
}
