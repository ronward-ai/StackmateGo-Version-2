import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { resetRateLimits } from '../../server/lib/rateLimit';

/**
 * THE SERVER, ATTACKED.
 *
 * `routes.test.ts` proves the wiring with Stripe's signature check MOCKED, which
 * is right for testing decisions and useless for testing forgery: a mocked
 * `constructEvent` accepts whatever the test says. Here Stripe is REAL — the
 * signature is genuine HMAC over the genuine bytes — and only the two calls
 * that would leave the machine (creating a checkout session, and Firestore) are
 * stand-ins. The app is assembled the way `server/index.ts` assembles it:
 * headers first, body parsers, routes, static files, the error handler.
 */

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  checkoutCreate: vi.fn(),
  firestoreGet: vi.fn(),
  firestoreSet: vi.fn(),
}));

vi.mock('stripe', async importOriginal => {
  const Real = ((await importOriginal()) as any).default;
  class NoNetworkStripe extends Real {
    constructor(key: string) {
      super(key);
      (this as any).checkout = { sessions: { create: mocks.checkoutCreate } };
    }
  }
  return { default: NoNetworkStripe };
});
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn(), cert: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }) }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: (id: string) => ({
        get: () => mocks.firestoreGet(id),
        set: (data: any, opts: any) => mocks.firestoreSet(id, data, opts),
      }),
    }),
  }),
}));

const { registerRoutes } = await import('../../server/routes');
const { installBodyParsers } = await import('../../server/bodyParsers');
const { installSecurityHeaders, SECURITY_HEADERS } = await import('../../server/securityHeaders');
const { installErrorHandler } = await import('../../server/errorHandler');
const { serveStatic } = await import('../../server/vite');
const Stripe = (await import('stripe')).default as any;

const WEBHOOK_SECRET = 'whsec_attack_test_secret';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';

// A fake deployment directory: the built app, and beside it the things an
// attacker would love to read.
let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'smgo-attack-'));
  fs.mkdirSync(path.join(root, 'dist/public/assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist/public/index.html'), '<!doctype html><title>app</title>');
  fs.writeFileSync(path.join(root, 'dist/public/assets/app.js'), 'console.log(1)');
  fs.writeFileSync(path.join(root, 'dist/public/.env'), 'SECRET=in-public-dir');
  fs.writeFileSync(path.join(root, '.env'), 'STRIPE_SECRET_KEY=sk_live_LEAKED');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"LEAKED"}');
  fs.mkdirSync(path.join(root, 'server'));
  fs.writeFileSync(path.join(root, 'server/routes.ts'), 'LEAKED SOURCE');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function serve() {
  const app = express();
  installSecurityHeaders(app);
  installBodyParsers(app);
  const server = createServer(app);
  await registerRoutes(app, server);
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root);
  serveStatic(app);
  cwd.mockRestore();
  installErrorHandler(app);
  await new Promise<void>(r => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>(r => server.close(() => r())) };
}

let s: Awaited<ReturnType<typeof serve>>;
beforeEach(async () => {
  vi.clearAllMocks();
  resetRateLimits();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_PRICE_ID = 'price_x';
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  mocks.firestoreGet.mockResolvedValue({ exists: false, data: () => undefined });
  mocks.firestoreSet.mockResolvedValue(undefined);
  mocks.checkoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' });
  mocks.verifyIdToken.mockImplementation(async (t: string) => {
    if (t === 'real-user-token') return { uid: 'real-user', email: 'real@example.com', firebase: { sign_in_provider: 'password' } };
    if (t === 'anon-token') return { uid: 'anon', firebase: { sign_in_provider: 'anonymous' } };
    throw new Error('invalid token');
  });
  s = await serve();
  return () => s.close();
});

const stripe = new Stripe('sk_test_x');
const proEvent = (uid = 'victim', created = 2000, extra: any = {}) => JSON.stringify({
  id: 'evt_' + created,
  object: 'event',
  type: 'customer.subscription.created',
  created,
  data: { object: { id: 'sub_1', object: 'subscription', status: 'active', metadata: { uid } } },
  ...extra,
});
const signed = (payload: string, secret = WEBHOOK_SECRET) =>
  stripe.webhooks.generateTestHeaderString({ payload, secret });
const postHook = (body: string, headers: Record<string, string>) =>
  fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
const proWrites = () => mocks.firestoreSet.mock.calls.filter(c => c[1]?.subscriptionStatus === 'pro');

describe('forging a Stripe webhook to grant Pro', () => {
  it('CONTROL: a genuinely signed event is accepted and grants Pro', async () => {
    const body = proEvent();
    const res = await postHook(body, { 'stripe-signature': signed(body) });
    expect(res.status).toBe(200);
    expect(proWrites()).toHaveLength(1);
  });

  it('no signature header', async () => {
    const res = await postHook(proEvent(), {});
    expect(res.status).toBe(400);
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });

  it('signed with the wrong secret', async () => {
    const body = proEvent();
    const res = await postHook(body, { 'stripe-signature': signed(body, 'whsec_guessed') });
    expect(res.status).toBe(400);
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });

  it('a real signature over a tampered body (uid swapped)', async () => {
    const original = proEvent('paying-customer');
    const header = signed(original);
    const res = await postHook(original.replace('paying-customer', 'attacker'), { 'stripe-signature': header });
    expect(res.status).toBe(400);
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });

  it('a captured genuine request replayed long after (timestamp outside tolerance)', async () => {
    const body = proEvent();
    const old = stripe.webhooks.generateTestHeaderString({
      payload: body, secret: WEBHOOK_SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    const res = await postHook(body, { 'stripe-signature': old });
    expect(res.status).toBe(400);
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });

  it('a genuine but OLDER event cannot undo a newer cancellation', async () => {
    mocks.firestoreGet.mockResolvedValue({ exists: true, data: () => ({ subscriptionStatus: 'free', lastStripeEventAt: 5000 }) });
    const body = proEvent('victim', 4000);
    const res = await postHook(body, { 'stripe-signature': signed(body) });
    expect(res.status).toBe(200);
    expect(proWrites()).toHaveLength(0);
  });

  it('a checkout that was not paid grants nothing', async () => {
    const body = JSON.stringify({
      id: 'evt_c', object: 'event', type: 'checkout.session.completed', created: 3000,
      data: { object: { id: 'cs_1', object: 'checkout.session', payment_status: 'unpaid', metadata: { uid: 'victim' } } },
    });
    await postHook(body, { 'stripe-signature': signed(body) });
    expect(proWrites()).toHaveLength(0);
  });

  it('an event type the server does not handle writes nothing', async () => {
    const body = proEvent('victim', 3000, { type: 'customer.updated' });
    await postHook(body, { 'stripe-signature': signed(body) });
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });

  it('a webhook body over 1 MB is refused, not processed', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(1_100_000) });
    const res = await postHook(big, { 'stripe-signature': signed(big) });
    expect(res.status).toBe(413);
    expect(mocks.firestoreSet).not.toHaveBeenCalled();
  });
});

describe('starting a checkout as somebody else', () => {
  const checkout = (headers: Record<string, string>, body: any = {}) =>
    fetch(`${s.url}/api/create-checkout-session`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
    });

  it('CONTROL: a real signed-in user gets a session for THEMSELVES', async () => {
    const res = await checkout({ authorization: 'Bearer real-user-token' }, { uid: 'victim', email: 'victim@example.com' });
    expect(res.status).toBe(200);
    const args = mocks.checkoutCreate.mock.calls[0][0];
    expect(args.metadata.uid).toBe('real-user');
    expect(args.customer_email).toBe('real@example.com');
  });

  it('uid and email in the body with no token', async () => {
    const res = await checkout({}, { uid: 'victim', email: 'victim@example.com' });
    expect(res.status).toBe(401);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('a forged or garbage bearer token', async () => {
    for (const t of ['Bearer forged', 'Bearer ', 'Basic dmljdGlt', 'bearer real-user-token-ish']) {
      const res = await checkout({ authorization: t }, { uid: 'victim' });
      expect(res.status).toBe(401);
    }
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('an anonymous QR session', async () => {
    const res = await checkout({ authorization: 'Bearer anon-token' });
    expect(res.status).toBe(401);
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });

  it('a flood from one account is cut off', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await checkout({ authorization: 'Bearer real-user-token' })).status);
    expect(codes.filter(c => c === 200).length).toBeLessThanOrEqual(5);
    expect(codes.at(-1)).toBe(429);
  });

  it('a Stripe failure does not leak Stripe\'s wording to the browser', async () => {
    mocks.checkoutCreate.mockRejectedValue(new Error("No such price: 'price_secret_config'"));
    const res = await checkout({ authorization: 'Bearer real-user-token' });
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('price_secret_config');
  });
});

describe('reading files the server should never serve', () => {
  const get = (p: string) => fetch(`${s.url}${p}`);
  const LEAK = /LEAKED|sk_live|SECRET=/;

  it('CONTROL: the app and its assets are served', async () => {
    expect(await (await get('/')).text()).toContain('<title>app</title>');
    expect(await (await get('/assets/app.js')).text()).toContain('console.log');
  });

  for (const p of [
    '/../package.json', '/..%2fpackage.json', '/%2e%2e/package.json', '/%2e%2e/%2e%2e/.env',
    '/../server/routes.ts', '/assets/../../server/routes.ts', '/..%5cpackage.json',
    '/.env', '/%2eenv', '/../.env', '/assets/%2e%2e/%2e%2e/.env',
  ]) {
    it(`GET ${p}`, async () => {
      const res = await get(p);
      expect(await res.text()).not.toMatch(LEAK);
    });
  }
});

describe('probing for errors and headers', () => {
  it('malformed JSON gets a short 400, no stack trace or file paths', async () => {
    const res = await fetch(`${s.url}/api/create-checkout-session`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer real-user-token' }, body: '{"uid":',
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at \w+ \(|node_modules|\/home\/|\.ts:\d+/);
  });

  it('an oversized JSON body is 413, no stack trace', async () => {
    const res = await fetch(`${s.url}/api/create-checkout-session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(1_100_000) }),
    });
    expect(res.status).toBe(413);
    expect(await res.text()).not.toMatch(/node_modules|\/home\//);
  });

  it('every response carries the security headers, errors and static files included', async () => {
    const responses = [
      await fetch(`${s.url}/`),
      await fetch(`${s.url}/assets/app.js`),
      await fetch(`${s.url}/api/stripe-webhook`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }),
      await fetch(`${s.url}/api/create-checkout-session`, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }),
    ];
    for (const res of responses) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers.get(name)).toBe(value);
    }
  });

  it('reports no server technology in its headers', async () => {
    const res = await fetch(`${s.url}/api/health`);
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
