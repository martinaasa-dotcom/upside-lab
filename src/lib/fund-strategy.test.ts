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
import {
  closesThrough,
  fundDaysToRun,
  positionsFromHoldings,
  startLineOff,
  watchlistFrom,
} from "@/lib/fund-run";
import { withSettledClose } from "@/lib/market/daily-history";
import { fundReturnSplit } from "@/lib/margus-fund-mark";
import { tradingDaysBetween } from "@/lib/market/session";
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
    high: 110,
    strengthShort: 0.1,
    sma50Prev: 96,
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

  it("cuts a holding still under water after two months, and anything after six", () => {
    const flat = read({ price: 97, rsi: 50, rsiPrev: 49 });
    const stale = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.staleDays })], reads: { LEAD: flat }, bench: benchUp });
    expect(stale[0]!.rule).toBe("stale");
    const up = read({ price: 105, rsi: 50, rsiPrev: 49 });
    const old = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.maxHoldDays })], reads: { LEAD: up }, bench: benchUp });
    expect(old[0]!.rule).toBe("time");
  });
});

describe("Upside Fund uses the money it has", () => {
  it("parks free cash in the S&P 500 while it trends up", () => {
    const orders = planTrades({ cash: 50_000, parkedShares: 0, positions: [], reads: {}, bench: benchUp });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ side: "buy", ticker: FUND_BENCHMARK, rule: "park" });
  });

  it("takes parked money back to cash when the S&P 500 loses its long trend", () => {
    const orders = planTrades({ cash: 0, parkedShares: 100, positions: [], reads: {}, bench: benchDown });
    expect(orders[0]).toMatchObject({ side: "sell", ticker: FUND_BENCHMARK, rule: "unpark", shares: 100 });
  });

  it("holds less in companies when the S&P 500 is in a downtrend", () => {
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

describe("Upside Fund also buys a leader breaking out to a new high", () => {
  const breakout = (over: Partial<TickerRead> = {}) =>
    read({ price: 112, high: 110, sma50: 100, sma50Prev: 97, sma200: 85, rsi: 64, rsiPrev: 60, rsiLow: 58, ...over });

  it("buys a leader closing above its three-month high in a rising trend, and says so with the figures", () => {
    expect(entrySignal(breakout())).toMatch(/above its highest close of the last three months \(\$110\.00\)/);
  });

  it("refuses a breakout that is overbought, stretched, falling behind, or on a flat trend", () => {
    expect(entrySignal(breakout({ rsi: FUND_RULES.overboughtRsi }))).toBeNull();
    expect(entrySignal(breakout({ price: 100 * (1 + FUND_RULES.stretchedAbove50) + 1, high: 110 }))).toBeNull();
    expect(entrySignal(breakout({ strength: FUND_RULES.breakoutMinStrength - 0.01 }))).toBeNull();
    expect(entrySignal(breakout({ strengthShort: -0.01 }))).toBeNull();
    expect(entrySignal(breakout({ sma50Prev: 101 }))).toBeNull();
    expect(entrySignal(breakout({ price: 109 }))).toBeNull();
  });

  it("does not buy a breakout it would sell into the next day", () => {
    // Every breakout it buys is under the overbought and stretched lines
    // the sell rules use, so a buy is never followed by take-half on the
    // same prices.
    const r = breakout();
    expect(entrySignal(r)).not.toBeNull();
    const orders = planTrades({ cash: 0, parkedShares: 200, positions: [pos({ entryPrice: r.price, peak: r.price })], reads: { LEAD: r }, bench: benchUp });
    expect(orders.filter((o) => o.ticker === "LEAD")).toHaveLength(0);
  });

  it("reads the three-month high from the closes before today", () => {
    const bench = Array.from({ length: 300 }, (_, i) => 100 + i * 0.05);
    const closes = Array.from({ length: 300 }, (_, i) => 50 + i * 0.3);
    closes[290] = 200; // a spike inside the window
    const r = readTicker("X", closes, bench)!;
    expect(r.high).toBe(200);
    expect(r.price).toBe(closes[299]);
  });
});

describe("Upside Fund lets go of what the market has moved past", () => {
  it("sells a month-old holding that has fallen well behind the S&P 500", () => {
    const behind = read({ price: 98, rsi: 45, rsiPrev: 44, strengthShort: FUND_RULES.laggingBehind - 0.02 });
    const orders = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.laggingAfter })], reads: { LEAD: behind }, bench: benchUp });
    expect(orders[0]).toMatchObject({ rule: "lagging", side: "sell", shares: 100 });
    expect(orders[0]!.why).toMatch(/behind the S&P 500 over three months/);
  });

  it("gives a new holding its month, and leaves a big winner to its trailing stop", () => {
    const behind = read({ price: 98, rsi: 45, rsiPrev: 44, strengthShort: -0.3 });
    const young = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: FUND_RULES.laggingAfter - 1 })], reads: { LEAD: behind }, bench: benchUp });
    expect(young.find((o) => o.rule === "lagging")).toBeUndefined();
    const winner = read({ price: 130, rsi: 50, rsiPrev: 49, sma50: 125, strengthShort: -0.3 });
    const ran = planTrades({ cash: 0, parkedShares: 0, positions: [pos({ daysHeld: 40, peak: 131 })], reads: { LEAD: winner }, bench: benchUp });
    expect(ran.find((o) => o.rule === "lagging")).toBeUndefined();
  });

  it("sells a holding off its list whole, never trims it as an oversized company", () => {
    // The QQQ left over from the Nasdaq 100 run was 100% of the fund on
    // 2026-09-28 and was sold down to a tenth and kept, with a stop on it.
    const qqq = read({ ticker: "QQQ", price: 736.53, sma50: 720, sma200: 650, rsi: 55, rsiPrev: 54 });
    const orders = planTrades({
      cash: 0,
      parkedShares: 0,
      positions: [pos({ ticker: "QQQ", shares: 134.25, entryPrice: 744.5, peak: 744.5, daysHeld: 1 })],
      reads: { QQQ: qqq },
      bench: benchUp,
      universe: new Set(["LEAD"]),
    });
    expect(orders[0]).toMatchObject({ ticker: "QQQ", rule: "off-list", shares: 134.25 });
    expect(orders.find((o) => o.rule === "oversize")).toBeUndefined();
  });
});

describe("a run writes every missed day, from where the Fund started", () => {
  const between = (a: string, b: string) => tradingDaysBetween(a, b);

  it("starts a fresh Fund on its inception day rather than today", () => {
    expect(
      fundDaysToRun({ lastReportDate: null, inceptionDate: "2026-09-28", latestSession: "2026-10-01", between })
    ).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
  });

  it("starts on the last session when the Fund was created after it", () => {
    expect(
      fundDaysToRun({ lastReportDate: null, inceptionDate: "2026-10-03", latestSession: "2026-10-02", between })
    ).toEqual(["2026-10-02"]);
  });

  it("drains the whole backlog, and skips a day the benchmark did not close", () => {
    expect(
      fundDaysToRun({
        lastReportDate: "2026-09-25",
        inceptionDate: "2026-09-25",
        latestSession: "2026-10-01",
        between,
        benchDates: ["2026-09-25", "2026-09-28", "2026-09-30", "2026-10-01"],
      })
    ).toEqual(["2026-09-28", "2026-09-30", "2026-10-01"]);
  });
});

describe("the race starts on the benchmark's own close", () => {
  const spy = { dates: ["2026-09-25", "2026-09-28"], closes: [771.35, 765.61] };

  it("catches a start line written in another fund's units", () => {
    // QQQ's close, written as SPY's, on 2026-09-25.
    const off = startLineOff({ firstReportDate: "2026-09-25", firstReportPrice: 744.5, benchSeries: spy });
    expect(off).not.toBeNull();
    expect(off!).toBeCloseTo(744.5 / 771.35 - 1, 6);
  });

  it("says nothing when the start line is the benchmark's close", () => {
    expect(startLineOff({ firstReportDate: "2026-09-25", firstReportPrice: 771.35, benchSeries: spy })).toBeNull();
    expect(startLineOff({ firstReportDate: null, firstReportPrice: null, benchSeries: spy })).toBeNull();
  });
});

describe("a close the feed has not filed yet", () => {
  it("takes the quote's price once it is stamped at the bell, on a day after the last bar", () => {
    const s = { dates: ["2026-10-01"], closes: [763.99] };
    withSettledClose(s, { regularMarketPrice: 769.64, regularMarketTime: new Date("2026-10-02T20:00:00Z") });
    expect(s).toEqual({ dates: ["2026-10-01", "2026-10-02"], closes: [763.99, 769.64] });
  });

  it("leaves a live print, or a day already filed, alone", () => {
    const s = { dates: ["2026-10-01"], closes: [763.99] };
    withSettledClose(s, { regularMarketPrice: 768, regularMarketTime: new Date("2026-10-02T17:00:00Z") });
    withSettledClose(s, { regularMarketPrice: 764, regularMarketTime: new Date("2026-10-01T20:00:00Z") });
    expect(s.dates).toEqual(["2026-10-01"]);
  });
});

describe("the holdings and the total add up", () => {
  it("splits the return into what is held and what was taken, and the two make the total", () => {
    // The 2026-10-03 book: three open holdings up $352 between them, under
    // a Fund down $1,139.
    const holdings = [
      { ticker: "UNH", shares: 26.1574, cost_basis: 377.83 },
      { ticker: "SPY", shares: 103.2118, cost_basis: 765.61 },
      { ticker: "QQQ", shares: 13.4251, cost_basis: 744.5 },
    ];
    const quotes = { UNH: { price: 371.9 }, SPY: { price: 769.86 }, QQQ: { price: 749.56 } };
    const split = fundReturnSplit({ totalDollar: -1139, holdings, quotes })!;
    expect(split.open).toBeGreaterThan(300);
    expect(split.open + split.taken).toBeCloseTo(-1139, 2);
    expect(fundReturnSplit({ totalDollar: null, holdings, quotes })).toBeNull();
  });
});

describe("the watchlist says what each name is waiting for", () => {
  it("names a close above the three-month high when that is the nearer way in", () => {
    const near = read({ ticker: "NEAR", price: 108, high: 110, sma50: 100, sma200: 85, rsi: 66, rsiPrev: 64, rsiLow: 60 });
    const list = watchlistFrom({ NEAR: near }, new Set());
    expect(list[0]!.waitFor).toMatch(/A close above \$110\.00/);
  });

  it("names the turn up, not a dip, when it has already dipped", () => {
    const dipped = read({ ticker: "DIP", price: 90, high: 110, sma50: 95, sma200: 80, rsi: 39, rsiPrev: 41, rsiLow: 37 });
    const list = watchlistFrom({ DIP: dipped }, new Set());
    expect(list[0]!.waitFor).toMatch(/A higher close to turn up from its dip/);
  });

  it("names the dip when the high is far away", () => {
    const far = read({ ticker: "FAR", price: 90, high: 110, sma50: 95, sma200: 80, rsi: 46, rsiPrev: 47, rsiLow: 44 });
    const list = watchlistFrom({ FAR: far }, new Set());
    expect(list[0]!.waitFor).toMatch(/A pullback to an RSI of 40/);
  });
});
