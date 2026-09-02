/**
 * The fund feed is the same rows for everybody, so it is read once and
 * handed to every viewer for fifteen seconds. What has to stay true is that
 * only the rows are shared: the sign-in check runs per request, and the
 * body a viewer gets is the one the uncached route used to build.
 *
 * `unstable_cache` is stubbed with a plain time-to-live memo. What is under
 * test is our own wiring, which side of the cache each piece sits on, and a
 * memo with a clock the test owns says that without standing up Next's
 * incremental cache. The stub awaits the callback before storing anything,
 * which is what Next itself does, so a rejection leaves the window empty.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const clock = vi.hoisted(() => ({ now: 0 }));

vi.mock("next/cache", () => ({
  unstable_cache: <Args extends unknown[], Result>(
    fn: (...args: Args) => Promise<Result>,
    keyParts: string[],
    options: { revalidate: number }
  ) => {
    const store = new Map<string, { at: number; value: Result }>();
    return async (...args: Args): Promise<Result> => {
      const key = [...keyParts, JSON.stringify(args)].join(":");
      const hit = store.get(key);
      if (hit && clock.now - hit.at < options.revalidate * 1000) {
        return hit.value;
      }
      const value = await fn(...args);
      store.set(key, { at: clock.now, value });
      return value;
    };
  },
}));

/** Rows the stub hands back, one shape per table. */
const ROWS: Record<string, unknown[]> = {
  portfell_margus_fund_holdings: [
    { ticker: "NBIS", shares: 10, status: "open", entry_date: "2026-01-02" },
    { ticker: "CRWV", shares: 4, status: "closed", entry_date: "2025-12-01" },
  ],
  portfell_margus_fund_reports: [{ report_date: "2026-09-01", headline: "Day 1" }],
  portfell_margus_fund_weekly_recaps: [{ week_ending: "2026-08-30" }],
};
const SINGLE: Record<string, unknown> = {
  portfell_margus_fund: { id: "main", cash: 1000, starting_capital: 10000 },
};

let fromCalls: string[] = [];
let quoteCalls = 0;
let authCalls = 0;
let signedIn = true;
let failTable: string | null = null;

function stubClient() {
  return {
    from(table: string) {
      fromCalls.push(table);
      const error =
        failTable === table ? { message: "relation does not exist" } : null;
      const listed = Promise.resolve({
        data: error ? null : ROWS[table] ?? [],
        error,
      });
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: error ? null : SINGLE[table] ?? null, error }),
        then: (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => listed.then(onFulfilled, onRejected),
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => true,
  getSupabaseServer: () => stubClient(),
  getSupabaseDataClient: async () => stubClient(),
}));

vi.mock("@/lib/supabase/server-auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAuthUser: async () => {
      authCalls += 1;
      if (!signedIn) {
        return {
          error: NextResponse.json({ error: "Sign in required" }, { status: 401 }),
        };
      }
      return { user: { id: "u1" } };
    },
  };
});

vi.mock("@/lib/market/quotes", () => ({
  fetchQuotesWithFallback: async (tickers: string[]) => {
    quoteCalls += 1;
    return {
      quotes: Object.fromEntries(tickers.map((t) => [t, { price: 100 }])),
    };
  },
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (handler: () => Promise<Response>) => handler,
}));

import { GET } from "./route";

/** One request, body parsed. */
async function get() {
  const res = await GET();
  return { res, body: await res.json() };
}

beforeEach(() => {
  fromCalls = [];
  quoteCalls = 0;
  authCalls = 0;
  signedIn = true;
  failTable = null;
  // Every test starts outside the previous one's window.
  clock.now += 60_000;
});

describe("the fund payload", () => {
  it("is the shape the uncached route returned", async () => {
    const { res, body } = await get();

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "fund",
      "holdings",
      "quotes",
      "reports",
      "weeklyRecaps",
    ]);
    expect(body).toEqual({
      fund: SINGLE.portfell_margus_fund,
      holdings: ROWS.portfell_margus_fund_holdings,
      reports: ROWS.portfell_margus_fund_reports,
      weeklyRecaps: ROWS.portfell_margus_fund_weekly_recaps,
      // Open holdings only, and SPY as the benchmark line.
      quotes: { NBIS: { price: 100 }, SPY: { price: 100 } },
    });
  });

  it("reads Supabase once for two calls inside the window", async () => {
    const first = await get();
    const second = await get();

    expect(fromCalls).toEqual([
      "portfell_margus_fund",
      "portfell_margus_fund_holdings",
      "portfell_margus_fund_reports",
      "portfell_margus_fund_weekly_recaps",
    ]);
    expect(quoteCalls).toBe(1);
    expect(second.body).toEqual(first.body);
  });

  it("reads again once the window is past", async () => {
    await get();
    clock.now += 15_000;
    await get();

    expect(fromCalls).toHaveLength(8);
    expect(quoteCalls).toBe(2);
  });
});

describe("what stays outside the cache", () => {
  it("checks the session on every request", async () => {
    await get();
    await get();

    expect(authCalls).toBe(2);
  });

  it("refuses a signed-out caller even with the payload warm", async () => {
    await get();
    signedIn = false;
    const { res, body } = await get();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Sign in required" });
    // The warm payload was never built for, or handed to, this caller.
    expect(fromCalls).toHaveLength(4);
  });
});

describe("the response headers", () => {
  it("keep the body off any shared cache", async () => {
    const { res } = await get();
    const header = res.headers.get("cache-control") ?? "";

    // Behind a sign-in check, so a CDN copy would answer a request that
    // never passed it.
    expect(header).toContain("private");
    expect(header).not.toContain("public");
    expect(header).toContain("max-age=15");
    expect(res.headers.get("cdn-cache-control")).toBeNull();
  });
});

describe("a failed read", () => {
  it("answers with the plain sentence and does not fill the window", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failTable = "portfell_margus_fund_reports";

    const first = await get();
    expect(first.res.status).toBe(500);
    expect(first.body).toEqual({ error: "Database error" });
    // The driver's own wording never reaches the reader.
    expect(JSON.stringify(first.body)).not.toContain("relation");

    // A bad minute must not be what the next fifteen seconds are served.
    failTable = null;
    const second = await get();
    expect(second.res.status).toBe(200);
  });
});
