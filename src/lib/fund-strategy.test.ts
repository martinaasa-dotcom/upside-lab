import { describe, expect, it } from "vitest";
import {
  FUND_BENCHMARK,
  FUND_RULES,
  entrySignal,
  planTrades,
  readTicker,
  stopPrice,
  type FundPosition,
  type TickerRead,
} from "@/lib/fund-strategy";
import { closesThrough, positionsFromHoldings } from "@/lib/fund-run";
import type { FundHolding } from "@/lib/margus-fund";

/** A read with sensible defaults, overridden per case. */
function read(over: Partial<TickerRead> = {}): TickerRead {
  return {
    ticker: "LEAD",
    price: 100,
    sma50: 98,
    sma200: 80,
    rsi: 38,
    rsiPrev: 33,
    rsiLow: 33,
    strength: 0.3,
    dailyMove: 0.02,
    ...over,
  };
}
const benchUp = read({ ticker: FUND_BENCHMARK, price: 500, sma200: 450, strength: 0 });
const benchDown = read({ ticker: FUND_BENCHMARK, price: 400, sma200: 450, strength: 0 });
const pos = (over: Partial<FundPosition> = {}): FundPosition => ({
  ticker: "LEAD",
  shares: 100,
  entryPrice: 100,
  daysHeld: 10,
  peak: 100,
  trimmed: false,
  ...over,
});

describe("Upside Fund buys leaders at a short-term low, and nothing else", () => {
  it("buys a leader that pulled back and turned up", () => {
    expect(entrySignal(read())).toMatch(/pulled back to an RSI of 33 and turned up/);
  });

  it("refuses a name in a long downtrend, a laggard, one still falling, or one never oversold", () => {
    expect(entrySignal(read({ price: 70 }))).toBeNull();
    expect(entrySignal(read({ strength: FUND_RULES.minStrength - 0.01 }))).toBeNull();
    expect(entrySignal(read({ rsi: 30, rsiPrev: 33 }))).toBeNull();
    expect(entrySignal(read({ rsiLow: 55, rsi: 60, rsiPrev: 58 }))).toBeNull();
  });

  it("sizes a buy at a tenth of the fund and pays for it out of the parked money", () => {
    const orders = planTrades({
      cash: 0,
      parkedShares: 200, // $100,000 parked at $500
      positions: [],
      reads: { LEAD: read() },
      bench: benchUp,
    });
    const buy = orders.find((o) => o.ticker === "LEAD")!;
    expect(buy.side).toBe("buy");
    expect(buy.shares * buy.price).toBeCloseTo(10_000 * (1 - FUND_RULES.costPerTrade), 0);
    expect(orders[0]!.rule).toBe("unpark");
  });

  it("never holds more than the maximum number of companies", () => {
    const reads = Object.fromEntries(
      Array.from({ length: 15 }, (_, i) => [`T${i}`, read({ ticker: `T${i}` })])
    );
    const orders = planTrades({ cash: 100_000, parkedShares: 0, positions: [], reads, bench: benchUp });
    expect(orders.filter((o) => o.rule === "entry")).toHaveLength(FUND_RULES.maxPositions);
  });
});

describe("Upside Fund sells into strength and cuts what does not work", () => {
  it("sells half when overbought, then the rest on the next push", () => {
    const hot = read({ price: 130, rsi: 80, rsiPrev: 76, sma50: 120, rsiLow: 70 });
    const first = planTrades({ cash: 0, parkedShares: 0, positions: [pos()], reads: { LEAD: hot }, bench: benchUp });
    expect(first[0]).toMatchObject({ rule: "take-half", shares: 50 });
    const second = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ shares: 50, trimmed: true })], reads: { LEAD: hot }, bench: benchUp });
    expect(second[0]).toMatchObject({ rule: "take-rest", shares: 50 });
  });

  it("cuts a holding that breaks its stop, and says so with the price", () => {
    const p = pos();
    const r = read({ price: 80, rsi: 25, rsiPrev: 30, sma200: 70 });
    const stop = stopPrice(p, r);
    expect(stop).toBeGreaterThan(80);
    const orders = planTrades({ cash: 0, parkedShares: 0, positions: [p], reads: { LEAD: r }, bench: benchUp });
    expect(orders[0]).toMatchObject({ rule: "stop", side: "sell", shares: 100 });
    expect(orders[0]!.why).toMatch(/through its stop/);
  });

  it("keeps the stop between its bounds and trails it after a big gain", () => {
    const r = read({ dailyMove: 0.001 });
    expect(stopPrice(pos(), r)).toBeCloseTo(100 * (1 - FUND_RULES.minStop), 6);
    const wild = read({ dailyMove: 0.2 });
    expect(stopPrice(pos(), wild)).toBeCloseTo(100 * (1 - FUND_RULES.maxStop), 6);
    const ran = pos({ peak: 150 });
    expect(stopPrice(ran, r)).toBeGreaterThan(stopPrice(pos(), r));
  });

  it("cuts a holding still under water after three months, and anything after twelve", () => {
    const flat = read({ price: 97, rsi: 50, rsiPrev: 49 });
    const stale = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.staleDays })], reads: { LEAD: flat }, bench: benchUp });
    expect(stale[0]!.rule).toBe("stale");
    const up = read({ price: 105, rsi: 50, rsiPrev: 49 });
    const old = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.maxHoldDays })], reads: { LEAD: up }, bench: benchUp });
    expect(old[0]!.rule).toBe("time");
  });
});

describe("Upside Fund uses the money it has", () => {
  it("parks free cash in the Nasdaq 100 while it trends up", () => {
    const orders = planTrades({ cash: 50_000, parkedShares: 0, positions: [], reads: {}, bench: benchUp });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ side: "buy", ticker: FUND_BENCHMARK, rule: "park" });
  });

  it("takes parked money back to cash when the Nasdaq 100 loses its long trend", () => {
    const orders = planTrades({ cash: 0, parkedShares: 100, positions: [], reads: {}, bench: benchDown });
    expect(orders[0]).toMatchObject({ side: "sell", ticker: FUND_BENCHMARK, rule: "unpark", shares: 100 });
  });

  it("holds less in companies when the Nasdaq 100 is in a downtrend", () => {
    const reads = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`T${i}`, read({ ticker: `T${i}` })])
    );
    const orders = planTrades({ cash: 100_000, parkedShares: 0, positions: [], reads, bench: benchDown });
    const spent = orders.filter((o) => o.rule === "entry").reduce((s, o) => s + o.shares * o.price, 0);
    expect(spent).toBeLessThanOrEqual(100_000 * FUND_RULES.riskOffExposure + 1);
  });
});

describe("the stored book becomes positions without reading the future", () => {
  const series = {
    dates: ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"],
    closes: [100, 110, 120, 90],
  };

  it("cuts history at the day being run", () => {
    expect(closesThrough(series, "2026-01-05").closes).toEqual([100, 110]);
  });

  it("reads each holding's peak and days held from its own closes, and parks the benchmark", () => {
    const holding = (ticker: string, shares: number): FundHolding => ({
      id: ticker, ticker, shares, cost_basis: 100, entry_date: "2026-01-02",
      thesis: "", target_timeframe: null, exit_plan: null, status: "open",
      closed_at: null, exit_reasoning: null, realized_pnl: null,
    });
    const { positions, parkedShares } = positionsFromHoldings({
      holdings: [holding("LEAD", 10), holding(FUND_BENCHMARK, 7)],
      history: { LEAD: series },
      day: "2026-01-06",
      trimmedSince: (t) => t === "LEAD",
    });
    expect(parkedShares).toBe(7);
    expect(positions).toEqual([
      { ticker: "LEAD", shares: 10, entryPrice: 100, daysHeld: 2, peak: 120, trimmed: true },
    ]);
  });

  it("needs a year of history before it will read a trend", () => {
    expect(readTicker("X", Array(100).fill(10), Array(100).fill(10))).toBeNull();
  });
});
