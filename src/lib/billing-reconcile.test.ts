/**
 * The billing backstop. It exists to repair drift between Stripe and our
 * profile rows, which means the one thing it must never do is write a wrong
 * answer over a right one -- a repair job that corrupts good state is worse
 * than no repair job.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Sub = {
  id: string;
  status: string;
  items: { data: Array<{ price: { nickname: string | null; lookup_key: string | null }; current_period_end: number }> };
};

/** Subscriptions this fake Stripe account holds, newest first. */
let subs: Sub[] = [];
const writes: Array<Record<string, unknown>> = [];
let profileRows: Array<{
  id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
}> = [];

function sub(id: string, status: string): Sub {
  return {
    id,
    status,
    items: {
      data: [
        {
          price: { nickname: "Pro", lookup_key: null },
          current_period_end: 1800000000,
        },
      ],
    },
  };
}

vi.mock("@/lib/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stripe")>();
  return {
    ...actual,
    getStripe: () => ({
      subscriptions: {
        list: async ({ status }: { customer: string; status: string }) => ({
          // Faithful to Stripe: newest first, and `all` includes every state.
          data:
            status === "all"
              ? subs.slice(0, 1)
              : subs.filter((s) => s.status === status).slice(0, 1),
        }),
      },
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => ({
    from: () => {
      // The reconcile read is paged (lib/supabase/read-all), because it is
      // every paying account rather than one, so the double has to answer a
      // window. The fixtures are far shorter than one page, so the first
      // window is the last.
      const q: Record<string, unknown> = {};
      let window: [number, number] | null = null;
      q.select = () => q;
      q.not = () => q;
      q.range = (from: number, to: number) => {
        window = [from, to];
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          resolve({
            data: window
              ? profileRows.slice(window[0], window[1] + 1)
              : profileRows,
            error: null,
          })
        );
      q.update = (patch: Record<string, unknown>) => {
        writes.push(patch);
        return { eq: () => Promise.resolve({ error: null }) };
      };
      return q;
    },
  }),
}));

vi.mock("@/lib/telemetry", () => ({ logEvent: () => {} }));

import { reconcileBillingSubscriptions } from "@/lib/billing-reconcile";

beforeEach(() => {
  subs = [];
  writes.length = 0;
  profileRows = [
    {
      id: "user-1",
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_paid",
      subscription_status: "active",
    },
  ];
});

describe("reconcileBillingSubscriptions", () => {
  it("does not downgrade a paying customer because of a newer failed attempt", async () => {
    /*
     * The regression this guards. Someone opens Upgrade in two tabs,
     * completes one and abandons the other. The abandoned session leaves a
     * subscription that expires unpaid -- created *after* the one they paid
     * for, so it is the newest of any status.
     */
    subs = [sub("sub_abandoned", "incomplete_expired"), sub("sub_paid", "active")];

    const result = await reconcileBillingSubscriptions();

    // Nothing drifted: the live subscription still matches what we stored.
    expect(result.corrected).toBe(0);
    expect(writes).toHaveLength(0);
  });

  it("still records a genuine cancellation", async () => {
    subs = [sub("sub_paid", "canceled")];

    const result = await reconcileBillingSubscriptions();

    expect(result.corrected).toBe(1);
    expect(writes[0]?.subscription_status).toBe("canceled");
  });

  it("repairs a profile that missed an upgrade", async () => {
    profileRows[0]!.subscription_status = null;
    profileRows[0]!.stripe_subscription_id = null;
    subs = [sub("sub_paid", "active")];

    const result = await reconcileBillingSubscriptions();

    expect(result.corrected).toBe(1);
    expect(writes[0]?.subscription_status).toBe("active");
    expect(writes[0]?.stripe_subscription_id).toBe("sub_paid");
  });

  it("prefers the live subscription over a newer trailing one", async () => {
    // past_due counts as live: Stripe is still trying to charge them.
    profileRows[0]!.subscription_status = null;
    subs = [sub("sub_dead", "incomplete_expired"), sub("sub_paid", "past_due")];

    await reconcileBillingSubscriptions();

    expect(writes[0]?.subscription_status).toBe("past_due");
    expect(writes[0]?.stripe_subscription_id).toBe("sub_paid");
  });

  it("clears local state when Stripe has no subscription at all", async () => {
    subs = [];

    const result = await reconcileBillingSubscriptions();

    expect(result.corrected).toBe(1);
    expect(writes[0]?.subscription_status).toBeNull();
  });

  it("leaves a never-subscribed customer alone", async () => {
    profileRows[0]!.subscription_status = null;
    profileRows[0]!.stripe_subscription_id = null;
    subs = [];

    const result = await reconcileBillingSubscriptions();

    expect(result.corrected).toBe(0);
    expect(writes).toHaveLength(0);
  });
});
