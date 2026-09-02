/**
 * Who may ask for the year chart, and for which half of it.
 *
 * The recorded nights are somebody's own saved copies, so reading them
 * needs their session. The assumed line is arithmetic over a year of public
 * closing prices for tickers the caller names, and it used to be free to
 * anyone who found the address: a year of history for up to MAX_TICKERS
 * names with only the proxy's per-address ceiling in front of it. It is
 * bounded rather than closed now, because a reader looking around with a
 * sample portfolio has no session and the line is public data either way.
 * Signed out costs a durable budget and carries fewer names, and it never
 * reaches a saved copy.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const yahoo = vi.hoisted(() => ({ asked: [] as string[][] }));
const limiter = vi.hoisted(() => ({
  calls: [] as { key: string; limit: number; windowMs: number }[],
  ok: true,
}));
const snapshots = vi.hoisted(() => ({ askedFor: [] as string[] }));

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
  listOwnedPortfolioIds: async (userId: string) => {
    snapshots.askedFor.push(userId);
    return [];
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => null,
}));
vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async (key: string, limit: number, windowMs: number) => {
    limiter.calls.push({ key, limit, windowMs });
    return limiter.ok ? { ok: true } : { ok: false, retryAfterSec: 30 };
  },
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
  limiter.calls = [];
  limiter.ok = true;
  snapshots.askedFor = [];
});

describe("/api/book/nav-history", () => {
  it("draws the assumed line for a signed-out reader, on a budget", async () => {
    const res = await post(ASSUMED);
    expect(res.status).toBe(200);
    expect(yahoo.asked[0]).toEqual(["NVDA", "AAPL"]);
    expect(limiter.calls).toHaveLength(1);
    expect(limiter.calls[0]!.key.startsWith("nav-history:")).toBe(true);
  });

  it("never reaches a saved copy without a session", async () => {
    await post(ASSUMED);
    expect(snapshots.askedFor).toEqual([]);
    const res = await post({ assumed: false, includeSpy: true });
    expect(await res.json()).toMatchObject({ points: [], assumed: false });
    expect(snapshots.askedFor).toEqual([]);
  });

  it("refuses a signed-out reader who has spent the budget", async () => {
    limiter.ok = false;
    const res = await post(ASSUMED);
    expect(res.status).toBe(429);
    expect(yahoo.asked).toEqual([]);
  });

  it("carries fewer names for a signed-out reader", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ticker: `T${i}`,
      shares: 1,
    }));
    await post({ assumed: true, cash: 0, positions: many });
    expect(yahoo.asked[0]).toHaveLength(10);

    auth.user = { id: "user-42" };
    yahoo.asked = [];
    await post({ assumed: true, cash: 0, positions: many });
    expect(yahoo.asked[0]).toHaveLength(20);
  });

  it("GET answers 401 with no session, because it only reads saved copies", async () => {
    const res = (await GET()) as Response;
    expect(res.status).toBe(401);
  });

  it("builds the whole thing for a signed-in reader, and spends no budget", async () => {
    auth.user = { id: "user-42" };
    const res = await post(ASSUMED);
    expect(res.status).toBe(200);
    expect(yahoo.asked[0]).toEqual(["NVDA", "AAPL"]);
    expect(limiter.calls).toEqual([]);
    expect(snapshots.askedFor).toEqual(["user-42"]);
  });
});
