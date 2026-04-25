
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
    isAnonymous: !!anonymousUser && !user,
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
