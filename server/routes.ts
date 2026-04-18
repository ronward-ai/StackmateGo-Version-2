import { type Express } from "express";
import { Server as HTTPServer } from 'http';
import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Lazy-init Firebase Admin (only when env vars are present)
function getAdminDb() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    if (!getApps().length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({ credential: cert(serviceAccount) });
    }
    return getFirestore();
  } catch {
    return null;
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

  // POST /api/create-checkout-session
  // Body: { uid: string, email?: string }
  // Returns: { url: string }
  app.post('/api/create-checkout-session', async (req, res) => {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
      res.status(503).json({ error: 'Payments not configured' });
      return;
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { uid, email } = req.body as { uid: string; email?: string };
    if (!uid) { res.status(400).json({ error: 'uid required' }); return; }

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        ...(email ? { customer_email: email } : {}),
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        metadata: { uid },
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
  app.post(
    '/api/stripe-webhook',
    // Raw body required for signature verification — must come before express.json
    (req, res, next) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        (req as any).rawBody = data;
        next();
      });
    },
    async (req, res) => {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        res.status(503).json({ error: 'Payments not configured' });
        return;
      }
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const sig = req.headers['stripe-signature'];
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          (req as any).rawBody,
          sig as string,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err: any) {
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      const obj = event.data.object as any;
      const uid = obj.metadata?.uid;

      const db = getAdminDb();
      if (uid && db) {
        if (event.type === 'customer.subscription.created' || event.type === 'invoice.paid') {
          await db.collection('users').doc(uid).set(
            { subscriptionStatus: 'pro', updatedAt: new Date().toISOString() },
            { merge: true }
          );
        } else if (event.type === 'customer.subscription.deleted') {
          await db.collection('users').doc(uid).set(
            { subscriptionStatus: 'free', updatedAt: new Date().toISOString() },
            { merge: true }
          );
        }
      }

      res.json({ received: true });
    }
  );

  return server;
}
