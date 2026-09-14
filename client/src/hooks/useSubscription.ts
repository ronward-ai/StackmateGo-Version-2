import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';

/**
 * Whether payments are configured, asked of the server rather than guessed
 * from a build-time variable.
 *
 * This used to be `!!import.meta.env.VITE_API_BASE_URL` — a variable that
 * answers "where does the API live" (empty is CORRECT on Railway, where the
 * client and server share an origin), not "are payments configured". The two
 * questions got conflated, which is what made turning Stripe on a trap:
 * setting STRIPE_SECRET_KEY etc. on Railway did nothing to the CLIENT,
 * because the client's flag was baked into the build from an unrelated
 * variable nobody was setting either way.
 *
 * `/api/payments-status` is the real signal — server/routes.ts's
 * `paymentsConfigured()` checks the actual Stripe env vars. Fetched once and
 * cached at module scope, since it answers a question about server
 * configuration that does not change within a running session.
 */
let paymentsActivePromise: Promise<boolean> | null = null;

function fetchPaymentsActive(): Promise<boolean> {
  if (!paymentsActivePromise) {
    paymentsActivePromise = fetch('/api/payments-status')
      .then(res => (res.ok ? res.json() : { enabled: false }))
      .then(data => !!data.enabled)
      // A network error, or an older deployed server without this route yet,
      // must not be mistaken for "payments are configured and this user is
      // not Pro" — it means the question could not be answered, and the safe
      // default is the same one payments-not-configured already uses.
      .catch(() => false);
  }
  return paymentsActivePromise;
}

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

    let cancelled = false;
    let unsub: (() => void) | undefined;

    fetchPaymentsActive().then(paymentsActive => {
      if (cancelled) return;

      if (!paymentsActive) {
        // Payments not yet configured — grant Pro to all registered users,
        // exactly as before, just decided by a real check now.
        setIsPro(true);
        setIsLoading(false);
        return;
      }

      unsub = onSnapshot(doc(db, 'users', user.id), (snap) => {
        setIsPro(snap.data()?.subscriptionStatus === 'pro');
        setIsLoading(false);
      }, (error) => {
        // Leave the last known value alone rather than demoting a paying
        // customer on a transient blip — this used to call setIsPro(false)
        // here, which flashed Pro features off for anyone mid-session while
        // the listener reconnects. A blip self-heals on the next successful
        // snapshot; this only needs to stop making it worse.
        console.error('Subscription status listener error:', error);
        setIsLoading(false);
      });
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user?.id, isAnonymous]);

  return { isPro, isLoading };
}
