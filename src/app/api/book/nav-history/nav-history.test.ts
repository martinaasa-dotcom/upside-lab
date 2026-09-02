/**
 * The year chart's history is up to MAX_TICKERS names of daily closes from
 * Yahoo, on a free tier. POST used to read a missing session as "no recorded
 * nights" and build the assumed path anyway, so anyone who found the address
 * could have the provider walked for them. Both routes want a session now;
 * the callers (Home's year chart, the Fund compare) already sit behind
 * SignInGate, so a reader sees nothing different.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const yahoo = vi.hoisted(() => ({ asked: [] as string[][] }));

vi.mock("@/lib/supabase/server-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuthUser: async () =>
      auth.user
        ? { user: auth.user }
        : {
            error: NextResponse.json(
              { error: "Sign in required" },
              { status: 401 }
            ),
          },
  };
});

vi.mock("@/lib/market/yahoo", () => ({
  fetchYtdDailyCloses: async (tickers: string[]) => {
    yahoo.asked.push(tickers);
    return {};
  },
}));
vi.mock("@/lib/auth/ownership", () => ({
  listOwnedPortfolioIds: async () => [],
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => null,
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: Request) => Promise<Response>) => h,
}));

import { GET, POST } from "@/app/api/book/nav-history/route";

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://upsidelab.app/api/book/nav-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
}

const ASSUMED = {
  assumed: true,
  cash: 100,
  positions: [
    { ticker: "nvda", shares: 10 },
    { ticker: "AAPL", shares: 5 },
  ],
  includeSpy: true,
};

beforeEach(() => {
  auth.user = null;
  yahoo.asked = [];
});

describe("/api/book/nav-history", () => {
  it("POST answers 401 with no session and never asks the provider", async () => {
    const res = await post(ASSUMED);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in required" });
    expect(yahoo.asked).toEqual([]);
  });

  it("POST with assumed=false and the index still wants a session", async () => {
    const res = await post({ assumed: false, includeSpy: true });
    expect(res.status).toBe(401);
    expect(yahoo.asked).toEqual([]);
  });

  it("GET answers 401 with no session", async () => {
    const res = (await GET()) as Response;
    expect(res.status).toBe(401);
  });

  it("POST builds the path for a signed-in reader", async () => {
    auth.user = { id: "user-42" };
    const res = await post(ASSUMED);
    expect(res.status).toBe(200);
    expect(yahoo.asked[0]).toEqual(["NVDA", "AAPL"]);
  });
});
