/**
 * The background-cache fast path in `fetchQuotesWithFallbackUnshared`: a
 * ticker the shared store already answers inside the view-freshness window
 * skips the live Yahoo round trip entirely, which is what makes the warm
 * cron (`/api/cron/quotes-warm`) actually shrink the "wrong number on
 * screen while the live fetch is in flight" window this exists to close.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let quoteCalls = 0;

vi.mock("yahoo-finance2", () => ({
  default: class {
    async quote() {
      quoteCalls++;
      return null;
    }
    async chart() {
      quoteCalls++;
      return null;
    }
    async search() {
      return { quotes: [] };
    }
  },
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
const { rememberQuotesInMemory, resetQuoteStoreForTests } = await import(
  "@/lib/market/quote-store"
);
const { resetUnresolvableForTests } = await import(
  "@/lib/market/unresolvable"
);

beforeEach(() => {
  quoteCalls = 0;
  resetQuoteStoreForTests();
  resetUnresolvableForTests();
});

describe("the shared background cache as a fast path", () => {
  it("skips Yahoo for a ticker the store just answered", async () => {
    rememberQuotesInMemory(
      {
        NVDA: {
          ticker: "NVDA",
          price: 180.5,
          change: 1.2,
          changePercent: 0.7,
          previousClose: 179.3,
          sparkline: [],
          marketState: "REGULAR",
          preMarketPrice: null,
          preMarketChange: null,
          preMarketChangePercent: null,
          postMarketPrice: null,
          postMarketChange: null,
          postMarketChangePercent: null,
        },
      },
      Date.now()
    );

    const result = await fetchQuotesWithFallback(["NVDA"]);

    expect(quoteCalls).toBe(0);
    expect(result.quotes.NVDA?.price).toBe(180.5);
    expect(result.quotes.NVDA?.stale).toBe(false);
    expect(result.sources.NVDA).toBe("warm");
    // Genuinely fresh -- a reader must not be told this is a delayed print.
    expect(result.delayed).toBe(false);
  });

  it("still asks Yahoo when the store's answer has aged past the view window", async () => {
    rememberQuotesInMemory(
      {
        NVDA: {
          ticker: "NVDA",
          price: 180.5,
          change: 1.2,
          changePercent: 0.7,
          previousClose: 179.3,
          sparkline: [],
          marketState: "REGULAR",
          preMarketPrice: null,
          preMarketChange: null,
          preMarketChangePercent: null,
          postMarketPrice: null,
          postMarketChange: null,
          postMarketChangePercent: null,
        },
      },
      Date.now() - 10 * 60_000
    );

    await fetchQuotesWithFallback(["NVDA"]);

    expect(quoteCalls).toBeGreaterThan(0);
  });
});
