
import { useState, useEffect, useMemo } from "react";
import { auth } from "../lib/firebase";
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
  const [loginError, setLoginError] = useState<string | undefined>();
  const [registerError, setRegisterError] = useState<string | undefined>();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = async () => {
    try {
      setLoginError(undefined);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setLoginError(error.message);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, password: string) => {
    try {
      setLoginError(undefined);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setLoginError(error.message);
      throw error;
    }
  };

  const register = async () => {
    try {
      setRegisterError(undefined);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      setRegisterError(error.message);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, password: string) => {
    try {
      setRegisterError(undefined);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setRegisterError(error.message);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      setLoginError(undefined);
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      setLoginError(error.message);
      throw error;
    }
  };

  const signInAnonymously = async () => {
    try {
      setLoginError(undefined);
      await firebaseSignInAnonymously(auth);
    } catch (error: any) {
      setLoginError(error.message);
      throw error;
    }
  };

  const logout = async () => {
    // Un-pin the live tournament. PokerTimer redirects / straight to
    // /tournament/{id}/director whenever activeDirectorTournamentId is set, so
    // leaving it behind meant the app reopened the game you had just signed out
    // of — and the home screen, with its Sign In button, became unreachable.
    //
    // Only the "reopen this automatically" pointer goes. The saved tournament,
    // blind structure and prize settings stay, so signing back in resumes where
    // you left off.
    try { localStorage.removeItem('activeDirectorTournamentId'); } catch {}
    await signOut(auth);
  };

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
    register,
    registerWithEmail,
    resetPassword,
    signInAnonymously,
    logout,
    loginError,
    registerError,
  };
}
