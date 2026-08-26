/**
 * The funnel had no tests and stopped at activation. This app takes real
 * money, so the two numbers the owner most needs after launch are how many
 * are paying and how many are about to stop.
 */
import { describe, expect, it } from "vitest";
import { funnelFromUsers, type AdminFunnelUser } from "@/lib/admin-funnel";

const NOW = Date.parse("2026-08-24T09:00:00Z");
const YESTERDAY = "2026-08-23T09:00:00Z";
const LAST_MONTH = "2026-07-01T09:00:00Z";

function user(over: Partial<AdminFunnelUser> = {}): AdminFunnelUser {
  return {
    holding_count: 0,
    last_sign_in_at: null,
    last_advisor_at: null,
    portfolios: [],
    subscription_status: null,
    ...over,
  };
}

describe("the activation half", () => {
  it("counts each step of the way in", () => {
    const out = funnelFromUsers(
      [
        user(),
        user({ portfolios: [{}] }),
        user({ portfolios: [{}], holding_count: 3 }),
        user({
          portfolios: [{}],
          holding_count: 3,
          last_advisor_at: YESTERDAY,
          last_sign_in_at: YESTERDAY,
        }),
      ],
      NOW
    );
    expect(out.signedIn).toBe(4);
    expect(out.hasSheet).toBe(3);
    expect(out.hasHoldings).toBe(2);
    expect(out.usedAdvisor).toBe(1);
    expect(out.returned7d).toBe(1);
    expect(out.activated).toBe(1);
  });

  it("wants both halves of activation, not either", () => {
    const holdingsButGone = user({ holding_count: 5, last_sign_in_at: LAST_MONTH });
    const backButEmpty = user({ holding_count: 0, last_sign_in_at: YESTERDAY });
    const out = funnelFromUsers([holdingsButGone, backButEmpty], NOW);
    expect(out.activated).toBe(0);
    expect(out.returned7d).toBe(1);
    expect(out.hasHoldings).toBe(1);
  });
});

describe("the revenue half", () => {
  it("counts a trial as having access, because it does", () => {
    const out = funnelFromUsers(
      [
        user({ subscription_status: "active" }),
        user({ subscription_status: "trialing" }),
        user({ subscription_status: null }),
      ],
      NOW
    );
    expect(out.subscribed).toBe(2);
    expect(out.paymentFailing).toBe(0);
  });

  it("counts both of the ways Stripe says a charge did not land", () => {
    // past_due while it retries, unpaid once it gives up. Both are somebody
    // about to lose access who may not know it.
    const out = funnelFromUsers(
      [
        user({ subscription_status: "past_due" }),
        user({ subscription_status: "unpaid" }),
        user({ subscription_status: "active" }),
      ],
      NOW
    );
    expect(out.paymentFailing).toBe(2);
    expect(out.subscribed).toBe(1);
  });

  it("does not count somebody who cancelled as either", () => {
    const out = funnelFromUsers(
      [
        user({ subscription_status: "canceled" }),
        user({ subscription_status: "incomplete_expired" }),
      ],
      NOW
    );
    expect(out.subscribed).toBe(0);
    expect(out.paymentFailing).toBe(0);
  });

  it("reads whatever case and spacing Stripe sends", () => {
    const out = funnelFromUsers(
      [user({ subscription_status: " Active " }), user({ subscription_status: "PAST_DUE" })],
      NOW
    );
    expect(out.subscribed).toBe(1);
    expect(out.paymentFailing).toBe(1);
  });

  it("is all zeroes on an empty account list rather than throwing", () => {
    expect(funnelFromUsers([], NOW)).toEqual({
      signedIn: 0,
      hasSheet: 0,
      hasHoldings: 0,
      usedAdvisor: 0,
      returned7d: 0,
      activated: 0,
      subscribed: 0,
      paymentFailing: 0,
    });
  });
});
