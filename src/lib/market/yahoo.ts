import type { Quote } from "@/lib/types";
import type { SplitEvent } from "@/lib/market/corporate-actions";
import { sessionMark } from "@/lib/market-session";
import { synthesizeSparkline } from "@/lib/market/sparkline";
import { yahooQuoteCandidates } from "@/lib/ticker";
import { resolveYahooEarnings } from "@/lib/market/earnings-dates";
import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import type { EarningsPrint } from "@/lib/earnings-brief";
import {
  extraFxCodes,
  listingAmountToUsd,
  listingCurrency,
  normalizeListedPrice,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import {
  CircuitOpenError,
  isMarketCircuitOpen,
  withMarketCircuit,
} from "@/lib/market/circuit-breaker";
import {
  isPlausiblePrice,
  yahooQuotePayloadSchema,
} from "@/lib/market/quote-sanitize";
import { mapWithConcurrency } from "@/lib/market/pool";

/**
 * How many names one batch resolves at once.
 *
 * A name Yahoo knows costs one candidate; a name it does not walks the
 * whole suffix list serially, so the expensive case is a miss. Starting
 * every name in the same tick meant a request for the 120 the route allows
 * opened 120 chains before any of them had reported, which is both a burst
 * the provider sees as one client and a window where the breaker cannot
 * help. 48 is above any real book, so a reader's own holdings still resolve
 * in one wave and nothing about normal latency changes; past that the
 * waves give the breaker somewhere to open.
 */
const MAX_IN_FLIGHT = 48;

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

export async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

function hashTicker(ticker: string): number {
  let h = 0;
  for (let i = 0; i < ticker.length; i++) h = (h * 31 + ticker.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type FxRates = {
  /** USD per 1 EUR — preferred conversion rate (last → prev close → open) */
  eurUsd: number | null;
  /** EURUSD regular session open */
  eurUsdOpen: number | null;
  /** EURUSD previous close */
  eurUsdPreviousClose: number | null;
  /** EURUSD last / regular market price */
  eurUsdLast: number | null;
  /** USD per 1 GBP */
  gbpUsd: number | null;
  /** USD per 1 unit, keyed by ISO code (SEK, NOK, DKK, …) */
  usdPer: Record<string, number>;
};

export type QuotesResult = {
  quotes: Record<string, Quote>;
  fx: FxRates;
  /** True when Yahoo failed for some/all tickers and seed fallbacks were used */
  delayed: boolean;
};

/** Raw Yahoo attempt — reports which tickers failed instead of silently
 * papering over them, so a caller can try another provider before falling
 * back to a last-known cached price on the client. */
export type YahooQuotesAttempt = {
  quotes: Record<string, Quote>;
  fx: FxRates;
  /** Tickers Yahoo could not price at all. */
  failed: string[];
};

const EMPTY_FX: FxRates = {
  eurUsd: null,
  eurUsdOpen: null,
  eurUsdPreviousClose: null,
  eurUsdLast: null,
  gbpUsd: null,
  usdPer: {},
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function yahooCall<T>(fn: () => Promise<T>): Promise<T> {
  return withMarketCircuit("yahoo", fn);
}

async function usdPerUnit(
  yf: YahooFinanceInstance,
  code: string
): Promise<number | null> {
  try {
    const direct = await yahooCall(() => yf.quote(`${code}USD=X`));
    const n = numOrNull(direct.regularMarketPrice);
    if (n) return n;
  } catch {
    /* try the inverted pair */
  }
  try {
    const inverted = await yahooCall(() => yf.quote(`USD${code}=X`));
    const n = numOrNull(inverted.regularMarketPrice);
    if (n && n > 0) return 1 / n;
  } catch {
    /* no rate */
  }
  return null;
}

async function fetchFxRates(yf: YahooFinanceInstance): Promise<FxRates> {
  try {
    const extras = extraFxCodes();
    const [eur, gbp, extraRates] = await Promise.all([
      yahooCall(() => yf.quote("EURUSD=X")),
      yahooCall(() => yf.quote("GBPUSD=X")),
      Promise.all(extras.map((code) => usdPerUnit(yf, code))),
    ]);
    const last = numOrNull(eur.regularMarketPrice);
    const open = numOrNull(eur.regularMarketOpen);
    const previousClose = numOrNull(eur.regularMarketPreviousClose);
    const eurUsd = last ?? previousClose ?? open;
    const usdPer: Record<string, number> = {};
    extras.forEach((code, i) => {
      const rate = extraRates[i];
      if (typeof rate === "number" && rate > 0) usdPer[code] = rate;
    });
    return {
      eurUsd,
      eurUsdOpen: open,
      eurUsdPreviousClose: previousClose,
      eurUsdLast: last,
      gbpUsd: numOrNull(gbp.regularMarketPrice),
      usdPer,
    };
  } catch (err) {
    console.error("FX quote failed", err);
    return { ...EMPTY_FX, usdPer: {} };
  }
}

/** Fetch EURUSD/GBPUSD only (for Compound / empty books). */
export async function fetchFxOnly(): Promise<FxRates> {
  if (isMarketCircuitOpen("yahoo")) {
    return { ...EMPTY_FX };
  }
  try {
    const yf = await getYahoo();
    return await fetchFxRates(yf);
  } catch (err) {
    console.error("FX-only fetch failed", err);
    return { ...EMPTY_FX };
  }
}

/** Convert a Yahoo native price into USD (book of record is always USD). */
function priceToUsd(
  price: number,
  currency: string | undefined,
  fx: FxRates,
  symbol?: string
): number {
  const { amount, code } = normalizeListedPrice(price, currency);
  // FX pairs are the rate. Rounding them to cents freezes EURUSD at 1.16.
  if (symbol?.endsWith("=X") && code === "USD") return amount;
  return listingAmountToUsd(amount, code, usdPerMapFromFx(fx));
}

function scaleMoney(
  value: number | null,
  nativePrice: number,
  usdPrice: number
): number | null {
  if (value == null || nativePrice <= 0) return value;
  return value * (usdPrice / nativePrice);
}

/** First Yahoo listing that actually quotes. Xetra before London. */
export async function resolveYahooListedSymbol(
  raw: string
): Promise<string | null> {
  const yf = await getYahoo();
  for (const symbol of yahooQuoteCandidates(raw)) {
    try {
      const quote = await yahooCall(() => yf.quote(symbol));
      if (
        numOrNull(quote.regularMarketPrice) ||
        numOrNull(quote.postMarketPrice) ||
        numOrNull(quote.preMarketPrice)
      ) {
        return symbol;
      }
    } catch {
      /* try the next exchange */
    }
  }
  return null;
}

/**
 * Splits out of a chart response, in either shape the wrapper returns.
 *
 * `yahoo-finance2` is an unofficial wrapper over an undocumented endpoint,
 * so `events.splits` arrives as a keyed object on one response and an array
 * on another, and either can hold a row with a missing field. Everything
 * that is not a usable split is dropped rather than reasoned about: a
 * wrong split silently rewrites somebody's cost basis.
 */
function readSplitEvents(raw: unknown): SplitEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const rows = Array.isArray(raw) ? raw : Object.values(raw);
  const out: SplitEvent[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rec = row as {
      date?: unknown;
      numerator?: unknown;
      denominator?: unknown;
    };
    const numerator = typeof rec.numerator === "number" ? rec.numerator : NaN;
    const denominator =
      typeof rec.denominator === "number" ? rec.denominator : NaN;
    if (!(numerator > 0) || !(denominator > 0)) continue;
    const rawDate = rec.date;
    const when =
      rawDate instanceof Date
        ? rawDate
        : typeof rawDate === "number"
          ? new Date(rawDate < 1e12 ? rawDate * 1000 : rawDate)
          : typeof rawDate === "string"
            ? new Date(rawDate)
            : null;
    if (!when || Number.isNaN(when.getTime())) continue;
    out.push({
      date: dateKeyInTz(when, "America/New_York"),
      numerator,
      denominator,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function quoteOneSymbol(
  yf: YahooFinanceInstance,
  symbol: string,
  fx: FxRates,
  period1: Date
): Promise<Quote | null> {
  const [quoteRaw, chart] = await Promise.all([
    yahooCall(() => yf.quote(symbol)),
    yf
      // `events: "split"` costs nothing extra: this is the same chart call
      // the sparkline already needs, and without it a split is invisible to
      // the app while being fully priced in by the feed.
      .chart(symbol, { period1, interval: "1d", events: "split" })
      .catch(() => null),
  ]);
  const parsed = yahooQuotePayloadSchema.safeParse(quoteRaw);
  if (!parsed.success) return null;
  const quote = parsed.data;

  // regularMarketPrice is the last REGULAR-session trade and does
  // NOT move during extended hours — it holds yesterday's (or this
  // morning's pre-open) close, stale, right through an active
  // pre/post-market session. During those specific windows,
  // pre/postMarketPrice are the genuinely current numbers and have
  // to be what "the price" means everywhere in the app, not just a
  // fallback for when regularMarketPrice happens to be missing.
  const state = (
    typeof quote.marketState === "string" ? quote.marketState : ""
  ).toUpperCase();
  const rawRegular = numOrNull(quote.regularMarketPrice);
  const rawPost = numOrNull(quote.postMarketPrice);
  const rawPre = numOrNull(quote.preMarketPrice);
  const rawPreviousClose =
    numOrNull(quote.regularMarketPreviousClose) ??
    (rawRegular != null && typeof quote.regularMarketChange === "number"
      ? rawRegular - quote.regularMarketChange
      : null);

  const mark = sessionMark({
    marketState: state,
    regularPrice: rawRegular,
    postPrice: rawPost,
    prePrice: rawPre,
    previousClose: rawPreviousClose,
  });
  const yahooNative = mark.price;
  if (!isPlausiblePrice(yahooNative)) return null;
  const yahooCurrency =
    typeof quote.currency === "string" ? quote.currency : undefined;
  const listed = normalizeListedPrice(yahooNative, yahooCurrency);
  const currency = listingCurrency(symbol, listed.code);
  const nativePrice = listed.amount;
  const price = priceToUsd(yahooNative, yahooCurrency, fx, symbol);
  const previousClose = priceToUsd(mark.previousClose, yahooCurrency, fx, symbol);
  // Derived directly from (current price vs yesterday's close)
  // instead of reusing Yahoo's own change fields — regularMarket*
  // and postMarket* changes are relative to two DIFFERENT baselines
  // (previous close vs. the regular close), so summing them isn't
  // valid; recomputing from scratch is correct in every session.
  const change = previousClose > 0 ? price - previousClose : 0;
  const changePercent = previousClose > 0 ? change / previousClose : 0;
  const sparkline =
    chart?.quotes && chart.quotes.length > 1
      ? chart.quotes
          .map((row) => row.close)
          .filter((c): c is number => typeof c === "number" && isPlausiblePrice(c))
          .map((c) => priceToUsd(c, yahooCurrency, fx, symbol))
      : synthesizeSparkline(price, changePercent * 100);
  const splits = readSplitEvents(chart?.events?.splits);

  const dailyCloses = (chart?.quotes ?? [])
    .map((row) => {
      const close = row.close;
      const rawDate = row.date;
      if (typeof close !== "number" || !rawDate) return null;
      const when =
        rawDate instanceof Date
          ? rawDate
          : new Date(
              typeof rawDate === "number" && rawDate < 1e12
                ? rawDate * 1000
                : rawDate
            );
      if (Number.isNaN(when.getTime())) return null;
      return {
        date: dateKeyInTz(when, "America/New_York"),
        close: priceToUsd(close, yahooCurrency, fx, symbol),
      };
    })
    .filter((b): b is { date: string; close: number } => b != null)
    .slice(-15);

  const preMarketPrice = scaleMoney(
    typeof quote.preMarketPrice === "number" ? quote.preMarketPrice : null,
    yahooNative,
    price
  );
  const preMarketChange = scaleMoney(
    typeof quote.preMarketChange === "number" ? quote.preMarketChange : null,
    yahooNative,
    price
  );
  const preMarketChangePercent =
    typeof quote.preMarketChangePercent === "number"
      ? quote.preMarketChangePercent / 100
      : null;
  const postMarketPrice = scaleMoney(
    typeof quote.postMarketPrice === "number" ? quote.postMarketPrice : null,
    yahooNative,
    price
  );
  const postMarketChange = scaleMoney(
    typeof quote.postMarketChange === "number" ? quote.postMarketChange : null,
    yahooNative,
    price
  );
  const postMarketChangePercent =
    typeof quote.postMarketChangePercent === "number"
      ? quote.postMarketChangePercent / 100
      : null;
  const marketState =
    typeof quote.marketState === "string" ? quote.marketState : null;

  return {
    ticker: symbol,
    price,
    change,
    changePercent,
    previousClose,
    sparkline,
    marketState,
    preMarketPrice,
    preMarketChange,
    preMarketChangePercent,
    postMarketPrice,
    postMarketChange,
    postMarketChangePercent,
    dailyCloses,
    currency,
    nativePrice,
    stale: false,
    quotedAt: Date.now(),
    ...(splits.length > 0 ? { splits } : {}),
  } satisfies Quote;
}

/** Yahoo-only attempt — no synthetic fallback merged in. */
type QuoteHit = { requested: string; symbol: string; quote: Quote };

/**
 * Concurrent requests for the same ticker inside one warm instance share a
 * single upstream call. `/api/quotes` is CDN-cached per ticker-set, which
 * dedupes one person polling — but two people whose portfolios merely
 * overlap on a popular name have different ticker sets, so their requests
 * miss that cache and each used to fetch the same symbol separately.
 *
 * A joiner rides the first caller's `fx` and `period1`, which is fine:
 * the promise only lives for the length of one in-flight fetch. Same shape
 * as `ytdCloseInFlight` below.
 */
const quoteInFlight = new Map<string, Promise<QuoteHit | null>>();

export async function fetchQuotesYahoo(
  tickers: string[]
): Promise<YahooQuotesAttempt> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) {
    return { quotes: {}, fx: { ...EMPTY_FX }, failed: [] };
  }

  if (isMarketCircuitOpen("yahoo")) {
    return { quotes: {}, fx: { ...EMPTY_FX }, failed: unique };
  }

  try {
    const yf = await getYahoo();
    const fx = await fetchFxRates(yf);
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const resolveOne = async (requested: string): Promise<QuoteHit | null> => {
      if (isMarketCircuitOpen("yahoo")) return null;
      for (const symbol of yahooQuoteCandidates(requested)) {
        try {
          const quote = await quoteOneSymbol(yf, symbol, fx, period1);
          // A stub with price 0 is not a hit. Keep walking suffixes
          // (LHV1T is empty; LHV1T.TL is the Tallinn listing).
          if (quote && quote.price > 0) return { requested, symbol, quote };
        } catch (err) {
          if (err instanceof CircuitOpenError) return null;
          /* try the next exchange */
        }
      }
      console.error(`Quote failed for ${requested}`);
      return null;
    };

    const results = await mapWithConcurrency(
      unique,
      MAX_IN_FLIGHT,
      (requested) => {
        const pending = quoteInFlight.get(requested);
        if (pending) return pending;
        const started = resolveOne(requested).finally(() => {
          quoteInFlight.delete(requested);
        });
        quoteInFlight.set(requested, started);
        return started;
      }
    );

    const map: Record<string, Quote> = {};
    for (const row of results) {
      if (!row) continue;
      map[row.requested] = { ...row.quote, ticker: row.requested };
      if (row.symbol !== row.requested) {
        map[row.symbol] = { ...row.quote, ticker: row.symbol };
      }
    }

    const failed = unique.filter((ticker) => !map[ticker]);
    return { quotes: map, fx, failed };
  } catch (err) {
    console.error("yahoo-finance2 unavailable", err);
    return {
      quotes: {},
      fx: { ...EMPTY_FX },
      failed: unique,
    };
  }
}

export type DailyClose = { date: string; close: number };

const YTD_CLOSE_TTL_MS = 6 * 60 * 60 * 1000;
const ytdCloseCache = new Map<
  string,
  { year: number; at: number; rows: DailyClose[] }
>();
const ytdCloseInFlight = new Map<string, Promise<DailyClose[]>>();

function chartRowsToDailyCloses(
  quotes: Array<{ date?: Date | string | number | null; close?: number | null }>,
  currency: string | undefined,
  fx: FxRates
): DailyClose[] {
  return quotes
    .map((row) => {
      const close = row.close;
      const rawDate = row.date;
      if (typeof close !== "number" || !rawDate) return null;
      const when =
        rawDate instanceof Date
          ? rawDate
          : new Date(
              typeof rawDate === "number" && rawDate < 1e12
                ? rawDate * 1000
                : rawDate
            );
      if (Number.isNaN(when.getTime())) return null;
      return {
        date: dateKeyInTz(when, "America/New_York"),
        close: priceToUsd(close, currency, fx),
      };
    })
    .filter((b): b is DailyClose => b != null);
}

async function ytdClosesForSymbol(
  yf: YahooFinanceInstance,
  fx: FxRates,
  symbol: string,
  year: number,
  period1: Date
): Promise<DailyClose[]> {
  const cacheKey = `${year}:${symbol}`;
  const hit = ytdCloseCache.get(cacheKey);
  if (
    hit &&
    hit.year === year &&
    Date.now() - hit.at < YTD_CLOSE_TTL_MS &&
    hit.rows.length > 0
  ) {
    return hit.rows;
  }
  const pending = ytdCloseInFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    try {
      const chart = await yahooCall(() =>
        yf.chart(symbol, { period1, interval: "1d" })
      );
      const currency =
        typeof chart.meta?.currency === "string"
          ? chart.meta.currency
          : undefined;
      const rows = chartRowsToDailyCloses(chart.quotes ?? [], currency, fx);
      ytdCloseCache.set(cacheKey, { year, at: Date.now(), rows });
      return rows;
    } catch (err) {
      console.error(`YTD closes failed for ${symbol}`, err);
      return hit?.rows ?? [];
    } finally {
      ytdCloseInFlight.delete(cacheKey);
    }
  })();
  ytdCloseInFlight.set(cacheKey, task);
  return task;
}

/** Calendar-year daily closes in USD, cached a few hours so every sheet
 * that holds NBIS does not hit Yahoo again. */
export async function fetchYtdDailyCloses(
  tickers: string[]
): Promise<Record<string, DailyClose[]>> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim()).filter(Boolean)),
  ];
  if (unique.length === 0) return {};
  const year = new Date().getFullYear();
  const period1 = new Date(Date.UTC(year, 0, 1));
  try {
    const yf = await getYahoo();
    const fx = await fetchFxRates(yf);
    const out: Record<string, DailyClose[]> = {};
    await Promise.all(
      unique.map(async (ticker) => {
        const key = ticker.toUpperCase();
        for (const symbol of yahooQuoteCandidates(ticker)) {
          const rows = await ytdClosesForSymbol(yf, fx, symbol, year, period1);
          if (rows.length > 0) {
            out[key] = rows;
            return;
          }
        }
        out[key] = [];
      })
    );
    return out;
  } catch (err) {
    console.error("YTD close fetch unavailable", err);
    return {};
  }
}

export type WeekReturn = { start: number; end: number; pct: number };

/** Prior Friday close to the latest close. Sunday look uses this, not today's session. */
export async function fetchWeekReturns(
  tickers: string[]
): Promise<Record<string, WeekReturn>> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return {};
  const period1 = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000);
  try {
    const yf = await getYahoo();
    const fx = await fetchFxRates(yf);
    const out: Record<string, WeekReturn> = {};
    await Promise.all(
      unique.map(async (ticker) => {
        for (const symbol of yahooQuoteCandidates(ticker)) {
          try {
            const chart = await yahooCall(() =>
              yf.chart(symbol, { period1, interval: "1d" })
            );
            const currency =
              typeof chart.meta?.currency === "string"
                ? chart.meta.currency
                : undefined;
            const rows = chartRowsToDailyCloses(chart.quotes ?? [], currency, fx);
            if (rows.length < 2) continue;
            const end = rows[rows.length - 1];
            const start = rows.length >= 6 ? rows[rows.length - 6] : rows[0];
            if (start.close <= 0) continue;
            out[ticker] = {
              start: start.close,
              end: end.close,
              pct: (end.close - start.close) / start.close,
            };
            return;
          } catch {
            /* try the next exchange */
          }
        }
        console.error(`Week return failed for ${ticker}`);
      })
    );
    return out;
  } catch (err) {
    console.error("Week return fetch unavailable", err);
    return {};
  }
}

/** Synthetic placeholder prices — absolute last resort when every real
 * provider (Yahoo, and any configured fallback providers) failed. Not real
 * market data; callers should surface `delayed`/degraded state to the UI. */
export function fallbackQuotes(tickers: string[]): Record<string, Quote> {
  const seeds: Record<string, number> = {
    NBIS: 162.4,
    CRWV: 68.2,
    RKLB: 48.9,
    BMNR: 22.1,
    VST: 178.5,
    AAPL: 214.2,
    MSFT: 425.1,
  };

  const map: Record<string, Quote> = {};
  for (const ticker of tickers) {
    const price = seeds[ticker] ?? 100;
    const changePercent = ((hashTicker(ticker) % 20) - 10) / 1000;
    const change = price * changePercent;
    map[ticker] = {
      ticker,
      price,
      change,
      changePercent,
      previousClose: price - change,
      sparkline: synthesizeSparkline(price, changePercent * 100),
      marketState: null,
      preMarketPrice: null,
      preMarketChange: null,
      preMarketChangePercent: null,
      postMarketPrice: null,
      postMarketChange: null,
      postMarketChangePercent: null,
      currency: listingCurrency(ticker),
      nativePrice: price,
    };
  }
  return map;
}

export type EarningsEvent = {
  ticker: string;
  date: string;
  days: number;
  dateIsEstimate?: boolean;
  spot?: number | null;
  expectedMovePct?: number | null;
  expectedMoveSource?: "implied" | "history" | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  runupPct?: number | null;
  prints?: EarningsPrint[];
  beatCount?: number;
  note?: string;
};

export type CatalystEvent = {
  ticker: string;
  label: string;
  date: string | null;
  days: number | null;
  kind: "earnings" | "theme";
};

/** Soft thematic catalysts — dated earnings come from Yahoo. */
const THEME_CATALYSTS: Record<string, string[]> = {
  NBIS: ["AI infra / capacity narrative"],
  CRWV: ["Cloud GPU demand & utilization"],
  RKLB: ["Launch cadence / Neutron progress"],
  BMNR: ["Crypto treasury / ETH beta"],
  VST: ["Power demand / data-center electricity"],
  NVDA: ["AI chip cycle & guidance"],
  AVGO: ["Custom AI ASIC / networking"],
  RDDT: ["Ad cycle & user growth prints"],
};

function toDateKey(d: Date): string {
  return dateKeyInTz(d);
}

export async function fetchNextEarningsDate(
  ticker: string
): Promise<Date | null> {
  try {
    const yf = await getYahoo();
    const symbol = (await resolveYahooListedSymbol(ticker)) ?? ticker;
    const summary = await yahooCall(() =>
      yf.quoteSummary(symbol, {
        modules: ["earnings", "calendarEvents", "earningsHistory"],
      })
    );
    const calendar = summary.calendarEvents?.earnings;
    const resolved = resolveYahooEarnings({
      history: summary.earningsHistory?.history ?? [],
      earningsDates: [
        ...(calendar?.earningsDate ?? []),
        ...(summary.earnings?.earningsChart?.earningsDate ?? []),
      ],
      earningsCallDates: calendar?.earningsCallDate ?? [],
      nextIsEstimate: calendar?.isEarningsDateEstimate,
    });
    return resolved.nextDate;
  } catch (err) {
    console.error(`Earnings lookup failed for ${ticker}`, err);
    return null;
  }
}

export async function fetchMarketEvents(tickers: string[]): Promise<{
  earnings: EarningsEvent[];
  catalysts: CatalystEvent[];
}> {
  const unique = [...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean))];

  const earnings: EarningsEvent[] = [];
  const catalysts: CatalystEvent[] = [];

  await Promise.all(
    unique.map(async (ticker) => {
      const date = await fetchNextEarningsDate(ticker);
      if (date) {
        const days = daysUntilInTz(date);
        // Upcoming only (Tallinn calendar) — drop yesterday/past
        if (days >= 0 && days <= 90) {
          const row: EarningsEvent = {
            ticker,
            date: toDateKey(date),
            days,
          };
          earnings.push(row);
          catalysts.push({
            ticker,
            label: "Earnings report",
            date: row.date,
            days: row.days,
            kind: "earnings",
          });
        }
      }

      for (const label of THEME_CATALYSTS[ticker] ?? []) {
        catalysts.push({
          ticker,
          label,
          date: null,
          days: null,
          kind: "theme",
        });
      }
    })
  );

  earnings.sort((a, b) => a.days - b.days);
  catalysts.sort((a, b) => {
    if (a.days === null && b.days === null) return a.ticker.localeCompare(b.ticker);
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });

  return { earnings, catalysts };
}
