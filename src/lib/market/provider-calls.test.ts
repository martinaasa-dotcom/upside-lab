/**
 * What one origin hit actually costs the provider, counted rather than
 * assumed.
 *
 * Two things used to be paid on every hit that change far more slowly than
 * a price does. The currency pairs were re-quoted every time, ten calls the
 * ticker wave then waited on before it started; and every ticker carried a
 * ninety day chart beside its quote, a series that gains one bar a day.
 * Counted through a mocked provider for one, five and fifteen names, a
 * repeat hit a moment later went from 12, 20 and 40 calls to 1, 5 and 15.
 *
 * None of this is a cache of prices for the reader. Every hit still asks
 * for every quote, and how stale a price may be stays the quote store's
 * business.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dateKeyInTz } from "@/lib/timezone";

const DAY_MS = 86_400_000;

let fxQuoteCalls = 0;
let tickerQuoteCalls = 0;
let chartCalls = 0;
let summaryCalls = 0;

/** What the fake provider is currently printing for every name. */
let livePrice = 100;
/** How far back the newest bar in the fake chart sits, in whole days. */
let newestBarDaysAgo = 0;

vi.mock("yahoo-finance2", () => ({
  default: class {
    async quote(symbol: string) {
      if (symbol.endsWith("=X")) {
        fxQuoteCalls++;
        return { symbol, regularMarketPrice: 1.08 };
      }
      tickerQuoteCalls++;
      return {
        symbol,
        regularMarketPrice: livePrice,
        regularMarketPreviousClose: 99,
        regularMarketOpen: 99.5,
        marketState: "REGULAR",
        currency: "USD",
      };
    }
    async chart() {
      chartCalls++;
      const newest = Date.now() - newestBarDaysAgo * DAY_MS;
      return {
        meta: { currency: "USD" },
        quotes: Array.from({ length: 10 }, (_, i) => ({
          date: new Date(newest - (9 - i) * DAY_MS),
          close: 90 + i,
        })),
      };
    }
    async quoteSummary() {
      summaryCalls++;
      return {};
    }
    async search() {
      return { news: [] };
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServer: () => null,
  supabaseUsesServiceRole: () => false,
}));

/** The events route reads the hour-cached pulse context, never Yahoo again. */
const pulseContexts = vi.fn(async (tickers: string[]) =>
  Object.fromEntries(
    tickers.map((ticker) => [
      ticker,
      {
        ticker,
        sector: null,
        lastEarningsDate: null,
        daysSinceLastEarnings: null,
        nextEarningsDate: dateKeyInTz(new Date(Date.now() + 5 * DAY_MS)),
        daysUntilNextEarnings: 5,
        lastSurprisePct: null,
        lastEpsActual: null,
        lastEpsEstimate: null,
        news: [],
      },
    ])
  )
);
vi.mock("@/lib/market/ticker-context", () => ({
  fetchPulseContexts: (tickers: string[]) => pulseContexts(tickers),
}));

const {
  fetchMarketEvents,
  fetchQuotesYahoo,
  resetYahooMemosForTests,
  resolveYahooListedSymbol,
} = await import("@/lib/market/yahoo");

/** Real US names, so every one resolves on its first candidate. */
const POOL = [
  "NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "AVGO",
  "VST", "RKLB", "CRWV", "NBIS", "BMNR", "RDDT", "SPY",
];

function names(n: number): string[] {
  return POOL.slice(0, n);
}

function total(): number {
  return fxQuoteCalls + tickerQuoteCalls + chartCalls;
}

function resetCounts() {
  fxQuoteCalls = 0;
  tickerQuoteCalls = 0;
  chartCalls = 0;
  summaryCalls = 0;
}

/** A clock the memos read, so a minute can pass without one going by. */
let now = Date.now();

beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  resetCounts();
  livePrice = 100;
  newestBarDaysAgo = 0;
  resetYahooMemosForTests();
  pulseContexts.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provider calls per origin hit", () => {
  // Cold is unchanged on purpose: the saving is the repeat, which is what
  // a polling reader actually does.
  const expected = [
    { n: 1, cold: 12, warm: 1 },
    { n: 5, cold: 20, warm: 5 },
    { n: 15, cold: 40, warm: 15 },
  ];

  for (const row of expected) {
    it(`${row.n} name(s): ${row.cold} calls cold, ${row.warm} again a moment later`, async () => {
      await fetchQuotesYahoo(names(row.n));
      expect(total()).toBe(row.cold);
      expect(fxQuoteCalls).toBe(10);
      expect(chartCalls).toBe(row.n);

      resetCounts();
      now += 5_000;
      await fetchQuotesYahoo(names(row.n));
      expect(total()).toBe(row.warm);
      expect(fxQuoteCalls).toBe(0);
      expect(chartCalls).toBe(0);
      expect(tickerQuoteCalls).toBe(row.n);
    });
  }
});

describe("the currency rates", () => {
  it("are asked for once a minute, not once a hit", async () => {
    await fetchQuotesYahoo(["NVDA"]);
    expect(fxQuoteCalls).toBe(10);
    resetCounts();

    now += 45_000;
    await fetchQuotesYahoo(["NVDA"]);
    expect(fxQuoteCalls).toBe(0);

    now += 20_000;
    await fetchQuotesYahoo(["NVDA"]);
    expect(fxQuoteCalls).toBe(10);
  });

  it("still reach the caller from the memo", async () => {
    const first = await fetchQuotesYahoo(["NVDA"]);
    now += 5_000;
    const second = await fetchQuotesYahoo(["NVDA"]);
    expect(second.fx.eurUsd).toBe(first.fx.eurUsd);
    expect(second.fx.eurUsd).toBe(1.08);
  });
});

describe("the ninety day series", () => {
  it("ends on the price that came back with it", async () => {
    livePrice = 123;
    const { quotes } = await fetchQuotesYahoo(["NVDA"]);
    const spark = quotes.NVDA.sparkline;
    // The newest bar is today's, so the quote is the truer close for it.
    expect(spark[spark.length - 1]).toBe(123);
    expect(spark).toHaveLength(10);
  });

  it("takes the fresh price on a reused series too", async () => {
    await fetchQuotesYahoo(["NVDA"]);
    resetCounts();
    now += 5_000;
    livePrice = 141;
    const { quotes } = await fetchQuotesYahoo(["NVDA"]);
    expect(chartCalls).toBe(0);
    const spark = quotes.NVDA.sparkline;
    expect(spark[spark.length - 1]).toBe(141);
    const closes = quotes.NVDA.dailyCloses ?? [];
    expect(closes[closes.length - 1].close).toBe(141);
  });

  it("leaves a bar that is not today's alone", async () => {
    // Nothing has printed yet, so the newest bar is yesterday's close and
    // the quote is not a closing price for it.
    newestBarDaysAgo = 1;
    livePrice = 123;
    const { quotes } = await fetchQuotesYahoo(["NVDA"]);
    const spark = quotes.NVDA.sparkline;
    expect(spark[spark.length - 1]).toBe(99);
  });

  it("is asked for again once the day has moved on", async () => {
    await fetchQuotesYahoo(["NVDA"]);
    resetCounts();
    now += 11 * 60_000;
    await fetchQuotesYahoo(["NVDA"]);
    expect(chartCalls).toBe(1);
  });
});

describe("the listed symbol", () => {
  it("is walked once a day, not once a caller", async () => {
    expect(await resolveYahooListedSymbol("NVDA")).toBe("NVDA");
    expect(tickerQuoteCalls).toBe(1);
    resetCounts();

    expect(await resolveYahooListedSymbol("NVDA")).toBe("NVDA");
    now += 6 * 60 * 60 * 1000;
    expect(await resolveYahooListedSymbol("NVDA")).toBe("NVDA");
    expect(tickerQuoteCalls).toBe(0);

    now += 19 * 60 * 60 * 1000;
    expect(await resolveYahooListedSymbol("NVDA")).toBe("NVDA");
    expect(tickerQuoteCalls).toBe(1);
  });

  it("shares one walk between callers asking at once", async () => {
    const answers = await Promise.all([
      resolveYahooListedSymbol("NVDA"),
      resolveYahooListedSymbol("NVDA"),
      resolveYahooListedSymbol("NVDA"),
    ]);
    expect(answers).toEqual(["NVDA", "NVDA", "NVDA"]);
    expect(tickerQuoteCalls).toBe(1);
  });
});

describe("market events", () => {
  it("read the next earnings date from the pulse context", async () => {
    const events = await fetchMarketEvents(["NVDA"]);
    expect(pulseContexts).toHaveBeenCalledWith(["NVDA"]);
    // No listing walk and no summary call of its own: the hour-cached
    // context already knows.
    expect(summaryCalls).toBe(0);
    expect(tickerQuoteCalls).toBe(0);
    expect(events.earnings).toHaveLength(1);
    expect(events.earnings[0].days).toBe(5);
    expect(events.catalysts.some((c) => c.kind === "earnings")).toBe(true);
  });

  it("never asks about a coin, which has no earnings to have", async () => {
    // A stored coin is BTC-USD; bare BTC is the Grayscale trust and is a
    // company like any other here.
    await fetchMarketEvents(["BTC-USD"]);
    expect(pulseContexts).not.toHaveBeenCalled();
  });
});
