/**
 * The names offered when a director types into Add Player.
 *
 * Per account per device, in localStorage — NOT the league roster, which lives
 * in Firestore and carries results. The two were reported together ("scrolling
 * through extra names that needn't be there") and they are fixed separately:
 * removing a name here costs nothing, because typing it again puts it back.
 *
 * Lifted out of `PlayerSection`, where the cap and the de-dupe were inline and
 * had no test by construction — the argument `lib/tableBalance.ts` and
 * `lib/seating.ts` were extracted on. The behaviour is unchanged.
 */
export interface RecentPlayer {
  name: string;
  lastUsed: number;
}

/** Only the twenty most recent are kept, so the picker stays a picker. */
export const RECENT_PLAYER_LIMIT = 20;

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
