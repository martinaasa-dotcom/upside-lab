/**
 * A classroom arriving at once, measured rather than assumed.
 *
 * The session-keyed rate limiter was fixed after a real class on one
 * school network spent the whole IP budget in seconds; that half now has
 * tests. This is the other half the audit checklist asked for: what the
 * market layer does when twenty-five signed-in sessions poll the same
 * names in the same instant. The per-ticker sharing inside the Yahoo leg
 * already collapses symbol lookups, but FX, the fallback providers and
 * the store round-trips were still paid once per caller, so a class was
 * a herd. `fetchQuotesWithFallback` now single-flights concurrent calls
 * for the same set of names, and this file counts the provider batches
 * to hold that: one class, one walk.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/types";

let batches = 0;
let batchSizes: number[] = [];

function fakeQuote(ticker: string): Quote {
  return {
    ticker,
    price: 100,
    change: 1,
    changePercent: 0.01,
    previousClose: 99,
    sparkline: [98, 99, 100],
    marketState: "REGULAR",
    preMarketPrice: null,
    preMarketChange: null,
    preMarketChangePercent: null,
    postMarketPrice: null,
    postMarketChange: null,
    postMarketChangePercent: null,
  };
}

vi.mock("@/lib/market/yahoo", () => ({
  fetchQuotesYahoo: async (tickers: string[]) => {
    batches += 1;
    batchSizes.push(tickers.length);
    // Hold the batch open long enough that concurrent callers overlap it,
    // which is the condition the single-flight exists for.
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      quotes: Object.fromEntries(tickers.map((t) => [t, fakeQuote(t)])),
      fx: {
        eurUsd: 1.08,
        eurUsdOpen: 1.08,
        eurUsdPreviousClose: 1.08,
        eurUsdLast: 1.08,
        gbpUsd: 1.27,
        usdPer: {},
      },
      failed: [],
    };
  },
  fetchFxOnly: async () => ({
    eurUsd: 1.08,
    eurUsdOpen: 1.08,
    eurUsdPreviousClose: 1.08,
    eurUsdLast: 1.08,
    gbpUsd: 1.27,
    usdPer: {},
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => null,
  supabaseUsesServiceRole: () => false,
}));
vi.mock("@/lib/market/providers/twelvedata", () => ({
  twelveDataConfigured: () => false,
  fetchQuotesTwelveData: async () => ({ quotes: {}, missing: [] }),
}));
vi.mock("@/lib/market/providers/finnhub", () => ({
  finnhubConfigured: () => false,
  fetchQuotesFinnhub: async () => ({ quotes: {}, missing: [] }),
}));

const { fetchQuotesWithFallback } = await import("@/lib/market/quotes");
const { resetUnresolvableForTests } = await import("@/lib/market/unresolvable");

const CLASS_PORTFOLIO = ["NVDA", "CRWV", "RKLB", "BMNR", "VST"];

/** The same names in a different order is the same portfolio. */
function shuffled(seed: number): string[] {
  const out = [...CLASS_PORTFOLIO];
  for (let i = out.length - 1; i > 0; i--) {
    const j = (seed + i * 7) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

beforeEach(() => {
  batches = 0;
  batchSizes = [];
  resetUnresolvableForTests();
});

describe("a class polling quotes together", () => {
  it("costs one provider walk, not one per student", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, (_, student) =>
        fetchQuotesWithFallback(shuffled(student))
      )
    );
    expect(batches).toBe(1);
    for (const result of results) {
      for (const ticker of CLASS_PORTFOLIO) {
        expect(result.quotes[ticker]?.price).toBe(100);
      }
      expect(result.missing).toEqual([]);
    }
  });

  it("hands each caller its own copy of the answer", async () => {
    const [first, second] = await Promise.all([
      fetchQuotesWithFallback(CLASS_PORTFOLIO),
      fetchQuotesWithFallback(CLASS_PORTFOLIO),
    ]);
    expect(batches).toBe(1);
    // One route handler reshaping its response must not reach into
    // another request's still-being-serialized answer.
    delete first.quotes.NVDA;
    first.quotes.VST.price = 0;
    expect(second.quotes.NVDA?.price).toBe(100);
    expect(second.quotes.VST.price).toBe(100);
  });

  it("shares in-flight work only, never a settled answer", async () => {
    await fetchQuotesWithFallback(CLASS_PORTFOLIO);
    await fetchQuotesWithFallback(CLASS_PORTFOLIO);
    // Two sequential polls are two real reads; the single-flight is not a
    // cache and freshness stays the store's business.
    expect(batches).toBe(2);
  });

  it("two different classes walk separately and get their own names", async () => {
    const other = ["AAPL", "MSFT"];
    const [a, b] = await Promise.all([
      fetchQuotesWithFallback(CLASS_PORTFOLIO),
      fetchQuotesWithFallback(other),
    ]);
    expect(batches).toBe(2);
    expect(Object.keys(a.quotes).sort()).toEqual([...CLASS_PORTFOLIO].sort());
    expect(Object.keys(b.quotes).sort()).toEqual(other.sort());
  });
});
