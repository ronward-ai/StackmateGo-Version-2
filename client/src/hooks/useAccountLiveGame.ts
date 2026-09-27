import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { otherLiveGame, type LiveTournamentCandidate } from '@/lib/liveTournament';

/**
 * The account's live game, when it is being run somewhere that is not here.
 *
 * WHY A SEPARATE ASK, when `PokerTimer`'s resume effect already looks this up:
 * that effect is gated twice and both gates are load-bearing.
 *
 *  - it returns early when `activeDirectorTournamentId` is set, so a pin naming
 *    last night's finished game stops the lookup before it happens;
 *  - and `?home=1` suppresses it, which is correct — that parameter means "do
 *    not reopen the game I just left", and New Tournament depends on it.
 *
 * "Do not reopen mine" is not "do not tell me about theirs". This is asked past
 * both gates, and it can only ever produce a sentence and a button — it never
 * navigates, writes, or changes what the console is doing.
 */
export interface AccountLiveGame extends LiveTournamentCandidate {
  players?: unknown;
  settings?: any;
  name?: string | null;
  details?: { name?: string } | null;
}

export function useAccountLiveGame(thisGameId: string | null | undefined): AccountLiveGame | null {
  const { user, isAnonymous, isLoading: authLoading } = useAuth();
  const [game, setGame] = useState<AccountLiveGame | null>(null);

  // `user?.id`, a string — never the object. Sixteen effects in this app list
  // `user` in a dependency array, and a referentially fresh object there is
  // what once had a live game writing to Firestore twice a second.
  const uid = !isAnonymous && user?.id ? user.id : null;

  useEffect(() => {
    if (authLoading || !uid) { setGame(null); return; }

    let cancelled = false;
    (async () => {
      try {
        // A READ, not a listener. A third onSnapshot on this collection is
        // churn in the one component that re-renders every second, and the same
        // query the resume and the auto-save already make once per mount.
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getDocs(
          query(collection(db, 'activeTournaments'), where('ownerId', '==', uid)),
        );
        if (cancelled) return;
        setGame(
          otherLiveGame(
            snap.docs.map(d => ({ id: d.id, ...d.data() })) as AccountLiveGame[],
            thisGameId,
          ),
        );
      } catch (err) {
        // Not knowing must never produce an accusation. A failed read says
        // nothing, exactly as `pinIsDead` refuses to act on `error`.
        if (!cancelled) setGame(null);
        console.error('Could not check for a game running elsewhere:', err);
      }
    })();

    return () => { cancelled = true; };
    // Re-asked when the console changes which game it is on, so pressing
    // "Open it" clears the banner by itself rather than needing to be told.
  }, [authLoading, uid, thisGameId]);

  return game;
}
