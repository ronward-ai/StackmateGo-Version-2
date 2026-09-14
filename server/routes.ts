import { type Express } from "express";
import { Server as HTTPServer } from 'http';
import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { statusForSubscription, isNewerEvent } from './lib/subscriptionStatus';
import { checkRateLimit } from './lib/rateLimit';

/**
 * This project's data does NOT live in the (default) Firestore database.
 *
 * The database was provisioned by Google AI Studio and carries a generated
 * name; the client passes it explicitly to initializeFirestore (see
 * client/src/lib/firebase.ts). getFirestore() with no argument talks to
 * (default), which for this project is a different, empty database — so the
 * server would silently find no tournaments and report "not found".
 *
 * Override with FIREBASE_DATABASE_ID if the database is ever moved.
 */
const KNOWN_DATABASE_ID = 'ai-studio-127bb0ae-6c5c-42d1-a030-fd85760f05b1';
const DATABASE_ID = (process.env.FIREBASE_DATABASE_ID || '').trim() || KNOWN_DATABASE_ID;

// Lazy-init Firebase Admin (only when env vars are present). One app backs
// both the Firestore handle below and getAdminAuth() — initializeApp() is
// project-wide, not tied to either product.
function ensureAdminApp(): boolean {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return false;
  try {
    if (!getApps().length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({ credential: cert(serviceAccount) });
    }
    return true;
  } catch {
    return false;
  }
}

function getAdminDb() {
  if (!ensureAdminApp()) return null;
  try {
    return getFirestore(DATABASE_ID);
  } catch {
    return null;
  }
}

/**
 * Verifies a Firebase ID token from an `Authorization: Bearer <token>` header
 * and returns the decoded token, or null if it is missing, invalid, expired,
 * or belongs to an anonymous session.
 *
 * `/api/create-checkout-session` used to take `uid` and `email` straight from
 * the request body — anyone could POST any uid and any email, which made it a
 * free "make Stripe email this address" primitive with no rate limit, and a
 * completed payment would upgrade whatever uid was supplied. The uid and
 * email this returns are the only ones the route trusts from here on.
 *
 * Anonymous sessions are rejected the same way the Firestore rules reject
 * them elsewhere (`isRegistered()`): a QR participant's throwaway anonymous
 * session is a real, verifiable Firebase session, but there is no persistent
 * account to attach a subscription to.
 */
async function verifiedUser(req: { headers: Record<string, unknown> }): Promise<{ uid: string; email?: string } | null> {
  const header = req.headers['authorization'];
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  if (!ensureAdminApp()) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (decoded.firebase?.sign_in_provider === 'anonymous') return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}

/**
 * Whether Stripe is configured at all — the single source of truth for
 * "are payments active", exposed to the client at GET /api/payments-status.
 *
 * `useSubscription.ts` used to infer this from VITE_API_BASE_URL, a variable
 * that answers "where does the API live" (empty is CORRECT on Railway, where
 * client and server share an origin) and has nothing to do with payments.
 * Setting the real Stripe variables on Railway did nothing to the client,
 * because the client's flag was baked into the build from a variable nobody
 * was setting either way. Asking the server at runtime instead means turning
 * Stripe on here is sufficient by itself — no separate client rebuild, no
 * second flag to remember.
 */
function paymentsConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET);
}

const CHECKOUT_RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };

/**
 * The Firebase uid a Stripe event belongs to.
 *
 * The uid is stamped as metadata in two places at checkout — on the session and
 * on the subscription — because different events carry different objects:
 *
 *  - checkout.session.completed  → the session, with session metadata
 *  - customer.subscription.*     → the subscription, with subscription metadata
 *  - invoice.paid                → an invoice, which carries NEITHER directly
 *
 * An invoice references the subscription instead, in a place that has moved
 * between API versions, so try both shapes and fall back to fetching the
 * subscription itself.
 */
async function resolveUid(stripe: Stripe, obj: any): Promise<string | undefined> {
  const direct =
    obj?.metadata?.uid ||
    obj?.parent?.subscription_details?.metadata?.uid ||
    obj?.subscription_details?.metadata?.uid;
  if (direct) return String(direct);

  const subscriptionId =
    (typeof obj?.subscription === 'string' ? obj.subscription : obj?.subscription?.id) ||
    obj?.parent?.subscription_details?.subscription;
  if (!subscriptionId) return undefined;

  try {
    const subscription = await stripe.subscriptions.retrieve(String(subscriptionId));
    return subscription.metadata?.uid ? String(subscription.metadata.uid) : undefined;
  } catch {
    return undefined;
  }
}

export async function registerRoutes(app: Express, server: HTTPServer): Promise<HTTPServer> {
  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // GET /api/payments-status
  // The single source of truth for "are payments active" — see
  // paymentsConfigured() above. Public and unauthenticated: it answers a
  // yes/no question about server configuration, nothing about any user.
  app.get('/api/payments-status', (req, res) => {
    res.json({ enabled: paymentsConfigured() });
  });

  // POST /api/create-checkout-session
  // Requires: Authorization: Bearer <Firebase ID token>
  // Returns: { url: string }
  app.post('/api/create-checkout-session', async (req, res) => {
    if (!paymentsConfigured()) {
      res.status(503).json({ error: 'Payments not configured' });
      return;
    }

    // uid and email come from the VERIFIED token, never the request body —
    // see verifiedUser() for why that used to be a real problem.
    const user = await verifiedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Sign in to upgrade' });
      return;
    }

    if (!checkRateLimit(user.uid, CHECKOUT_RATE_LIMIT)) {
      res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
      return;
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        ...(user.email ? { customer_email: user.email } : {}),
        line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
        // On the session AND on the subscription it creates.
        //
        // The webhook acts on subscription and invoice events, and those events
        // carry the SUBSCRIPTION's metadata, not the checkout session's — Stripe
        // does not propagate one to the other. With the uid only on the session,
        // every event the webhook cared about arrived without one, so a customer
        // could pay and never be marked pro.
        metadata: { uid: user.uid },
        subscription_data: { metadata: { uid: user.uid } },
        success_url: `${process.env.APP_URL || 'https://stackmatego.com'}/?pro=1`,
        cancel_url: `${process.env.APP_URL || 'https://stackmatego.com'}/`,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/stripe-webhook
  // Stripe sends events here; we update Firestore on subscription lifecycle events
  //
  // The raw body arrives as a Buffer from the parser mounted on this path in
  // server/bodyParsers.ts. It must NOT be collected here: route middleware runs
  // after the app-level express.json(), which has already drained the stream.
  app.post(
    '/api/stripe-webhook',
    async (req, res) => {
      if (!paymentsConfigured()) {
        res.status(503).json({ error: 'Payments not configured' });
        return;
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const sig = req.headers['stripe-signature'];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          req.body,
          sig as string,
          process.env.STRIPE_WEBHOOK_SECRET!
        );
      } catch (err: any) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      const obj = event.data.object as any;

      // A misconfigured server must not tell Stripe the event was handled.
      // Returning 200 with no database made a dropped upgrade look delivered,
      // and Stripe never retries an event it has been told was received.
      const db = getAdminDb();
      if (!db) {
        console.error('Stripe webhook: no Admin SDK credentials, cannot record', event.type);
        res.status(500).json({ error: 'Storage unavailable' });
        return;
      }

      const uid = await resolveUid(stripe, obj);
      if (!uid) {
        // Nothing actionable, but retrying will not help either.
        console.warn('Stripe webhook: no uid on', event.type, obj?.id);
        res.json({ received: true });
        return;
      }

      const userRef = db.collection('users').doc(uid);

      const setStatus = async (subscriptionStatus: 'pro' | 'free') => {
        // Ordering, not just dedupe. Stripe does not guarantee delivery order
        // and retries for up to three days — without this, a retried
        // invoice.paid arriving after a customer.subscription.deleted had
        // already been processed would re-grant Pro permanently, because the
        // retry has no way to know anything superseded it. set(...,
        // {merge:true}) already makes an EXACT duplicate delivery idempotent
        // in value; this is what makes an OUT-OF-ORDER one idempotent too.
        const existing = await userRef.get();
        const storedCreated = existing.exists ? (existing.data()?.lastStripeEventAt ?? null) : null;
        if (!isNewerEvent(event.created, storedCreated)) {
          console.warn('Stripe webhook: ignoring stale/duplicate event', event.type, event.id, 'for', uid);
          return;
        }
        await userRef.set(
          { subscriptionStatus, updatedAt: new Date().toISOString(), lastStripeEventAt: event.created },
          { merge: true }
        );
      };

      try {
        if (event.type === 'checkout.session.completed') {
          // Only when Stripe says the money actually arrived — this event
          // used to grant Pro unconditionally.
          if (obj.payment_status === 'paid') await setStatus('pro');
        } else if (event.type === 'customer.subscription.created' || event.type === 'invoice.paid') {
          await setStatus('pro');
        } else if (event.type === 'customer.subscription.updated') {
          // Was unhandled entirely — a subscription going past_due or unpaid
          // kept Pro forever, because only a hard `deleted` ever took it away.
          // See server/lib/subscriptionStatus.ts for the policy: a failed
          // payment loses Pro immediately; a cancel-at-period-end subscription
          // needs no special case here, because Stripe leaves status at
          // 'active' for the whole remaining period regardless.
          await setStatus(statusForSubscription(obj.status));
        } else if (event.type === 'customer.subscription.deleted') {
          await setStatus('free');
        }
      } catch (err: any) {
        // Let Stripe retry rather than losing the upgrade.
        console.error('Stripe webhook: could not write user', uid, err?.message);
        res.status(500).json({ error: 'Write failed' });
        return;
      }

      res.json({ received: true });
    }
  );

  return server;
}
