import express, { type Express } from "express";

/**
 * The one place request bodies are parsed, and the order is the whole point.
 *
 * Stripe signs the EXACT bytes it sent, so `constructEvent` needs the raw body.
 * `express.json()` consumes the request stream to EOF, and a stream can only be
 * read once — so whichever parser is registered first wins, permanently.
 *
 * The webhook used to collect its own raw body in a route-level middleware. But
 * routes are registered inside `registerRoutes()`, which runs AFTER the
 * app-level `express.json()` in `server/index.ts` — so by the time the collector
 * attached its `data`/`end` listeners the stream had already ended. Node does
 * not re-emit `end`, so `next()` was never called and **the request hung until
 * Stripe timed out**. Every subscription event failed identically, and Stripe
 * retried for days. The comment above that collector said "must come before
 * express.json" while the code guaranteed the opposite.
 *
 * Mounting the raw parser on the webhook path here, before the JSON parser,
 * is what makes that true rather than aspirational. `bodyParsers.test.ts` pins
 * it: the webhook must receive a Buffer of the exact bytes, and every other
 * route must still receive parsed JSON.
 *
 * Anything that needs the raw body in future belongs in RAW_BODY_PATHS, not in
 * another route-level collector.
 */
export const RAW_BODY_PATHS = ['/api/stripe-webhook'];

export function installBodyParsers(app: Express): void {
  for (const path of RAW_BODY_PATHS) {
    app.use(path, express.raw({ type: 'application/json', limit: '1mb' }));
  }
  app.use(express.json({ limit: '1mb' })); // Limit request size
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
}
