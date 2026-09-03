
import { useState, useEffect } from "react";
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

  // Check for anonymous user in localStorage
  const getAnonymousUser = (): AnonymousUser | null => {
    try {
      const anonymousData = localStorage.getItem('anonymousUser');
      return anonymousData ? { ...JSON.parse(anonymousData), isAnonymous: true } : null;
    } catch {
      return null;
    }
  };

  const anonymousUser = getAnonymousUser();
  
  const user: User | null = firebaseUser ? {
    id: firebaseUser.uid,
    email: firebaseUser.email || undefined,
    name: firebaseUser.displayName || undefined,
    firstName: firebaseUser.displayName?.split(' ')[0],
    lastName: firebaseUser.displayName?.split(' ').slice(1).join(' ')
  } : null;

  const effectiveUser = user || anonymousUser;

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
