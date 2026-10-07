
import { useState, useEffect, useMemo, useCallback } from "react";
import { auth } from "../lib/firebase";
import { claimStorageFor, rememberSignedInUid } from "../lib/scopedStorage";
import { withDeadline } from "../lib/deadline";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  User as FirebaseUser
} from "firebase/auth";

interface User {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

interface AnonymousUser {
  id: string;
  playerName: string;
  tournamentId: string;
  joinedAt: string;
  isAnonymous: true;
}

export function useAuth() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // Hand this browser's stored setup to whoever just signed in, BEFORE the
      // state update that lets the console read it — see lib/scopedStorage.ts.
      //
      // Anonymous sessions are skipped deliberately. A QR participant holds a
      // real, verifiable Firebase session, but it is a throwaway one with no
      // director's setup behind it, and letting it claim a bucket would hand
      // the previous director's storage to a stranger's phone.
      if (user && !user.isAnonymous) claimStorageFor(user.uid);
      setFirebaseUser(user);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Every action is a useCallback with no deps: each touches only `auth`,
  // which is stable. They were fresh each render, and the
  // participant view lists `signInAnonymously` in an effect's deps — so that
  // effect re-ran on every render and could mint a SECOND anonymous identity
  // (October audit, Low).
  const login = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const signInAnonymously = useCallback(async () => {
    await firebaseSignInAnonymously(auth);
  }, []);

  const logout = useCallback(async () => {
    // Un-pin the live tournament. PokerTimer redirects / straight to
    // /tournament/{id}/director whenever activeDirectorTournamentId is set, so
    // leaving it behind meant the app reopened the game you had just signed out
    // of — and the home screen, with its Sign In button, became unreachable.
    //
    // Only the "reopen this automatically" pointer goes. The saved tournament,
    // blind structure and prize settings stay, so signing back in resumes where
    // you left off — and since they are now stored per account
    // (lib/scopedStorage.ts), "where you left off" means YOUR setup rather than
    // whatever the last person to use this browser had. That distinction is the
    // whole reason the buckets exist: this used to hand a second account the
    // first one's roster and structure.
    // HAND THE GAME BACK BEFORE FORGETTING WHICH ONE IT WAS.
    //
    // Logging out IS the handover in this app, so the device giving up the game
    // gives up its claim on it too. Nothing used to: `controllingDeviceId` had
    // one writer and it only ever SET, so a game stayed held by whichever device
    // last ran it — for good — and the next device to open it went read-only
    // under a banner claiming the game was "being run on another device" when
    // nobody was running it at all. Reported from a live night.
    //
    // Two things about the ordering are load-bearing:
    //
    // - **Awaited, and BEFORE `signOut`.** The rule on this write is
    //   `isExistingDocOwner()`, so once the session is gone there is no
    //   `request.auth.uid` and Firestore refuses it. Fire-and-forget loses the
    //   same race against the full page load the caller does next.
    // - **Never blocking.** A failure logs and sign-out proceeds. Being unable to
    //   release a claim must not trap somebody signed in.
    //
    // The id comes from the pin rather than `consoleTournamentId()`, which is the
    // honest answer but lives in PokerTimer's state and cannot be reached from
    // here. The pin names the game the console is on in every ordinary case, and
    // where it does not, this simply does nothing — today's behaviour exactly.
    try {
      const pinned = localStorage.getItem('activeDirectorTournamentId');
      if (pinned) {
        const [{ releaseLiveGameControl }, { getConsoleId }] = await Promise.all([
          import('@/lib/liveGameWrite'),
          import('@/lib/consoleId'),
        ]);
        // Bounded: offline or blocked, the transaction never settles, and
        // being unable to release must not trap somebody signed in.
        await withDeadline(releaseLiveGameControl(pinned, getConsoleId()), undefined, 'release of control');
      }
    } catch (err) {
      console.error('Could not hand back control of the live game:', err);
    }

    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    // Forget WHO was signed in, but not what they saved. Their setup stays in
    // their own bucket and is waiting for them next time; what must not survive
    // is this browser believing the next person to arrive is them, because the
    // setup is read before Firebase has restored a session and the last-known
    // uid is what that read guesses with.
    rememberSignedInUid(null);
    await signOut(auth);
  }, []);

  // EVERYTHING BELOW IS MEMOISED, and that is load-bearing.
  //
  // `user` used to be an object literal built on every render, and
  // getAnonymousUser() read and parsed localStorage on every render for a
  // second one. Sixteen effects across the app list `user` in a dependency
  // array, so a referentially fresh object meant "run on every render" — and
  // PokerTimer re-renders every second, because that is how the clock advances.
  //
  // Two of its three Firestore sync effects had no payload guard, so a live
  // game wrote to Firestore TWICE A SECOND — about 7,200 writes an hour where a
  // handful were needed. Enough to exhaust a day's allowance in an evening,
  // which surfaces as `resource-exhausted` and a "Sync issue" toast; very
  // probably the real story behind the quota exhaustion that was chased through
  // browser storage, iOS UA detection and IndexedDB. The timer interval effect
  // depended on `user` too, so the one-second interval was torn down and
  // recreated on every render.
  //
  // Referential instability is invisible at the call site. Keep it memoised.

  // The legacy `anonymousUser` key, which NOTHING writes — honoured only for
  // stale data, so reading it once at mount is enough.
  const [anonymousUser] = useState<AnonymousUser | null>(() => {
    try {
      const anonymousData = localStorage.getItem('anonymousUser');
      return anonymousData ? { ...JSON.parse(anonymousData), isAnonymous: true } : null;
    } catch {
      return null;
    }
  });

  const user: User | null = useMemo(() => firebaseUser ? {
    id: firebaseUser.uid,
    email: firebaseUser.email || undefined,
    name: firebaseUser.displayName || undefined,
    firstName: firebaseUser.displayName?.split(' ')[0],
    lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ')
  } : null, [firebaseUser?.uid, firebaseUser?.email, firebaseUser?.displayName]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveUser = useMemo(() => user || anonymousUser, [user, anonymousUser]);

  return {
    user: effectiveUser,
    isLoading,
    isAuthenticated: !!firebaseUser,
    // Firebase's own flag is the authority. This used to read only the legacy
    // `anonymousUser` localStorage key — which nothing writes — so isAnonymous
    // was ALWAYS false, including for a genuine Firebase anonymous session.
    //
    // That broke every consumer that uses it to mean "not properly signed in".
    // TournamentParticipantView signs visitors in anonymously on arrival, so
    // after a logout the app believed you were signed in: no Sign In button in
    // the header, the home page redirecting back into the tournament, and the
    // director route letting you through to an ownership check you could not
    // pass. The legacy key is still honoured for anyone holding stale data.
    isAnonymous: firebaseUser ? firebaseUser.isAnonymous : !!anonymousUser,
    login,
    loginWithEmail,
    registerWithEmail,
    resetPassword,
    signInAnonymously,
    logout,
  };
}
