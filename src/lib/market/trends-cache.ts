/**
 * Weekly trend reads, shared across every user.
 *
 * The numbers are the same for $NBIS no matter who asked. An in-memory
 * Map covers this serverless instance. `unstable_cache` is the copy that
 * the next person (and the next cold start) actually gets.
 */

import { yahooQuoteCandidates } from "@/lib/ticker";
import { unstable_cache } from "next/cache";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { yahooCall } from "@/lib/market/yahoo";
import {
  macd,
  nWeekChange,
  relativeStrength,
  rsi,
  rsiDivergence,
  toWeekly,
  trendRegime,
  type Bar,
  type TrendRegime,
} from "@/lib/market/indicators";

export type TrendRow = {
  ticker: string;
  regime: TrendRegime;
  aboveLongMa: boolean | null;
  rsi: number | null;
  macdHistogram: number | null;
  macdBuilding: boolean | null;
  divergence: {
    kind: "bearish" | "bullish";
    weeksAgo: number;
    priceFrom: number;
    priceTo: number;
    rsiFrom: number;
    rsiTo: number;
  } | null;
  rs13: number | null;
  rs26: number | null;
  /** Raw price change over the last 2 / 4 weekly closes — fast enough to
   * catch a post-earnings re-rate before the slow trend/momentum reads
   * below catch up to it. */
  chg2w: number | null;
  chg4w: number | null;
  lastClose: number | null;
  longMa: number | null;
  vsLongMaPct: number | null;
  longSlopePct: number | null;
  macdHistogramPrev: number | null;
};

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;
let yahooInstance: YahooFinanceInstance | null = null;
async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahooInstance) return yahooInstance;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahooInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahooInstance;
}

export const BENCHMARK = "SPY";
const YEARS_BACK = 4;
export const MAX_TICKERS = 14;

// Cache timings
const FRESH_TTL_MS = 10 * 60 * 1000; // 10 minutes fresh
const STALE_TTL_MS = 60 * 60 * 1000; // 60 minutes stale-while-revalidate
const MAX_CACHE_SIZE = 250;

type CachedCloses = {
  closes: number[];
  cachedAt: number;
};

type CachedTrendRow = {
  row: TrendRow;
  cachedAt: number;
};

const CLOSES_CACHE = new Map<string, CachedCloses>();
const ROW_CACHE = new Map<string, CachedTrendRow>();
const IN_FLIGHT_CLOSES = new Map<string, Promise<number[] | null>>();

function pruneCacheIfNeeded() {
  if (CLOSES_CACHE.size > MAX_CACHE_SIZE) {
    const sorted = [...CLOSES_CACHE.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < 50; i++) {
      if (sorted[i]) {
        CLOSES_CACHE.delete(sorted[i][0]);
        ROW_CACHE.delete(sorted[i][0]);
      }
    }
  }
}

async function fetchWeeklyClosesUncached(
  ticker: string
): Promise<number[] | null> {
  if (isMarketCircuitOpen("yahoo")) return null;
  try {
    const yf = await getYahoo();
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - YEARS_BACK);
    for (const symbol of yahooQuoteCandidates(ticker)) {
      try {
        const chart = await yahooCall(() =>
          yf.chart(symbol, {
            period1,
            interval: "1d",
          })
        );
        const bars: Bar[] = [];
        for (const row of chart.quotes ?? []) {
          const raw = row.date as Date | string | undefined;
          const close = typeof row.close === "number" ? row.close : null;
          if (!raw || close == null || !Number.isFinite(close)) continue;
          const date =
            raw instanceof Date
              ? raw.toISOString().slice(0, 10)
              : String(raw).slice(0, 10);
          bars.push({ date, close });
        }
        if (bars.length < 60) continue;
        return toWeekly(bars).map((b) => b.close);
      } catch {
        /* try the next exchange */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Shared across every signed-in user. Weekly bars are the same for $NBIS
 * whether Martin or a classmate asked. The in-memory Map above is only
 * this instance; this is the copy that survives a cold start. */
const getWeeklyClosesShared = unstable_cache(
  async (ticker: string) => fetchWeeklyClosesUncached(ticker),
  ["trends-weekly-closes-v1"],
  { revalidate: 30 * 60 }
);

export async function getWeeklyCloses(
  ticker: string,
  opts?: { force?: boolean }
): Promise<number[] | null> {
  const symbol = ticker.toUpperCase();
  const now = Date.now();
  const cached = CLOSES_CACHE.get(symbol);

  // Return fresh cache immediately
  if (!opts?.force && cached && now - cached.cachedAt < FRESH_TTL_MS) {
    return cached.closes;
  }

  // If in-flight, reuse promise to deduplicate concurrent requests
  const inFlight = IN_FLIGHT_CLOSES.get(symbol);
  if (inFlight) {
    return inFlight;
  }

  // If stale, return stale immediately and revalidate in background
  if (!opts?.force && cached && now - cached.cachedAt < STALE_TTL_MS) {
    const backgroundPromise = getWeeklyClosesShared(symbol)
      .then((closes) => {
        if (closes && closes.length >= 30) {
          CLOSES_CACHE.set(symbol, { closes, cachedAt: Date.now() });
          pruneCacheIfNeeded();
        }
        return closes;
      })
      .finally(() => {
        IN_FLIGHT_CLOSES.delete(symbol);
      });
    IN_FLIGHT_CLOSES.set(symbol, backgroundPromise);
    return cached.closes;
  }

  const fetchPromise = (
    opts?.force
      ? fetchWeeklyClosesUncached(symbol)
      : getWeeklyClosesShared(symbol)
  )
    .then((closes) => {
      if (closes && closes.length >= 30) {
        CLOSES_CACHE.set(symbol, { closes, cachedAt: Date.now() });
        pruneCacheIfNeeded();
      }
      return closes;
    })
    .finally(() => {
      IN_FLIGHT_CLOSES.delete(symbol);
    });

  IN_FLIGHT_CLOSES.set(symbol, fetchPromise);
  return fetchPromise;
}

function rowFromCloses(
  ticker: string,
  closes: number[],
  bench: number[] | null
): TrendRow {
  const rsiSeries = rsi(closes, 14);
  const m = macd(closes);
  const regime = trendRegime(closes);
  const div = rsiDivergence(closes, rsiSeries, { window: 3, maxBarsAgo: 8 });
  const hist = m.histogram.at(-1) ?? null;
  const histPrev = m.histogram.at(-4) ?? null;

  return {
    ticker,
    regime: regime.regime,
    aboveLongMa: regime.aboveLong,
    rsi: rsiSeries.at(-1) ?? null,
    macdHistogram: hist,
    macdHistogramPrev: histPrev,
    macdBuilding: hist != null && histPrev != null ? hist > histPrev : null,
    divergence: div
      ? {
          kind: div.kind,
          weeksAgo: div.barsAgo,
          priceFrom: div.priceFrom,
          priceTo: div.priceTo,
          rsiFrom: div.rsiFrom,
          rsiTo: div.rsiTo,
        }
      : null,
    rs13: bench ? relativeStrength(closes, bench, 13) : null,
    rs26: bench ? relativeStrength(closes, bench, 26) : null,
    chg2w: nWeekChange(closes, 2),
    chg4w: nWeekChange(closes, 4),
    lastClose: closes.at(-1) ?? regime.price,
    longMa: regime.longMa,
    vsLongMaPct:
      regime.longMa != null &&
      regime.price != null &&
      regime.longMa > 0
        ? regime.price / regime.longMa - 1
        : null,
    longSlopePct: regime.longSlopePct,
  };
}

async function computeTrendRowUncached(ticker: string): Promise<TrendRow | null> {
  const symbol = ticker.toUpperCase();
  const [closes, bench] = await Promise.all([
    getWeeklyCloses(symbol),
    getWeeklyCloses(BENCHMARK),
  ]);
  if (!closes || closes.length < 30) return null;
  return rowFromCloses(symbol, closes, bench);
}

const getTrendRowShared = unstable_cache(
  async (ticker: string) => computeTrendRowUncached(ticker),
  ["trends-row-v1"],
  { revalidate: 30 * 60 }
);

async function getTrendRow(
  ticker: string,
  opts?: { force?: boolean }
): Promise<TrendRow | null> {
  const symbol = ticker.toUpperCase();
  const now = Date.now();
  const mem = ROW_CACHE.get(symbol);
  if (!opts?.force && mem && now - mem.cachedAt < FRESH_TTL_MS) {
    return mem.row;
  }
  const row = opts?.force
    ? await computeTrendRowUncached(symbol)
    : await getTrendRowShared(symbol);
  if (row) ROW_CACHE.set(symbol, { row, cachedAt: Date.now() });
  return row;
}

export async function fetchTrendsBatch(
  tickers: string[],
  opts?: { force?: boolean }
): Promise<{
  rows: TrendRow[];
  benchmark: string;
  cachedCount: number;
  freshCount: number;
  asOf: string;
}> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()))].slice(
    0,
    MAX_TICKERS
  );
  if (unique.length === 0) {
    return {
      rows: [],
      benchmark: BENCHMARK,
      cachedCount: 0,
      freshCount: 0,
      asOf: new Date().toISOString(),
    };
  }

  const now = Date.now();
  let cachedCount = 0;
  let freshCount = 0;
  for (const t of unique) {
    const rowEntry = ROW_CACHE.get(t);
    if (!opts?.force && rowEntry && now - rowEntry.cachedAt < FRESH_TTL_MS) {
      cachedCount++;
    } else {
      freshCount++;
    }
  }

  const settled = await Promise.all(
    unique.map((ticker) => getTrendRow(ticker, opts))
  );
  const rows = settled.filter((row): row is TrendRow => row != null);

  return {
    rows,
    benchmark: BENCHMARK,
    cachedCount,
    freshCount,
    asOf: new Date().toISOString(),
  };
}
