/**
 * What a Stripe subscription status means for `users/{uid}.subscriptionStatus`.
 *
 * `customer.subscription.updated` fires on every status transition, and was
 * unhandled entirely — only a hard `customer.subscription.deleted` ever took
 * Pro away, so a subscription going `past_due` or `unpaid` kept Pro forever.
 *
 * The policy, confirmed rather than assumed: a failed payment (`past_due`,
 * `unpaid`) loses Pro immediately — it's usually accidental, Stripe keeps
 * retrying the card, and nothing is lost by re-upgrading once it's fixed. A
 * deliberate cancellation is different: the customer already paid for the
 * current period, so Pro should last until it actually ends rather than
 * cutting off mid-period.
 *
 * That second case needs NO special handling here, which is the point of
 * writing it down: Stripe's own `cancel_at_period_end` leaves `status` at
 * `'active'` for the whole remaining period — the subscription doesn't
 * transition to `'canceled'` until the period is actually over, at which
 * point `customer.subscription.deleted` fires (handled separately, unchanged,
 * always `'free'`). So "active" mapping to "pro" already IS "keep Pro until
 * the period ends" — this function only ever sees `status`, and that is
 * deliberate: the cancel-at-period-end flag is not a distinct input to it.
 */
export type SubscriptionStatus =
  | 'active' | 'trialing'
  | 'past_due' | 'unpaid' | 'incomplete' | 'incomplete_expired' | 'paused' | 'canceled'
  | (string & {}); // Stripe adds statuses over time; anything unrecognised is treated as not-pro.

export function statusForSubscription(status: SubscriptionStatus): 'pro' | 'free' {
  return status === 'active' || status === 'trialing' ? 'pro' : 'free';
}

/**
 * Whether an incoming Stripe event should be applied, given the `created`
 * timestamp (Unix seconds) already recorded for this user.
 *
 * Stripe does not guarantee delivery order and retries for up to three days.
 * Without this, a retried `invoice.paid` arriving after a
 * `customer.subscription.deleted` had already been processed would re-grant
 * Pro permanently — the retry doesn't know anything superseded it.
 *
 * `null`/`undefined` stored means "nothing recorded yet" — always accept.
 * Equal timestamps are rejected, not just older ones: the same event
 * redelivered must not re-run its write a second time for no reason, even
 * though the write itself would be harmless (`set` with `merge: true`).
 */
export function isNewerEvent(incomingCreated: number, storedCreated: number | null | undefined): boolean {
  if (storedCreated === null || storedCreated === undefined) return true;
  return incomingCreated > storedCreated;
}
