import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { resetRateLimits } from '../../server/lib/rateLimit';

/**
 * Route-level tests for server/routes.ts, against real HTTP requests on a
 * scratch Express app — the same shape as tests/server/bodyParsers.test.ts.
 * Stripe and firebase-admin are mocked; no live Stripe account or Firestore
 * project is involved. The pure decisions these routes lean on
 * (server/lib/subscriptionStatus.ts, server/lib/rateLimit.ts) have their own
 * unit tests — this file exists to prove the WIRING: that the checks are
 * actually applied, and applied in the right order, which is exactly the
 * class of bug an audit catches and a unit test on the pure logic alone
 * cannot.
 */

// vi.mock factories are hoisted above imports, so any state they close over
// must go through vi.hoisted().
const mocks = vi.hoisted(() => {
  return {
    verifyIdToken: vi.fn(),
    checkoutSessionsCreate: vi.fn(),
    webhooksConstructEvent: vi.fn(),
    subscriptionsRetrieve: vi.fn(),
    firestoreGet: vi.fn(),
    firestoreSet: vi.fn(),
  };
});

vi.mock('stripe', () => {
  class MockStripe {
    checkout = { sessions: { create: mocks.checkoutSessionsCreate } };
    webhooks = { constructEvent: mocks.webhooksConstructEvent };
    subscriptions = { retrieve: mocks.subscriptionsRetrieve };
  }
  return { default: MockStripe };
});

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}], // pretend an app already exists — skip real init entirely
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: (_name: string) => ({
      doc: (id: string) => ({
        get: () => mocks.firestoreGet(id),
        set: (data: any, opts: any) => mocks.firestoreSet(id, data, opts),
      }),
    }),
  }),
}));

// Imported AFTER the mocks above so registerRoutes picks up the mocked modules.
const { registerRoutes } = await import('../../server/routes');

async function serve() {
  const app = express();
  app.use(express.json());
  app.use('/api/stripe-webhook', (req, _res, next) => {
    // Simulate the raw-body Buffer server/bodyParsers.ts hands the webhook —
    // constructEvent is mocked here anyway, so the exact bytes don't matter,
    // only that req.body is something constructEvent can be called with.
    next();
  });
  const httpServer = await import('http').then(h => h.createServer(app));
  await registerRoutes(app, httpServer);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = httpServer.listen(0, () => resolve(s as any));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

const ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID', 'STRIPE_WEBHOOK_SECRET'] as const;

// ensureAdminApp() gates on this being present — initializeApp/cert are
// mocked to no-ops, so the actual content never matters, only that it's set.
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';

function setPaymentsConfigured() {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_ID = 'price_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
  for (const k of ENV_KEYS) delete process.env[k];
  mocks.checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/fake' });
  mocks.firestoreGet.mockResolvedValue({ exists: false, data: () => undefined });
  mocks.firestoreSet.mockResolvedValue(undefined);
});

describe('GET /api/payments-status', () => {
  it('reports disabled when Stripe env vars are absent', async () => {
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/payments-status`);
      expect(await res.json()).toEqual({ enabled: false });
    } finally {
      await s.close();
    }
  });

  it('reports enabled once all three Stripe vars are set', async () => {
    setPaymentsConfigured();
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/payments-status`);
      expect(await res.json()).toEqual({ enabled: true });
    } finally {
      await s.close();
    }
  });
});

describe('POST /api/create-checkout-session', () => {
  it('rejects with no Authorization header at all', async () => {
    setPaymentsConfigured();
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/create-checkout-session`, { method: 'POST' });
      expect(res.status).toBe(401);
      expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('rejects an anonymous session — no persistent account to attach a subscription to', async () => {
    setPaymentsConfigured();
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'anon-1', firebase: { sign_in_provider: 'anonymous' },
    });
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: 'Bearer anon-token' },
      });
      expect(res.status).toBe(401);
      expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('rejects an invalid or expired token', async () => {
    setPaymentsConfigured();
    mocks.verifyIdToken.mockRejectedValue(new Error('token expired'));
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: 'Bearer garbage' },
      });
      expect(res.status).toBe(401);
      expect(mocks.checkoutSessionsCreate).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('503s when payments are not configured, before even checking the token', async () => {
    // Deliberately no setPaymentsConfigured() — and no verifyIdToken stub
    // either, to prove the config check runs first.
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: 'Bearer whatever' },
      });
      expect(res.status).toBe(503);
      expect(mocks.verifyIdToken).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  // The actual fix: uid and email come from the TOKEN, never the body — a
  // caller supplying a different uid in the body must not reach Stripe.
  it('uses the verified token identity, never a uid or email from the request body', async () => {
    setPaymentsConfigured();
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'real-uid', email: 'real@example.com', firebase: { sign_in_provider: 'password' },
    });
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good-token' },
        body: JSON.stringify({ uid: 'someone-elses-uid', email: 'attacker@example.com' }),
      });
      expect(res.status).toBe(200);
      expect(mocks.checkoutSessionsCreate).toHaveBeenCalledTimes(1);
      const call = mocks.checkoutSessionsCreate.mock.calls[0][0];
      expect(call.metadata).toEqual({ uid: 'real-uid' });
      expect(call.subscription_data).toEqual({ metadata: { uid: 'real-uid' } });
      expect(call.customer_email).toBe('real@example.com');
    } finally {
      await s.close();
    }
  });

  it('rate-limits repeated attempts by the same uid', async () => {
    setPaymentsConfigured();
    mocks.verifyIdToken.mockResolvedValue({
      uid: 'repeat-uid', email: 'a@b.test', firebase: { sign_in_provider: 'password' },
    });
    const s = await serve();
    try {
      const attempt = () => fetch(`${s.url}/api/create-checkout-session`, {
        method: 'POST',
        headers: { Authorization: 'Bearer good-token' },
      });
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
      expect(mocks.checkoutSessionsCreate).toHaveBeenCalledTimes(5);
    } finally {
      await s.close();
    }
  });

  it('a different uid is not affected by another uid exhausting the limit', async () => {
    setPaymentsConfigured();
    const s = await serve();
    try {
      mocks.verifyIdToken.mockResolvedValue({ uid: 'uid-a', firebase: { sign_in_provider: 'password' } });
      for (let i = 0; i < 5; i++) {
        await fetch(`${s.url}/api/create-checkout-session`, { method: 'POST', headers: { Authorization: 'Bearer t' } });
      }
      mocks.verifyIdToken.mockResolvedValue({ uid: 'uid-b', firebase: { sign_in_provider: 'password' } });
      const res = await fetch(`${s.url}/api/create-checkout-session`, { method: 'POST', headers: { Authorization: 'Bearer t' } });
      expect(res.status).toBe(200);
    } finally {
      await s.close();
    }
  });
});

describe('POST /api/stripe-webhook', () => {
  const baseEvent = (overrides: any) => ({
    id: 'evt_1',
    type: 'customer.subscription.created',
    created: 1000,
    data: { object: { id: 'sub_1', metadata: { uid: 'user-1' } } },
    ...overrides,
  });

  it('503s when payments are not configured', async () => {
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': 'sig' },
        body: '{}',
      });
      expect(res.status).toBe(503);
      expect(mocks.webhooksConstructEvent).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('grants pro on customer.subscription.created', async () => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({}));
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/stripe-webhook`, {
        method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}',
      });
      expect(res.status).toBe(200);
      expect(mocks.firestoreSet).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ subscriptionStatus: 'pro', lastStripeEventAt: 1000 }),
        { merge: true },
      );
    } finally {
      await s.close();
    }
  });

  it('checkout.session.completed only grants pro when payment_status is paid', async () => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { uid: 'user-1' }, payment_status: 'unpaid' } },
    }));
    const s = await serve();
    try {
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(mocks.firestoreSet).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('checkout.session.completed grants pro when payment_status is paid', async () => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', metadata: { uid: 'user-1' }, payment_status: 'paid' } },
    }));
    const s = await serve();
    try {
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(mocks.firestoreSet).toHaveBeenCalledWith(
        'user-1', expect.objectContaining({ subscriptionStatus: 'pro' }), { merge: true },
      );
    } finally {
      await s.close();
    }
  });

  it.each([
    ['active', 'pro'],
    ['trialing', 'pro'],
    ['past_due', 'free'],
    ['unpaid', 'free'],
    ['canceled', 'free'],
  ])('customer.subscription.updated with status %s maps to %s', async (status, expected) => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_1', metadata: { uid: 'user-1' }, status } },
    }));
    const s = await serve();
    try {
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(mocks.firestoreSet).toHaveBeenCalledWith(
        'user-1', expect.objectContaining({ subscriptionStatus: expected }), { merge: true },
      );
    } finally {
      await s.close();
    }
  });

  it('customer.subscription.deleted removes pro', async () => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1', metadata: { uid: 'user-1' } } },
    }));
    const s = await serve();
    try {
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(mocks.firestoreSet).toHaveBeenCalledWith(
        'user-1', expect.objectContaining({ subscriptionStatus: 'free' }), { merge: true },
      );
    } finally {
      await s.close();
    }
  });

  // The actual regression this closes: a retried invoice.paid arriving AFTER
  // a subscription.deleted had already been processed must not re-grant pro.
  it('ignores an event older than the one already recorded for this user', async () => {
    setPaymentsConfigured();
    mocks.firestoreGet.mockResolvedValue({ exists: true, data: () => ({ lastStripeEventAt: 2000 }) });
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'invoice.paid',
      created: 1500, // OLDER than the 2000 already stored
      data: { object: { id: 'in_1', metadata: { uid: 'user-1' } } },
    }));
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(res.status).toBe(200); // still acknowledged, so Stripe does not keep retrying it
      expect(mocks.firestoreSet).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });

  it('applies an event newer than the one already recorded', async () => {
    setPaymentsConfigured();
    mocks.firestoreGet.mockResolvedValue({ exists: true, data: () => ({ lastStripeEventAt: 1000 }) });
    mocks.webhooksConstructEvent.mockReturnValue(baseEvent({
      type: 'invoice.paid',
      created: 2000,
      data: { object: { id: 'in_1', metadata: { uid: 'user-1' } } },
    }));
    const s = await serve();
    try {
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
      expect(mocks.firestoreSet).toHaveBeenCalledWith(
        'user-1', expect.objectContaining({ subscriptionStatus: 'pro', lastStripeEventAt: 2000 }), { merge: true },
      );
    } finally {
      await s.close();
    }
  });

  it('an invalid signature is rejected with 400 and nothing is written', async () => {
    setPaymentsConfigured();
    mocks.webhooksConstructEvent.mockImplementation(() => { throw new Error('bad signature'); });
    const s = await serve();
    try {
      const res = await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 'bad' }, body: '{}' });
      expect(res.status).toBe(400);
      expect(mocks.firestoreSet).not.toHaveBeenCalled();
    } finally {
      await s.close();
    }
  });
});
