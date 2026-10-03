/**
 * The names offered when a director types into Add Player — the ONLY list of
 * them, since the League Roster chips were removed as doing this job twice.
 *
 * It follows the ACCOUNT: `userSettings/{uid}.recentPlayers`, through
 * `hooks/useRecentPlayers.ts`, with localStorage as the offline cache and the
 * whole store for a signed-out director. Removing a name costs nothing, because
 * typing it again puts it back.
 *
 * Lifted out of `PlayerSection`, where the cap and the de-dupe were inline and
 * had no test by construction — the argument `lib/tableBalance.ts` and
 * `lib/seating.ts` were extracted on. The behaviour is unchanged.
 */
export interface RecentPlayer {
  name: string;
  lastUsed: number;
}

/**
 * How many names are kept. It was twenty while the list lived on one device;
 * following the account it serves a whole league, and the expanded view already
 * has a search box and scrolls, so a full league plus the regular walk-ins fits.
 */
export const RECENT_PLAYER_LIMIT = 50;

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Newest first, and the same person typed twice is still one entry.
 *
 * The de-dupe is case-INSENSITIVE on purpose: a director who types `dave` after
 * `Dave` means the same player, and two rows for one person is the clutter this
 * list is complained about for.
 */
export function addRecent(
  list: readonly RecentPlayer[],
  name: string,
  now: number = Date.now(),
): RecentPlayer[] {
  const trimmed = (name || '').trim();
  if (!trimmed) return [...list];
  return [
    { name: trimmed, lastUsed: now },
    ...list.filter(p => !sameName(p.name, trimmed)),
  ].slice(0, RECENT_PLAYER_LIMIT);
}

/** Drops one name, leaving the rest in the order they were in. */
export function removeRecent(
  list: readonly RecentPlayer[],
  name: string,
): RecentPlayer[] {
  const trimmed = (name || '').trim();
  if (!trimmed) return [...list];
  return list.filter(p => !sameName(p.name, trimmed));
}

/**
 * What came back from Firestore, made safe — or `null` when there is no usable
 * list there at all.
 *
 * Settings travel, and so does this document: a field written by a newer build,
 * or by hand in the console, will reach an older one. A malformed entry is
 * dropped rather than rendered; a field that is not an array at all reads as
 * "no cloud list", which `resolveRecent` then answers by adopting this device's.
 */
export function sanitiseRecent(raw: unknown): RecentPlayer[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = raw
    .filter((p: any) => p && typeof p.name === 'string' && p.name.trim()
      && typeof p.lastUsed === 'number' && Number.isFinite(p.lastUsed))
    .map((p: any) => ({ name: p.name.trim(), lastUsed: p.lastUsed }))
    .sort((a, b) => b.lastUsed - a.lastUsed);
  const out: RecentPlayer[] = [];
  for (const p of valid) {
    if (!out.some(q => sameName(q.name, p.name))) out.push(p);
    if (out.length === RECENT_PLAYER_LIMIT) break;
  }
  return out;
}

/**
 * Which copy a signed-in device should use, and whether to push its own up.
 *
 * - **The cloud has a list → it wins outright**, and becomes this device's cache.
 * - **The cloud has none → this device's list is adopted**, and pushed up once.
 *
 * **NEVER a union, and that is the whole rule.** Merging the two would bring back
 * every name removed with × on another device — the one thing × exists to do —
 * every time an older device signed in. Same instinct as `lib/scopedStorage.ts`'s
 * adoption and `lib/setupSync.ts`'s "pull only onto an empty table": one copy
 * is chosen, never blended.
 *
 * An EMPTY cloud list is still a list. A director who removed every name has
 * said so, and must not have the device's old ones pushed back up over it.
 */
export function resolveRecent(
  remote: RecentPlayer[] | null,
  local: readonly RecentPlayer[],
): { list: RecentPlayer[]; pushLocal: boolean } {
  if (remote !== null) return { list: remote, pushLocal: false };
  return { list: [...local], pushLocal: local.length > 0 };
}
