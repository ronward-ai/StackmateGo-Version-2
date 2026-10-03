import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { lastSignedInUid, readScoped, writeScoped } from '@/lib/scopedStorage';
import {
  addRecent,
  removeRecent,
  resolveRecent,
  sanitiseRecent,
  type RecentPlayer,
} from '@/lib/recentPlayers';

/**
 * Recent Players, following the ACCOUNT rather than one browser.
 *
 * It was per-device localStorage, so a new tablet started with nothing — and
 * once the League Roster chips were removed as doing the same job twice, this
 * became the only list of names a director has. It lives on
 * `userSettings/{uid}.recentPlayers`, the owner-only document that already
 * carries the synced setup (`useDirectorSetupSync`) and the preflight's
 * `lastSeenAt`. Its rule has no field whitelist, so this needs no rules deploy;
 * every other writer of that document uses `merge` or touches only its own
 * field, so nothing here is clobbered and nothing here clobbers them.
 *
 * `lib/recentPlayers.ts` owns the decisions — which copy wins, what a stored
 * value may contain. This owns the Firestore.
 *
 * ## Writes happen in `add` and `remove`, and NOWHERE ELSE
 *
 * That is the load-bearing rule. An effect that wrote whenever the list changed
 * would write on every snapshot, its own echo included — the shape that once had
 * a live game writing to Firestore twice a second (see `useAuth`'s memoisation
 * note). The single exception is the ADOPT push on a first sign-in, which runs
 * once per uid behind a ref.
 *
 * ## A live listener, so the tablet sees what the laptop added
 *
 * One document, one `onSnapshot`. It also keeps the accepted race small: two
 * devices pressing Add in the same second is last-writer-wins on the array, so
 * one name can be lost and is simply retyped. Each action starts from the latest
 * snapshot, so the window is a round trip — a transaction would be machinery out
 * of proportion to retyping a name.
 *
 * ## localStorage stays, as the cache and as the whole store when signed out
 *
 * Every snapshot is written to the scoped cache, so the device carries the
 * account's latest list offline. A signed-out or anonymous session never touches
 * Firestore at all — `!user || isAnonymous` is the CLAUDE.md test for "not signed
 * in for real", and an anonymous session has no account to follow.
 *
 * A failed cloud write logs and keeps the local list. It is a convenience, and a
 * browser that is blocking writes already carries the standing "Not syncing"
 * chip from the preflight; a toast about a list of names would be noise on top of
 * the condition already on screen.
 */
export function useRecentPlayers() {
  const { user, isAnonymous, isLoading } = useAuth();
  const cloudUid = !isLoading && user && !isAnonymous ? String(user.id) : null;
  // The local bucket, exactly as PlayerSection chose it before: an anonymous
  // session has its own, and a signed-out one falls back to the last account.
  const cacheUid = isAnonymous ? null : (user?.id != null ? String(user.id) : lastSignedInUid());

  const [recentPlayers, setRecentPlayers] = useState<RecentPlayer[]>(() => readCache(cacheUid));

  // Callbacks read these through refs, never a captured value — the rule
  // `lib/scopedStorage.ts` records, so a save after a switch of account cannot
  // land in the previous director's bucket or document.
  const listRef = useRef(recentPlayers);
  listRef.current = recentPlayers;
  const cloudUidRef = useRef(cloudUid);
  cloudUidRef.current = cloudUid;
  const cacheUidRef = useRef(cacheUid);
  cacheUidRef.current = cacheUid;

  /** The uid this device has already pushed its own list up for. */
  const adoptedForRef = useRef<string | null>(null);

  // A different bucket — signing in or out — means a different list.
  useEffect(() => {
    setRecentPlayers(readCache(cacheUid));
  }, [cacheUid]);

  useEffect(() => {
    if (!cloudUid) return;
    return onSnapshot(
      doc(db, 'userSettings', cloudUid),
      snap => {
        const remote = sanitiseRecent(snap.exists() ? snap.data()?.recentPlayers : undefined);
        const { list, pushLocal } = resolveRecent(remote, readCache(cloudUid));
        setRecentPlayers(list);
        writeCache(list, cloudUid);
        if (pushLocal && adoptedForRef.current !== cloudUid) {
          adoptedForRef.current = cloudUid;
          pushCloud(cloudUid, list);
        }
      },
      error => console.warn('Could not read recent players for this account:', error),
    );
  }, [cloudUid]);

  const commit = useCallback((next: RecentPlayer[]) => {
    listRef.current = next;
    setRecentPlayers(next);
    writeCache(next, cacheUidRef.current);
    const uid = cloudUidRef.current;
    if (uid) pushCloud(uid, next);
  }, []);

  const add = useCallback((name: string) => commit(addRecent(listRef.current, name)), [commit]);
  const remove = useCallback((name: string) => commit(removeRecent(listRef.current, name)), [commit]);

  return { recentPlayers, add, remove };
}

function readCache(uid: string | null): RecentPlayer[] {
  try {
    return sanitiseRecent(JSON.parse(readScoped('recentPlayers', uid) || 'null')) ?? [];
  } catch {
    return [];
  }
}

/** Through the scoped helpers, so a failed local write still raises the
 *  storage-health banner exactly as it did before. */
function writeCache(list: RecentPlayer[], uid: string | null) {
  writeScoped('recentPlayers', JSON.stringify(list), uid);
}

/** `merge: true` replaces this one field and leaves `setup` and `lastSeenAt`
 *  alone. An array under merge is REPLACED, not unioned — which is what lets a
 *  removal reach the other devices. */
function pushCloud(uid: string, list: RecentPlayer[]) {
  setDoc(doc(db, 'userSettings', uid), { recentPlayers: list }, { merge: true })
    .catch(error => console.warn('Could not save recent players to this account:', error));
}
