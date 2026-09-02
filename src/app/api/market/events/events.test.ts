/**
 * Earnings dates cost one provider call per name and this route took
 * whatever it was given, so a hundred and twenty words were a hundred and
 * twenty calls that could never answer. Free text is dropped before
 * anything is contacted now, the same way /api/quotes drops it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const yahoo = vi.hoisted(() => ({ asked: [] as string[][] }));
const budget = vi.hoisted(() => ({ checked: 0, ok: true }));

vi.mock("@/lib/market/yahoo", () => ({
  fetchMarketEvents: async (tickers: string[]) => {
    yahoo.asked.push(tickers);
    return { earnings: [], catalysts: [] };
  },
}));

vi.mock("@/lib/market/quotes", () => ({ MAX_TICKERS_PER_REQUEST: 120 }));

vi.mock("@/lib/market/unresolved-budget", () => ({
  checkUnresolvedBudget: async () => {
    budget.checked += 1;
    return budget.ok ? { ok: true } : { ok: false, retryAfterSec: 30 };
  },
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

import { GET } from "@/app/api/market/events/route";

function get(tickers: string): Promise<Response> {
  return GET(
    new NextRequest(
      `https://upsidelab.app/api/market/events?tickers=${encodeURIComponent(tickers)}`
    )
  ) as Promise<Response>;
}

beforeEach(() => {
  yahoo.asked = [];
  budget.checked = 0;
  budget.ok = true;
});

describe("GET /api/market/events", () => {
  it("drops names that are not symbol shaped", async () => {
    const res = await get("NBIS,HELLO WORLD,A(B,VUAA.DE");
    expect(res.status).toBe(200);
    expect(yahoo.asked).toEqual([["NBIS", "VUAA.DE"]]);
  });

  it("keeps the shapes the app stores", async () => {
    const real = "NBIS,BRK.B,CSPX.L,IWDA.AS,VOE.VI,BTC-USD,^GSPC,ES=F";
    await get(real);
    expect(yahoo.asked[0]).toEqual(real.split(","));
  });

  it("asks nobody when the whole list was free text", async () => {
    const res = await get("HELLO WORLD,DROP TABLE,<script>");
    expect(res.status).toBe(200);
    expect(yahoo.asked).toEqual([]);
    expect(budget.checked).toBe(0);
  });

  it("still honours an address already over its unknown-name budget", async () => {
    budget.ok = false;
    const res = await get("NBIS");
    expect(res.status).toBe(429);
    expect(yahoo.asked).toEqual([]);
  });
});
