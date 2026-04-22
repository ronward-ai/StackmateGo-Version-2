import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

// Payments are only active once VITE_API_BASE_URL is configured.
// Until then every authenticated user gets full Pro access.
const PAYMENTS_ACTIVE = !!import.meta.env.VITE_API_BASE_URL;

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
    // Payments not yet configured — grant Pro to all authenticated users
    if (!PAYMENTS_ACTIVE) {
      setIsPro(true);
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
