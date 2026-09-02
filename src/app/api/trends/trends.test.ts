/**
 * One trends request is up to MAX_TICKERS names of weekly history from
 * Yahoo. The budget for that used to be the in-memory limiter, which is per
 * warm instance: a burst spread over cold starts got a fresh thirty each.
 * The route asks the shared bucket now, like forecast and Pulse, keyed on
 * the reader, with the same 429 shape as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ user: null as { id: string } | null }));
const durable = vi.hoisted(() => ({
  calls: [] as { key: string; limit: number; windowMs: number }[],
  ok: true,
}));
const memory = vi.hoisted(() => ({ calls: 0 }));
const trends = vi.hoisted(() => ({ asked: [] as string[][] }));

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

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async (key: string, limit: number, windowMs: number) => {
    durable.calls.push({ key, limit, windowMs });
    return durable.ok ? { ok: true } : { ok: false, retryAfterSec: 45 };
  },
}));

// The durable limiter is mocked whole, so a call to checkRateLimit here can
// only come from the route reaching for the per-instance bucket directly.
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: (...args: Parameters<typeof actual.checkRateLimit>) => {
      memory.calls += 1;
      return actual.checkRateLimit(...args);
    },
  };
});

vi.mock("@/lib/market/trends-cache", () => ({
  MAX_TICKERS: 14,
  fetchTrendsBatch: async (tickers: string[]) => {
    trends.asked.push(tickers);
    return { rows: [], benchmark: null, asOf: "2026-09-01", cachedCount: 0 };
  },
}));
vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/trends/route";

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("https://upsidelab.app/api/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
}

beforeEach(() => {
  auth.user = null;
  durable.calls = [];
  durable.ok = true;
  memory.calls = 0;
  trends.asked = [];
});

describe("POST /api/trends", () => {
  it("answers 401 with no session and spends nothing", async () => {
    const res = await post({ tickers: ["NVDA"] });
    expect(res.status).toBe(401);
    expect(durable.calls).toEqual([]);
    expect(trends.asked).toEqual([]);
  });

  it("asks the shared bucket, keyed on the reader, and not the memory one", async () => {
    auth.user = { id: "user-42" };
    const res = await post({ tickers: ["nvda", "NVDA", "aapl"] });
    expect(res.status).toBe(200);
    expect(durable.calls).toHaveLength(1);
    expect(durable.calls[0].key).toBe("trends:user-42");
    expect(durable.calls[0].limit).toBeGreaterThan(0);
    expect(durable.calls[0].windowMs).toBeGreaterThan(0);
    expect(memory.calls).toBe(0);
    expect(trends.asked).toEqual([["NVDA", "AAPL"]]);
  });

  it("keeps the 429 shape when the shared bucket refuses", async () => {
    auth.user = { id: "user-42" };
    durable.ok = false;
    const res = await post({ tickers: ["NVDA"] });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(trends.asked).toEqual([]);
  });
});
