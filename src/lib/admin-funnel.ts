/**
 * The activation funnel on the admin page, and the two steps past it.
 *
 * It used to stop at "signed in this week with holdings", which is the last
 * thing that happens before somebody pays and therefore not the last thing
 * worth counting. This app takes real money through Stripe, so the two
 * numbers the owner most needs after launch are how many people are paying
 * and how many are about to stop: a card that fails puts a subscription
 * into `past_due` and nothing else on this page would ever have said so.
 *
 * Both come off `portfell_profiles`, which the Stripe webhook is the only
 * writer of, so this is Stripe's own answer rather than a second copy of
 * it kept in sync by hand.
 */

/** Stripe statuses that mean the reader has access right now. */
const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Statuses that mean money was expected and did not arrive. Stripe keeps a
 * subscription in `past_due` while it retries and moves it to `unpaid` when
 * it gives up, so both are somebody who is about to lose access and does
 * not necessarily know it.
 */
const FAILING_STATUSES = new Set(["past_due", "unpaid"]);

export type AdminFunnelUser = {
  holding_count?: number;
  last_sign_in_at?: string | null;
  last_advisor_at?: string | null;
  portfolios?: unknown[] | null;
  subscription_status?: string | null;
};

export type AdminFunnel = {
  signedIn: number;
  hasSheet: number;
  hasHoldings: number;
  usedAdvisor: number;
  returned7d: number;
  activated: number;
  /** Paying or in a trial: access right now. */
  subscribed: number;
  /** A charge that did not go through. Needs somebody to look. */
  paymentFailing: number;
};

function inLastWeek(iso: string | null | undefined, weekAgoMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= weekAgoMs;
}

function status(user: AdminFunnelUser): string {
  return (user.subscription_status ?? "").trim().toLowerCase();
}

export function funnelFromUsers(
  users: AdminFunnelUser[],
  nowMs = Date.now()
): AdminFunnel {
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const signedIn = users.length;
  const hasSheet = users.filter((u) => (u.portfolios?.length ?? 0) > 0).length;
  const hasHoldings = users.filter((u) => (u.holding_count ?? 0) > 0).length;
  const usedAdvisor = users.filter((u) => Boolean(u.last_advisor_at)).length;
  const returned7d = users.filter((u) =>
    inLastWeek(u.last_sign_in_at, weekAgo)
  ).length;
  const activated = users.filter((u) => {
    if ((u.holding_count ?? 0) <= 0) return false;
    return inLastWeek(u.last_sign_in_at, weekAgo);
  }).length;
  const subscribed = users.filter((u) => ACTIVE_STATUSES.has(status(u))).length;
  const paymentFailing = users.filter((u) =>
    FAILING_STATUSES.has(status(u))
  ).length;
  return {
    signedIn,
    hasSheet,
    hasHoldings,
    usedAdvisor,
    returned7d,
    activated,
    subscribed,
    paymentFailing,
  };
}
