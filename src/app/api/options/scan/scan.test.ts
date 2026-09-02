/**
 * Each position in a scan becomes an option chain lookup, so a ticker that
 * is not a symbol is a provider call that can never answer, and the price
 * history came in unbounded: a megabyte body was a megabyte of numbers
 * carried into the strike arithmetic for no gain, since only recent closes
 * shape a strike.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scan = vi.hoisted(() => ({
  calls: [] as { ticker: string; history: number[] }[],
}));

vi.mock("@/lib/supabase/server-auth", () => ({
  requireAuthUser: async () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/supabase/server", () => ({
  getSupabaseDataClient: async () => null,
  getSupabaseServer: () => null,
  supabaseUsesServiceRole: () => false,
}));

vi.mock("@/lib/rate-limit-durable", () => ({
  takeDurableRateLimit: async () => ({ ok: true }),
}));

vi.mock("@/lib/market/covered-call", () => ({
  scanCoveredCall: async (params: { ticker: string; priceHistory?: number[] }) => {
    scan.calls.push({
      ticker: params.ticker,
      history: params.priceHistory ?? [],
    });
    return null;
  },
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

import { POST } from "@/app/api/options/scan/route";

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest("https://upsidelab.app/api/options/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;
}

beforeEach(() => {
  scan.calls = [];
});

describe("POST /api/options/scan", () => {
  it("drops a position whose ticker is not a symbol", async () => {
    const res = await post({
      positions: [
        { ticker: "NBIS", spot: 100, shares: 200 },
        { ticker: "HELLO WORLD", spot: 100, shares: 200 },
        { ticker: "A(B", spot: 100, shares: 200 },
        { ticker: "VUAA.DE", spot: 50, shares: 300 },
      ],
    });
    expect(res.status).toBe(200);
    expect(scan.calls.map((c) => c.ticker)).toEqual(["NBIS", "VUAA.DE"]);
  });

  it("caps the price history it carries into the strike arithmetic", async () => {
    const history = Array.from({ length: 5_000 }, (_, i) => 100 + i);
    await post({
      positions: [{ ticker: "NBIS", spot: 100, shares: 200, price_history: history }],
    });
    expect(scan.calls[0].history).toHaveLength(400);
  });

  it("keeps the recent end of a long history, not the old end", async () => {
    const history = Array.from({ length: 5_000 }, (_, i) => i);
    await post({
      positions: [{ ticker: "NBIS", spot: 100, shares: 200, price_history: history }],
    });
    // The tail is what the arithmetic wants: the closes nearest today.
    expect(scan.calls[0].history[0]).toBe(4_600);
    expect(scan.calls[0].history.at(-1)).toBe(4_999);
  });

  it("refuses a list longer than the schema allows", async () => {
    const positions = Array.from({ length: 51 }, () => ({
      ticker: "NBIS",
      spot: 100,
      shares: 200,
    }));
    const res = await post({ positions });
    expect(res.status).toBe(400);
    expect(scan.calls).toEqual([]);
  });
});
