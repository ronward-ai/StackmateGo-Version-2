/**
 * Which DEVICE is driving the live game, and whether this one may write to it.
 *
 * With both directors sharing one login, Firestore cannot tell two devices
 * apart — they authenticate identically, so this can never be a security rule
 * and is not pretending to be one. It is a co-ordination lock between two
 * people who are both entitled to run the game, and the failure it prevents is
 * the one CLAUDE.md records twice: two consoles writing the same roster, so the
 * one with a stale copy silently reverts the other's rebuys.
 *
 * The tournament document carries `controllingDeviceId` and `controlClaimedAt`.
 * Free of React and Firebase on purpose — the caller passes what it has read.
 */

export type Control =
  /** This device holds it. Write freely. */
  | 'mine'
  /** Nobody holds it. Write freely, and claim it. */
  | 'unclaimed'
  /** Another device holds it. Read-only until the director takes over. */
  | 'other';

/**
 * `unclaimed` permits writing, deliberately.
 *
 * Every game written before this shipped carries no `controllingDeviceId`, and a
 * lone director must go on working without pressing anything. Refusing to write
 * until a claim lands would make the lock's first act be breaking every game in
 * flight — the same instinct as `payoutsOf()` normalising on read rather than
 * migrating stored documents.
 *
 * It leaves a small window where two devices both see `unclaimed` and both
 * write. That is exactly today's behaviour, so it is not a regression, and the
 * claim closes it within a round trip.
 */
export function controlOf(
  controllingDeviceId: string | null | undefined,
  myDeviceId: string | null | undefined,
): Control {
  const holder = typeof controllingDeviceId === 'string' ? controllingDeviceId.trim() : '';
  if (!holder) return 'unclaimed';
  if (!myDeviceId) return 'other';
  return holder === myDeviceId ? 'mine' : 'other';
}

/** May this device write to the live game right now? */
export function mayDrive(control: Control): boolean {
  return control !== 'other';
}

/**
 * Whether this device should CLAIM control.
 *
 * Only when nobody holds it. Taking it from another device is always possible
 * but never automatic — a device that grabbed control on sight would recreate
 * the removed `activeDeviceId` lock's worst property, where whichever console
 * loaded last won and the other went quietly read-only mid-game.
 */
export function shouldClaim(control: Control): boolean {
  return control === 'unclaimed';
}

/**
 * What to tell the director, when there is anything to tell them.
 *
 * The wording lives here with the rule rather than in the banner, the same way
 * `rebuyUnavailableReason` and `modeLockReason` do — two screens showing this
 * must not word it differently, and an unexplained dead console is precisely
 * what sent a director to ask what a disabled control did.
 */
export function controlLockReason(control: Control, claimedAt?: string | null): string | null {
  if (control !== 'other') return null;
  const when = describeClaimTime(claimedAt);
  return when
    ? `This game is being run on another device (since ${when}). Nothing you do here is being saved.`
    : 'This game is being run on another device. Nothing you do here is being saved.';
}

/**
 * The claim time, for telling "that is my own phone from earlier tonight" from
 * "that is my co-director, right now" — which is the question a director
 * actually has when they meet this banner.
 *
 * Returns '' rather than a guess for an unparseable or absent timestamp, since
 * a game claimed before the field existed has none. `Invalid Date` on screen is
 * the fault `formatSeasonDateRange` already had to have fixed.
 */
export function describeClaimTime(claimedAt?: string | null): string {
  if (!claimedAt) return '';
  const ms = Date.parse(String(claimedAt));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
