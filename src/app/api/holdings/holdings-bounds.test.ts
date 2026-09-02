/**
 * The three numbers on a holding that are neither shares nor a buy price.
 * The request schema only says they are finite, so before this a PATCH
 * could set an end of year target to -1 or 1e300 and a Call % to 500, and
 * every one of those reaches a reader as a price: on the forecast grid, as
 * a strike on the covered-call table, and in the Sunday letter. A sort
 * order too big for its column failed the save with nothing on screen
 * saying why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ queried: 0 }));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/auth/ownership", () => ({
  requirePortfolioOwner: async () => null,
  listOwnedPortfolioIds: async () => ["p1"],
}));

// Any table access at all means a bad value got past the range checks.
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => ({
    from: () => {
      state.queried += 1;
      throw new Error("the route should have refused before reaching the table");
    },
  }),
  getSupabaseServer: () => null,
  supabaseUsesServiceRole: () => false,
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

import { PATCH, POST } from "@/app/api/holdings/route";

function send(method: "POST" | "PATCH", body: unknown): Promise<Response> {
  const handler = method === "POST" ? POST : PATCH;
  return handler(
    new NextRequest("https://upsidelab.app/api/holdings", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
}

const goodPost = {
  portfolio_id: "p1",
  ticker: "NBIS",
  shares: 10,
  buy_price: 100,
};

beforeEach(() => {
  state.queried = 0;
});

describe("POST /api/holdings ranges", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["a negative end of year target", { eoy_target: -5 }],
    ["an end of year target beyond safe money", { eoy_target: 1e300 }],
    ["a negative stock target", { stock_target_override: -1 }],
    ["a Call % typed as a whole percent", { target_call_pct: 15 }],
    ["a negative Call %", { target_call_pct: -0.2 }],
    ["a sort order too big for the column", { sort_order: 1e20 }],
    ["a fractional sort order", { sort_order: 1.5 }],
  ];

  for (const [name, extra] of cases) {
    it(`refuses ${name} before writing anything`, async () => {
      const res = await send("POST", { ...goodPost, ...extra });
      expect(res.status).toBe(400);
      expect(state.queried).toBe(0);
    });
  }
});

describe("PATCH /api/holdings ranges", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["a negative end of year target", { eoy_target: -5 }],
    ["a stock target beyond safe money", { stock_target_override: 1e300 }],
    ["a Call % of 500", { target_call_pct: 5 }],
    ["a negative sort order", { sort_order: -3 }],
  ];

  for (const [name, extra] of cases) {
    it(`refuses ${name} before writing anything`, async () => {
      const res = await send("PATCH", { id: "h1", ...extra });
      expect(res.status).toBe(400);
      expect(state.queried).toBe(0);
    });
  }

  it("says something a reader can act on, never a database sentence", async () => {
    const res = await send("PATCH", { id: "h1", target_call_pct: 5 });
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Call % must be between 0 and 100");
  });

  it("lets a real edit through to the table", async () => {
    // Reaching the table is the pass condition here: the stub throws on
    // the first query, which is as far as this test needs to go.
    await expect(
      send("PATCH", { id: "h1", eoy_target: 150, target_call_pct: 0.15 })
    ).rejects.toThrow();
    expect(state.queried).toBe(1);
  });
});
