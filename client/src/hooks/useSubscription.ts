import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

export function useSubscription() {
  const { user, isAnonymous } = useAuth();
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || isAnonymous) {
      setIsPro(false);
      setIsLoading(false);
      return;
    }
    const unsub = onSnapshot(doc(db, 'users', user.id), (snap) => {
      setIsPro(snap.data()?.subscriptionStatus === 'pro');
      setIsLoading(false);
    }, () => {
      setIsPro(false);
      setIsLoading(false);
    });
    return unsub;
  }, [user?.id, isAnonymous]);

  return { isPro, isLoading };
}
