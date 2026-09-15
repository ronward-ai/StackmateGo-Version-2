import { useCallback, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { clearScopedStorage } from '@/lib/scopedStorage';
import {
  DELETION_ORDER,
  chunk,
  type WipeCounts,
  type WipeStage,
} from '@/lib/accountWipe';

/**
 * The two destructive controls in Settings.
 *
 * `resetDevice` puts this browser and this account's saved setup back to
 * factory, keeping every result. `deleteEverything` removes what the account
 * owns from Firestore and cannot be undone.
 *
 * lib/accountWipe.ts owns the order and the batching; this owns the Firestore.
 */

export interface WipeProgress {
  /** What is being deleted right now, in the user's words. */
  stage: string;
  done: number;
  total: number;
}

/** Every document id a stage will delete, resolved before anything is written. */
async function idsForStage(
  stage: WipeStage,
  uid: string,
  leagueIds: string[],
): Promise<string[]> {
  const { collection, getDocs, query, where } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');

  const run = async (field: string, value: string) => {
    const snap = await getDocs(query(collection(db, stage.collection), where(field, '==', value)));
    return snap.docs.map(d => d.id);
  };

  if (stage.scope === 'owner') return run('ownerId', uid);
  if (stage.scope === 'user') return run('userId', uid);

  // League-scoped: one query per league, since Firestore has no OR across a
  // list this long and a league can be deleted independently anyway.
  const ids: string[] = [];
  for (const leagueId of leagueIds) ids.push(...(await run('leagueId', leagueId)));
  return ids;
}

async function ownedLeagueIds(uid: string): Promise<string[]> {
  const { collection, getDocs, query, where } = await import('firebase/firestore');
  const { db } = await import('@/lib/firebase');
  const snap = await getDocs(query(collection(db, 'leagues'), where('ownerId', '==', uid)));
  return snap.docs.map(d => d.id);
}

export function useAccountReset() {
  const { user, isAnonymous } = useAuth();
  const uid = user && !isAnonymous ? user.id : null;

  const [isWorking, setIsWorking] = useState(false);
  const [progress, setProgress] = useState<WipeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Put this device back to factory.
   *
   * BOTH halves or neither. Clearing local storage alone leaves the account's
   * copy in userSettings/{uid}, and the next sign-in pulls back exactly what
   * was just cleared — which would make the button look broken in the most
   * confusing way possible.
   */
  const resetDevice = useCallback(async () => {
    setError(null);
    setIsWorking(true);
    try {
      if (uid) {
        try {
          const { doc, updateDoc, deleteField } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          // Only the setup field. lastSeenAt is the ad-blocker preflight's and
          // has nothing to do with a director's settings.
          await updateDoc(doc(db, 'userSettings', uid), { setup: deleteField() });
        } catch (err) {
          // No document yet, or offline. The local clear below is the part the
          // user asked for and must still happen.
          console.warn('Could not clear the saved setup for this account:', err);
        }
      }
      clearScopedStorage(uid);
      // The established clean slate: discards in-memory state, suppresses the
      // pin and the resume. See the logout note in CLAUDE.md.
      window.location.href = '/?home=1';
    } catch (err: any) {
      setError(err?.message || 'Could not reset this device.');
      setIsWorking(false);
    }
  }, [uid]);

  /** What deleting would remove, so the confirmation can show it. */
  const countEverything = useCallback(async (): Promise<WipeCounts> => {
    if (!uid) return {};
    const leagueIds = await ownedLeagueIds(uid);
    const counts: WipeCounts = {};
    for (const stage of DELETION_ORDER) {
      counts[stage.collection] = stage.collection === 'leagues'
        ? leagueIds.length
        : (await idsForStage(stage, uid, leagueIds)).length;
    }
    return counts;
  }, [uid]);

  /**
   * Delete everything this account owns, in DELETION_ORDER.
   *
   * Stops at the first stage that fails and says which one. A wipe that half
   * finished silently would leave a director unable to tell what they still
   * have — and for the league-scoped stages, stopping BEFORE `leagues` is
   * precisely what keeps the remainder deletable on a retry.
   */
  const deleteEverything = useCallback(async () => {
    if (!uid) return;
    setError(null);
    setIsWorking(true);
    setProgress(null);

    try {
      const { collection, doc, writeBatch } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const leagueIds = await ownedLeagueIds(uid);

      for (const stage of DELETION_ORDER) {
        const ids = stage.collection === 'leagues'
          ? leagueIds
          : await idsForStage(stage, uid, leagueIds);
        if (ids.length === 0) continue;

        let done = 0;
        setProgress({ stage: stage.label, done, total: ids.length });

        for (const group of chunk(ids)) {
          try {
            const batch = writeBatch(db);
            for (const id of group) batch.delete(doc(collection(db, stage.collection), id));
            await batch.commit();
          } catch (err: any) {
            throw new Error(`Stopped while deleting ${stage.label}: ${err?.message || err}`);
          }
          done += group.length;
          setProgress({ stage: stage.label, done, total: ids.length });
        }
      }

      // The account's own setup goes last, and only its fields — the document
      // may legitimately survive holding lastSeenAt.
      try {
        const { deleteField, updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(collection(db, 'userSettings'), uid), { setup: deleteField() });
      } catch {}

      clearScopedStorage(uid);
      window.location.href = '/?home=1';
    } catch (err: any) {
      setError(err?.message || 'Could not delete this account’s data.');
      setIsWorking(false);
      setProgress(null);
    }
  }, [uid]);

  return {
    canReset: true,
    canDelete: !!uid,
    isWorking,
    progress,
    error,
    resetDevice,
    countEverything,
    deleteEverything,
  };
}
