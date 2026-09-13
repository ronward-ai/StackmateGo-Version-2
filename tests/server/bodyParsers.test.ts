// @vitest-environment node
import { describe, it, expect } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import { installBodyParsers, RAW_BODY_PATHS } from '../../server/bodyParsers';

/**
 * These tests exist because the failure they pin was invisible.
 *
 * `express.json()` drains the request stream, and a stream reads once. When the
 * webhook collected its own raw body in route-level middleware — registered
 * after the app-level JSON parser — it attached listeners to an already-ended
 * stream, `next()` was never called, and the request HUNG. No error, no log, no
 * 500; just a request Stripe eventually timed out on, retried, and failed on
 * identically for days.
 *
 * So the first test asserts a response arrives at all, under a timeout. A test
 * that only checked the body shape would have passed vacuously... by never
 * resolving.
 */

/** Start an app on an ephemeral port and return its base URL plus a closer. */
async function serve(configure: (app: express.Express) => void) {
  const app = express();
  installBodyParsers(app);
  configure(app);
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

/** Reject rather than hang, so the original bug fails the suite instead of stalling it. */
async function postJson(url: string, body: string, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

describe('body parsers', () => {
  it('gives the Stripe webhook the exact bytes, as a Buffer', async () => {
    const s = await serve(app => {
      app.post('/api/stripe-webhook', (req, res) => {
        res.json({
          isBuffer: Buffer.isBuffer(req.body),
          text: Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null,
        });
      });
    });
    try {
      // Key order and spacing must survive verbatim: Stripe signs these bytes,
      // and a re-serialised body produces a different signature.
      const raw = '{"id":"evt_1","type":"invoice.paid","data":{"object":{"id":"in_1"}}}';
      const res = await postJson(`${s.url}/api/stripe-webhook`, raw);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.isBuffer).toBe(true);
      expect(body.text).toBe(raw);
    } finally {
      await s.close();
    }
  });

  it('responds at all — the original bug hung the request forever', async () => {
    const s = await serve(app => {
      app.post('/api/stripe-webhook', (_req, res) => { res.json({ ok: true }); });
    });
    try {
      await expect(
        postJson(`${s.url}/api/stripe-webhook`, '{"id":"evt_2"}', 2000),
      ).resolves.toMatchObject({ status: 200 });
    } finally {
      await s.close();
    }
  });

  it('still gives every other route parsed JSON', async () => {
    const s = await serve(app => {
      app.post('/api/create-checkout-session', (req, res) => {
        res.json({ isBuffer: Buffer.isBuffer(req.body), parsed: req.body });
      });
    });
    try {
      const res = await postJson(
        `${s.url}/api/create-checkout-session`,
        JSON.stringify({ uid: 'u1', email: 'a@b.test' }),
      );
      const body = await res.json();
      expect(body.isBuffer).toBe(false);
      expect(body.parsed).toEqual({ uid: 'u1', email: 'a@b.test' });
    } finally {
      await s.close();
    }
  });

  it('names the webhook as the only raw-body path', () => {
    // A second collector elsewhere is how this broke the first time.
    expect(RAW_BODY_PATHS).toEqual(['/api/stripe-webhook']);
  });
});
