/**
 * localStorage, bucketed by who is signed in.
 *
 * Every key holding a director's setup used to be global to the browser, and
 * recorded nothing about who wrote it. Signing out cleared exactly one of them —
 * the live-game pin — because the comment in useAuth.ts said the rest should
 * stay "so signing back in resumes where you left off". True, and fine, right
 * up until the person signing back in is somebody else: a second account on the
 * same browser inherited the first one's roster, blind structure, buy-in,
 * payouts, event name and points system. That is what a league sharing a login,
 * or a director with a personal account and a club one, hits immediately.
 *
 * So a key is stored per bucket — `tournamentSettings::<uid>` — and a signed-out
 * session gets its own, `::local`. Nothing is shared between two accounts on one
 * device, and nothing has to be cleared on sign-out, which is the part that
 * matters: this app has lost a live game to over-eager clearing before, and
 * "deleting the only copy is worse than keeping a second one" is a rule paid for
 * in real tournaments.
 *
 * NOT everything is bucketed, deliberately. `playerDeviceId` is a device
 * identity by definition, `claimedPlayer_*` belongs to the phone rather than any
 * account, `leaguePanelExpanded` is a UI preference, `smgo_unlocked` is the site
 * gate, and `activeDirectorTournamentId` is already defended — cleared on logout
 * and ownership-checked against the signed-in user in TournamentDirector.tsx.
 */

/** Keys that belong to one director and must not cross accounts. */
export const SCOPED_KEYS = [
  'tournamentSettings',
  'tournamentBlindLevels',
  'tournamentPrizeStructure',
  'tournamentLocalGameId',
  'tournamentLocalProgress',
  'activeLeagueId',
  'recentPlayers',
  'setupUpdatedAt',
] as const;

/**
 * Keys built at runtime — `leagueSettings:<leagueId>` — which cannot be listed
 * up front. Matched by prefix when a bucket is swept.
 */
export const SCOPED_KEY_PREFIXES = ['leagueSettings'] as const;

/** The bucket a signed-out session writes to. */
export const LOCAL_BUCKET = 'local';

/**
 * Device-global: the uid this browser last had signed in.
 *
 * Load-bearing for a reason that is easy to miss. The setup is read in
 * useTournament's body, which runs before Firebase has restored the session —
 * `auth.currentUser` is null for the first moments of every cold load, signed in
 * or not. Reading the `::local` bucket there and correcting once auth resolves
 * would show every returning director a default tournament for a frame. So the
 * last-known uid is remembered synchronously and used as the opening guess, and
 * the hook re-reads if auth resolves to somebody else.
 */
const LAST_UID_KEY = 'lastSignedInUid';

/**
 * Device-global: which bucket has taken ownership of the pre-bucket keys.
 *
 * Storage written before this shipped has no bucket, and belongs to whoever was
 * using the browser — unknowable after the fact. The first signed-in account
 * that finds its own bucket empty adopts it and records the claim here, so a
 * SECOND account signing in later does not inherit the same setup all over
 * again, which is the bug this module exists to fix.
 *
 * Nothing is deleted by the claim. The unbucketed keys stay exactly where they
 * are, so a wrong guess costs a director their local defaults and never their
 * data — the league, its history, the points system and any saved structure are
 * all in Firestore under their own account.
 */
const LEGACY_CLAIM_KEY = 'legacySetupAdoptedBy';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Whether this device can still be written to.
 *
 * The local mirror is the safety net for when Firestore writes are BLOCKED —
 * an ad blocker cancelling every request is a case this app has actually hit,
 * and the mirror is the only reason a tournament survived it. If localStorage
 * is failing too — quota exceeded, Safari private mode, storage disabled by
 * policy — then a live game exists nowhere but this tab's memory, and every
 * write here was a `catch {}` that said nothing at all.
 *
 * The preflight checks Firestore and has never checked storage. This is the
 * other half: a condition, not an event, so it drives a standing indicator the
 * same way a blocked browser does rather than a toast that scrolls away.
 */
let storageWritable = true;
const storageListeners = new Set<() => void>();

function setStorageWritable(writable: boolean): void {
  if (storageWritable === writable) return;
  storageWritable = writable;
  storageListeners.forEach(fn => fn());
}

/** For `useSyncExternalStore`. */
export function subscribeStorageHealth(listener: () => void): () => void {
  storageListeners.add(listener);
  return () => { storageListeners.delete(listener); };
}

/** False when a write to this device last failed. */
export function isStorageWritable(): boolean {
  return storageWritable;
}

/** Test seam. Nothing in the app calls this. */
export function __resetStorageHealth(): void {
  storageWritable = true;
  storageListeners.clear();
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    setStorageWritable(true);
  } catch (err) {
    console.error('Could not write to this device:', key, err);
    setStorageWritable(false);
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // Not a health signal: failing to REMOVE something leaves stale data, which
    // is untidy but loses nothing. Only a failed write costs a director data.
    console.error('Could not clear from this device:', key, err);
  }
}

/** Which bucket a uid reads and writes. Signed out is a bucket like any other. */
export function bucketFor(uid: string | null | undefined): string {
  return uid || LOCAL_BUCKET;
}

export function scopedKey(key: string, uid: string | null | undefined): string {
  return `${key}::${bucketFor(uid)}`;
}

/** Is `key` one this module owns? Covers the runtime-built prefixes too. */
export function isScopedKey(key: string): boolean {
  if ((SCOPED_KEYS as readonly string[]).includes(key)) return true;
  return SCOPED_KEY_PREFIXES.some(prefix => key === prefix || key.startsWith(`${prefix}:`));
}

/** The uid this browser last had signed in, or null. */
export function lastSignedInUid(): string | null {
  return safeGet(LAST_UID_KEY);
}

/** Record the signed-in uid, or clear it on sign-out. */
export function rememberSignedInUid(uid: string | null | undefined): void {
  if (uid) safeSet(LAST_UID_KEY, uid);
  else safeRemove(LAST_UID_KEY);
}

function legacyClaimedBy(): string | null {
  return safeGet(LEGACY_CLAIM_KEY);
}

/**
 * May this bucket fall back to the pre-bucket key? Unclaimed storage is readable
 * by anyone; once claimed it belongs to the claimant alone.
 */
export function canReadLegacy(uid: string | null | undefined): boolean {
  const claimed = legacyClaimedBy();
  if (!claimed) return true;
  return claimed === bucketFor(uid);
}

/**
 * Read a key from this uid's bucket, falling back to the pre-bucket key.
 *
 * Normalise on read rather than migrate in bulk — the same trade payoutsOf() and
 * bandsOf() make. No stored data is rewritten, so a director who never signs in
 * again keeps working exactly as before.
 */
export function readScoped(key: string, uid: string | null | undefined): string | null {
  const scoped = safeGet(scopedKey(key, uid));
  if (scoped !== null) return scoped;
  if (canReadLegacy(uid)) return safeGet(key);
  return null;
}

export function writeScoped(key: string, value: string, uid: string | null | undefined): void {
  safeSet(scopedKey(key, uid), value);
}

export function removeScoped(key: string, uid: string | null | undefined): void {
  safeRemove(scopedKey(key, uid));
}

/** Every bucketed key currently present for a bucket, prefixes included. */
function keysInBucket(uid: string | null | undefined): string[] {
  const suffix = `::${bucketFor(uid)}`;
  const found: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const stored = localStorage.key(i);
      if (!stored || !stored.endsWith(suffix)) continue;
      const bare = stored.slice(0, -suffix.length);
      if (isScopedKey(bare)) found.push(bare);
    }
  } catch {}
  return found;
}

/**
 * Hand the signed-out bucket, or pre-bucket storage, to an account signing in.
 *
 * A director can start a standalone game with nobody signed in — the timer is
 * offline-first on purpose — and then sign in part way through. Their bucket
 * changes underneath them at that moment, so without this the roster and
 * structure they had just built would vanish on the very action that was
 * supposed to save them. That is precisely the failure the local mirror was
 * added to prevent, and it must not come back through the door this module
 * opened.
 *
 * COPY, never move. The source bucket is left untouched, so nothing is ever
 * destroyed by an adoption that turns out to be wrong.
 *
 * Only fills keys the account does not already have. An account with its own
 * setup is never overwritten by whatever the last signed-out session left
 * behind.
 */
export function claimStorageFor(uid: string | null | undefined): void {
  rememberSignedInUid(uid);
  if (!uid) return;

  const candidates = new Set<string>([...keysInBucket(null), ...keysInBucket(uid)]);
  let adoptedLegacy = false;

  for (const key of candidates) {
    if (safeGet(scopedKey(key, uid)) !== null) continue;
    const fromLocal = safeGet(scopedKey(key, null));
    if (fromLocal !== null) safeSet(scopedKey(key, uid), fromLocal);
  }

  if (canReadLegacy(uid)) {
    for (const key of SCOPED_KEYS) {
      if (safeGet(scopedKey(key, uid)) !== null) continue;
      const legacy = safeGet(key);
      if (legacy !== null) {
        safeSet(scopedKey(key, uid), legacy);
        adoptedLegacy = true;
      }
    }
    if (adoptedLegacy) safeSet(LEGACY_CLAIM_KEY, bucketFor(uid));
  }
}

/**
 * Put this device back to factory for one account, keeping every result.
 *
 * Clears the account's bucket, the signed-out bucket, the pre-bucket keys and
 * the claim marker. This is the one place in this module that deletes, and it
 * is safe to do so because a person has explicitly asked for it — everything
 * that matters (leagues, seasons, players, results, saved structures, the game
 * being run) lives in Firestore under the account, not here.
 *
 * TWO KEYS SURVIVE ON PURPOSE.
 *
 * `smgo_unlocked` is the site access gate. Clearing it would lock a director
 * out of their own app behind a password prompt as the reward for tidying up.
 *
 * `playerDeviceId` is this browser's identity, and seat check-in is built on
 * it: `claims` maps a playerId to a device id, so regenerating it would orphan
 * every seat this device had claimed. `claimedPlayer_*` is left for the same
 * reason — it belongs to the participant half of the phone and is not the
 * director's to clear.
 *
 * The caller is responsible for the OTHER half: the account's copy in
 * `userSettings/{uid}`. Clearing only the device leaves that intact, and the
 * next sign-in pulls back exactly what was just cleared.
 */
export function clearScopedStorage(uid: string | null | undefined): void {
  const targets = new Set<string>();

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const stored = localStorage.key(i);
      if (!stored) continue;
      const marker = stored.lastIndexOf('::');
      if (marker === -1) {
        // Pre-bucket storage. SCOPED_KEYS below covers the fixed names; this
        // catches the runtime-built ones, `leagueSettings:<leagueId>`, which
        // cannot be listed up front.
        if (isScopedKey(stored)) targets.add(stored);
        continue;
      }
      const bare = stored.slice(0, marker);
      const bucket = stored.slice(marker + 2);
      if (!isScopedKey(bare)) continue;
      if (bucket === bucketFor(uid) || bucket === LOCAL_BUCKET) targets.add(stored);
    }
  } catch {}

  for (const key of SCOPED_KEYS) targets.add(key);
  targets.add(LEGACY_CLAIM_KEY);

  for (const key of targets) safeRemove(key);
}
