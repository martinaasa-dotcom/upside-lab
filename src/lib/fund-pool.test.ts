import { describe, expect, it } from "vitest";
import { POOL_RULES, poolFromQuotes, recentMonths, type PoolQuote } from "@/lib/fund-pool";
import { planTrades, FUND_BENCHMARK, type FundPosition, type TickerRead } from "@/lib/fund-strategy";

const q = (symbol: string, over: Partial<PoolQuote> = {}): PoolQuote => ({
  symbol,
  quoteType: "EQUITY",
  exchange: "NMS",
  marketCap: 20e9,
  regularMarketPrice: 50,
  ...over,
});

describe("the Fund's dynamic pool of retail favourites", () => {
  it("lets in a large US company and keeps the order the feed offered", () => {
    expect(poolFromQuotes(["RIVN", "GME"], [q("GME"), q("RIVN")])).toEqual(["RIVN", "GME"]);
  });

  it("keeps out funds, small companies, cheap shares and foreign listings", () => {
    const quotes = [
      q("TQQQ", { quoteType: "ETF" }),
      q("TINY", { marketCap: POOL_RULES.minMarketCap - 1 }),
      q("PENY", { regularMarketPrice: POOL_RULES.minPrice - 0.01 }),
      q("LSE", { exchange: "LSE" }),
      q("NOCAP", { marketCap: undefined }),
    ];
    expect(poolFromQuotes(["TQQQ", "TINY", "PENY", "LSE", "NOCAP", "GONE"], quotes)).toEqual([]);
  });

  it("never repeats a name already on the fixed list or the benchmark", () => {
    expect(poolFromQuotes(["NVDA", FUND_BENCHMARK, "nvda"], [q("NVDA"), q(FUND_BENCHMARK)])).toEqual([]);
  });

  it("stops at its cap", () => {
    const names = Array.from({ length: 60 }, (_, i) => `Z${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`);
    expect(poolFromQuotes(names, names.map((n) => q(n)))).toHaveLength(POOL_RULES.maxNames);
  });

  it("looks back over this month and the two before it", () => {
    expect(recentMonths(new Date("2026-01-15T00:00:00Z"))).toEqual(["2026-01", "2025-12", "2025-11"]);
  });

  it("holds a company it bought from the pool once it stops trending, rather than dumping it", () => {
    // The cron passes every holding with an exit plan as allowed, so the
    // off-list rule only reaches money parked outside the benchmark.
    const read: TickerRead = {
      ticker: "ASTS", price: 60, sma50: 55, sma200: 40, rsi: 55, rsiPrev: 54, rsiLow: 50,
      strength: 0.4, dailyMove: 0.04, high: 65, strengthShort: 0.1, sma50Prev: 52,
    };
    const pos: FundPosition = { ticker: "ASTS", shares: 10, entryPrice: 58, daysHeld: 5, peak: 60, trimmed: false };
    const bench: TickerRead = { ...read, ticker: FUND_BENCHMARK, price: 500, sma200: 450, strength: 0 };
    const kept = planTrades({ cash: 100_000, parkedShares: 0, positions: [pos], reads: { ASTS: read }, bench, universe: new Set(["ASTS"]) });
    expect(kept.find((o) => o.ticker === "ASTS")).toBeUndefined();
    const dropped = planTrades({ cash: 100_000, parkedShares: 0, positions: [pos], reads: { ASTS: read }, bench, universe: new Set() });
    expect(dropped.find((o) => o.ticker === "ASTS")?.rule).toBe("off-list");
  });
});
