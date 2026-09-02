/**
 * One anonymous GET used to be able to spend the whole product's provider
 * quota. Nothing checked that a name was a symbol at all, and the
 * unresolved budget was billed after the walk, so a request naming a
 * hundred and twenty invented tickers walked all of them (about fifty-two
 * upstream calls apiece) and only then found itself over budget.
 *
 * Both halves are checked here: free text never reaches a provider, and the
 * bill for the names that would walk is settled before the fetch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const market = vi.hoisted(() => ({
  /** Names the route actually handed to the provider chain. */
  asked: [] as string[][],
  /** Names the caches cannot vouch for, per the stubbed predictor. */
  walkers: [] as string[],
  fxCalls: 0,
}));

const budget = vi.hoisted(() => ({
  checked: 0,
  charged: [] as string[][],
  checkOk: true,
  chargeOk: true,
  /** Call names in the order they happened, so ordering can be asserted. */
  order: [] as string[],
}));

vi.mock("@/lib/market/quotes", () => ({
  // Kept in step with the real module by `quotes-limits.test.ts`.
  MAX_TICKERS_PER_REQUEST: 120,
  MAX_UNKNOWN_NAMES_PER_REQUEST: 25,
  fetchFxOnly: async () => {
    market.fxCalls += 1;
    return { eurUsd: 1.1, usdPer: {} };
  },
  fetchQuotesWithFallback: async (tickers: string[]) => {
    market.asked.push(tickers);
    budget.order.push("fetch");
    return {
      quotes: {},
      fx: { eurUsd: 1.1, usdPer: {} },
      delayed: false,
      sources: {},
      missing: [],
      newlyUnresolvable: [],
      updatedAt: Date.now(),
    };
  },
  namesThatWouldWalk: async (tickers: readonly string[]) =>
    market.walkers.filter((w) => tickers.includes(w)),
}));

vi.mock("@/lib/market/unresolved-budget", () => ({
  checkUnresolvedBudget: async () => {
    budget.checked += 1;
    budget.order.push("check");
    return budget.checkOk ? { ok: true } : { ok: false, retryAfterSec: 30 };
  },
  chargeUnresolvedBudget: async (_req: Request, names: readonly string[]) => {
    budget.charged.push([...names]);
    budget.order.push("charge");
    return budget.chargeOk ? { ok: true } : { ok: false, retryAfterSec: 45 };
  },
}));

vi.mock("@/lib/observe-route", () => ({
  observeRoute: (h: (req: NextRequest) => Promise<Response>) => h,
}));

import { GET } from "@/app/api/quotes/route";

function get(tickers: string): Promise<Response> {
  return GET(
    new NextRequest(
      `https://upsidelab.app/api/quotes?tickers=${encodeURIComponent(tickers)}`
    )
  ) as Promise<Response>;
}

beforeEach(() => {
  market.asked = [];
  market.walkers = [];
  market.fxCalls = 0;
  budget.checked = 0;
  budget.charged = [];
  budget.checkOk = true;
  budget.chargeOk = true;
  budget.order = [];
});

describe("free text never reaches a provider", () => {
  it("drops names that are not symbol shaped and reports them missing", async () => {
    const res = await get("NBIS,HELLO WORLD,<script>,A(B,VUAA.DE");
    expect(res.status).toBe(200);
    expect(market.asked).toEqual([["NBIS", "VUAA.DE"]]);
    const body = (await res.json()) as { missing: string[] };
    expect(body.missing).toEqual(
      expect.arrayContaining(["HELLO WORLD", "<SCRIPT>", "A(B"])
    );
  });

  it("keeps every legitimate shape the app stores", async () => {
    const real =
      "NBIS,BRK.B,VUAA.DE,CSPX.L,IWDA.AS,SAN.PA,VOE.VI,LHV1T.TL,BTC-USD,^GSPC,ES=F";
    const res = await get(real);
    expect(res.status).toBe(200);
    expect(market.asked[0]).toEqual(real.split(","));
  });

  it("answers a list of nothing but free text without asking anyone", async () => {
    const res = await get("HELLO WORLD,DROP TABLE");
    expect(res.status).toBe(400);
    expect(market.asked).toEqual([]);
    expect(market.fxCalls).toBe(0);
  });

  it("still serves currency on its own for an empty portfolio", async () => {
    const res = await get("EURUSD=X");
    expect(res.status).toBe(200);
    expect(market.fxCalls).toBe(1);
    expect(market.asked).toEqual([]);
  });
});

describe("the unresolved budget is settled before the walk", () => {
  it("charges the names no cache can vouch for, then fetches", async () => {
    market.walkers = ["ZZQX", "QQZW"];
    const res = await get("NBIS,ZZQX,QQZW");
    expect(res.status).toBe(200);
    expect(budget.charged).toEqual([["ZZQX", "QQZW"]]);
    expect(budget.order).toEqual(["check", "charge", "fetch"]);
  });

  it("charges nothing for a portfolio the caches already know", async () => {
    const res = await get("NBIS,CRWV");
    expect(res.status).toBe(200);
    expect(budget.charged).toEqual([[]]);
  });

  it("refuses before contacting a provider once the bill will not fit", async () => {
    market.walkers = ["ZZQX"];
    budget.chargeOk = false;
    const res = await get("NBIS,ZZQX");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    expect(market.asked).toEqual([]);
  });

  it("refuses an address already over budget without predicting anything", async () => {
    budget.checkOk = false;
    const res = await get("NBIS");
    expect(res.status).toBe(429);
    expect(budget.charged).toEqual([]);
    expect(market.asked).toEqual([]);
  });
});

describe("one request cannot walk more than its share", () => {
  it("asks about the first 25 unknown names and defers the rest", async () => {
    const invented = Array.from({ length: 60 }, (_, i) => `ZQ${i}`);
    market.walkers = invented;
    const res = await get(invented.join(","));
    expect(res.status).toBe(200);
    // Charged for exactly the ceiling, and only those were asked about.
    expect(budget.charged[0]).toHaveLength(25);
    expect(market.asked[0]).toHaveLength(25);
    const body = (await res.json()) as { missing: string[] };
    // The other 35 come back missing, so the reader keeps their last mark
    // and the next poll picks them up.
    expect(body.missing).toHaveLength(35);
  });

  it("refuses a request naming more than the ticker ceiling", async () => {
    const many = Array.from({ length: 121 }, (_, i) => `AA${i}`);
    const res = await get(many.join(","));
    expect(res.status).toBe(400);
    expect(market.asked).toEqual([]);
    expect(budget.checked).toBe(0);
  });
});
