/**
 * Whether a director's stored setup should travel up to their account, down to
 * this device, or stay where it is.
 *
 * The setup — timer and branding settings, the blind structure, the buy-in and
 * payouts — was device-local, which quietly contradicted the whole premise of
 * an app a director runs from a laptop one week and a tablet the next. Putting
 * it in `userSettings/{uid}` makes it follow the account, which is what a
 * shared club login actually needs: whoever is directing tonight signs in and
 * has the league's structure already.
 *
 * The decision lives here, free of React and Firebase, because the dangerous
 * part is not the read or the write — it is choosing which copy wins. This
 * codebase has lost a roster to a device pushing its idea of the truth over a
 * newer one, and the rule that prevents it is worth being able to test without
 * mocking Firestore.
 */

export interface DirectorSetup {
  settings?: unknown;
  blindLevels?: unknown[];
  prizeStructure?: unknown;
  /** ISO, written whenever the setup is saved. */
  updatedAt?: string;
}

/** Milliseconds, or null when a timestamp is missing or unparseable. */
export function setupTime(updatedAt: string | null | undefined): number | null {
  if (!updatedAt) return null;
  const ms = new Date(updatedAt).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Should the account's copy replace this device's?
 *
 * Strictly newer, never merely different. Equal timestamps mean the two are the
 * same save and pulling would be churn; and a remote copy with no timestamp at
 * all loses to a local one that has one, because an undated copy is the older
 * scheme by definition.
 *
 * A device with NO setup takes whatever the account has — that is the case this
 * feature exists for: a director signing in on a borrowed tablet.
 */
export function isRemoteSetupNewer(
  local: DirectorSetup | null | undefined,
  remote: DirectorSetup | null | undefined,
): boolean {
  if (!remote || (!remote.settings && !remote.blindLevels && !remote.prizeStructure)) return false;
  if (!local || (!local.settings && !local.blindLevels && !local.prizeStructure)) return true;

  const localMs = setupTime(local.updatedAt);
  const remoteMs = setupTime(remote.updatedAt);
  if (remoteMs === null) return false;
  if (localMs === null) return true;
  return remoteMs > localMs;
}

/**
 * Is it safe to drop the account's setup onto what is on screen?
 *
 * Only ever with an empty table and no live game. The setup includes the blind
 * structure and the payouts, so applying it to a tournament already under way
 * would rewrite the terms of a game in progress — and for a live game Firestore
 * holds the real settings on the tournament document anyway, which is a
 * different source of truth arriving down a different path.
 *
 * Pulling is therefore a sign-in-time convenience, never an ongoing sync. The
 * push direction has no such restriction: recording what a director configured
 * is always safe.
 */
export function canApplyRemoteSetup(opts: {
  playerCount: number;
  isDatabaseTournament: boolean;
}): boolean {
  return opts.playerCount === 0 && !opts.isDatabaseTournament;
}

/**
 * The comparison key for "have I already written exactly this?".
 *
 * Every Firestore sync effect in this app serialises its payload and returns
 * early when it matches what it last wrote, because an effect without that
 * guard once wrote twice a second for the length of a tournament. `updatedAt`
 * is deliberately excluded: it changes on every save by definition, so
 * including it would defeat the comparison entirely.
 */
export function setupFingerprint(setup: DirectorSetup): string {
  return JSON.stringify({
    settings: setup.settings ?? null,
    blindLevels: setup.blindLevels ?? null,
    prizeStructure: setup.prizeStructure ?? null,
  });
}
