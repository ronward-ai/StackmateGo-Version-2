import { type Express } from "express";
import { Server as HTTPServer } from 'http';
import Stripe from 'stripe';
import { randomBytes } from 'crypto';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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

// Lazy-init Firebase Admin (only when env vars are present)
function getAdminDb() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return null;
  try {
    if (!getApps().length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({ credential: cert(serviceAccount) });
    }
    return getFirestore(DATABASE_ID);
  } catch {
    return null;
  }
}

/**
 * The uid of the caller, verified from their Firebase ID token.
 *
 * Returns null when the header is missing or the token does not verify. The uid
 * is never taken from the request body — a client that could name its own uid
 * could hand itself any tournament.
 */
async function verifyCaller(req: any): Promise<string | null> {
  const header = req.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice('Bearer '.length));
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Code characters, excluding the confusable 0/O and 1/I. */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTransferCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes).map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

const TRANSFER_CODE_TTL_MS = 5 * 60 * 1000;

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

  // ── Director handover ────────────────────────────────────────────────────
  //
  // The transfer code used to live on the activeTournaments document, which is
  // world-readable — so every participant who scanned the QR could read the
  // code and seize director control. And the claim itself could never work:
  // the client wrote `ownerId` directly, which all three activeTournaments
  // update branches reject by design ("ownerId is intentionally excluded to
  // prevent privilege escalation"), so handover has never functioned.
  //
  // Both halves now run here. The code lives in a `transferCodes` collection
  // that no client can read, and the Admin SDK bypasses rules, so `ownerId`
  // stays unwritable by clients — the safest posture and no rules change to
  // the tournament document itself.

  // POST /api/transfer-code   Body: { tournamentId }
  // Auth: Bearer <Firebase ID token> for the CURRENT owner.
  // Returns: { code, expiresAt }
  app.post('/api/transfer-code', async (req, res) => {
    const db = getAdminDb();
    if (!db) {
      res.status(503).json({ error: 'Handover is not configured on this server' });
      return;
    }

    const uid = await verifyCaller(req);
    if (!uid) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }

    const tournamentId = String(req.body?.tournamentId || '').trim();
    if (!tournamentId) {
      res.status(400).json({ error: 'Missing tournamentId' });
      return;
    }

    try {
      const snap = await db.collection('activeTournaments').doc(tournamentId).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }
      if (snap.data()?.ownerId !== uid) {
        res.status(403).json({ error: 'Only the current director can generate a transfer code' });
        return;
      }

      const code = generateTransferCode();
      const expiresAt = new Date(Date.now() + TRANSFER_CODE_TTL_MS).toISOString();

      // Keyed by tournament, so generating a new code replaces the old one and
      // only ever one code is live per tournament.
      await db.collection('transferCodes').doc(tournamentId).set({
        code,
        expiresAt,
        tournamentId,
        createdBy: uid,
        createdAt: new Date().toISOString(),
      });

      res.json({ code, expiresAt });
    } catch (err: any) {
      console.error('transfer-code failed:', err);
      res.status(500).json({ error: 'Could not generate a transfer code' });
    }
  });

  // POST /api/claim-tournament   Body: { code }
  // Auth: Bearer <Firebase ID token> for the INCOMING director.
  // Returns: { tournamentId }
  app.post('/api/claim-tournament', async (req, res) => {
    const db = getAdminDb();
    if (!db) {
      res.status(503).json({ error: 'Handover is not configured on this server' });
      return;
    }

    const uid = await verifyCaller(req);
    if (!uid) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }

    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      res.status(400).json({ error: 'Code must be 6 letters or numbers' });
      return;
    }

    try {
      const matches = await db.collection('transferCodes').where('code', '==', code).limit(1).get();
      if (matches.empty) {
        res.status(404).json({ error: 'That code is not valid' });
        return;
      }

      const codeDoc = matches.docs[0];
      const data = codeDoc.data();

      if (!data.expiresAt || new Date(data.expiresAt).getTime() < Date.now()) {
        await codeDoc.ref.delete();
        res.status(410).json({ error: 'That code has expired' });
        return;
      }

      const tournamentId = String(data.tournamentId || codeDoc.id);
      const tournamentRef = db.collection('activeTournaments').doc(tournamentId);
      const snap = await tournamentRef.get();
      if (!snap.exists) {
        await codeDoc.ref.delete();
        res.status(404).json({ error: 'That tournament no longer exists' });
        return;
      }

      // Reassign and burn the code in one batch, so a code can never be used
      // twice even if two people submit it at the same moment.
      const batch = db.batch();
      batch.update(tournamentRef, { ownerId: uid });
      batch.delete(codeDoc.ref);
      await batch.commit();

      res.json({ tournamentId });
    } catch (err: any) {
      console.error('claim-tournament failed:', err);
      res.status(500).json({ error: 'Could not transfer the tournament' });
    }
  });

  return server;
}
