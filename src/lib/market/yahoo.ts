import { isCoinSymbol } from "@/lib/coins";
import type { Quote } from "@/lib/types";
import { sessionMark } from "@/lib/market-session";
import { synthesizeSparkline } from "@/lib/market/sparkline";
import { yahooQuoteCandidates } from "@/lib/ticker";
import { resolveYahooEarnings } from "@/lib/market/earnings-dates";
import { calendarDaysBetweenKeys, dateKeyInTz } from "@/lib/timezone";
import { marketSession } from "@/lib/market/session";
import type { EarningsPrint } from "@/lib/earnings-brief";
import {
  extraFxCodes,
  listingAmountToUsd,
  listingCanConvert,
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
  for (let i = 0; i < ticker.length; i++)
    h = (h * 31 + ticker.charCodeAt(i)) | 0;
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
  code: string,
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

/**
 * The rates, remembered for a minute.
 *
 * Ten quote calls go out for currency pairs, and until this memo existed
 * every one of them was paid again on every origin hit: each `/api/quotes`
 * miss, every sale price the Fund route works out, and the nightly
 * snapshot. Measured at 128 to 201 ms, and paid before the first ticker
 * call had even been issued, because the wave waited on it.
 *
 * A minute is chosen against what the rates are for. They restate cost,
 * value and gain on a non-dollar listing, and EURUSD does not move enough
 * in sixty seconds to change a figure anybody reads. This is not a cache of
 * prices for the reader: freshness of a share price stays the quote store's
 * business, and nothing here touches one.
 */
const FX_MEMO_MS = 60_000;

let fxMemo: { key: string; at: number; rates: FxRates } | null = null;
let fxPending: { key: string; task: Promise<FxRates> } | null = null;

function fxMemoKey(): string {
  return extraFxCodes().join(",");
}

function fxHasRates(rates: FxRates): boolean {
  return (
    (rates.eurUsd != null && rates.eurUsd > 0) ||
    (rates.gbpUsd != null && rates.gbpUsd > 0) ||
    Object.keys(rates.usdPer).length > 0
  );
}

/**
 * The memo, the in-flight share, or a fresh round. A round that came back
 * with nothing is deliberately not remembered: one bad minute at the
 * provider must not freeze every non-dollar listing for the minute after
 * it as well.
 */
function currentFxRates(yf: YahooFinanceInstance): Promise<FxRates> {
  const key = fxMemoKey();
  if (fxMemo && fxMemo.key === key && Date.now() - fxMemo.at < FX_MEMO_MS) {
    return Promise.resolve(fxMemo.rates);
  }
  if (fxPending && fxPending.key === key) return fxPending.task;
  const task = fetchFxRates(yf).then((rates) => {
    if (fxHasRates(rates)) fxMemo = { key, at: Date.now(), rates };
    if (fxPending?.task === task) fxPending = null;
    return rates;
  });
  fxPending = { key, task };
  return task;
}

/** Fetch EURUSD/GBPUSD only (for Compound / empty books). */
export async function fetchFxOnly(): Promise<FxRates> {
  if (isMarketCircuitOpen("yahoo")) {
    return { ...EMPTY_FX };
  }
  try {
    const yf = await getYahoo();
    return await currentFxRates(yf);
  } catch (err) {
    console.error("FX-only fetch failed", err);
    return { ...EMPTY_FX };
  }
}

/**
 * Convert a Yahoo native price into USD (book of record is always USD), or
 * say it cannot.
 *
 * Null is the important half. `listingAmountToUsd` hands the amount back
 * unchanged when it has no rate, which is right for a field somebody is
 * typing into and wrong here: the number is stored and printed as dollars
 * from this point on, so a Stockholm listing at 1,050 SEK became a holding
 * worth $1,050, roughly ten times the truth, in the portfolio total, in
 * Pulse, in the forecast and in the Sunday letter, which states its figures
 * as fact in an inbox.
 *
 * It is not a rare shape either. `fetchFxRates` builds its table only from
 * the pairs that answered, and the memo keeps a partial table as long as
 * anything is in it, so one bad minute on SEKUSD leaves EUR and GBP working
 * and SEK silently wrong for the life of the memo.
 */
function priceToUsd(
  price: number,
  currency: string | undefined,
  fx: FxRates,
  symbol?: string,
): number | null {
  const { amount, code } = normalizeListedPrice(price, currency);
  // FX pairs are the rate. Rounding them to cents freezes EURUSD at 1.16.
  if (symbol?.endsWith("=X") && code === "USD") return amount;
  const usdPer = usdPerMapFromFx(fx);
  if (!listingCanConvert(code, usdPer)) return null;
  return listingAmountToUsd(amount, code, usdPer);
}

function scaleMoney(
  value: number | null,
  nativePrice: number,
  usdPrice: number,
): number | null {
  if (value == null || nativePrice <= 0) return value;
  return value * (usdPrice / nativePrice);
}

/**
 * Which exchange a name is listed on does not change during a day, and
 * asking costs a live quote call per candidate until one answers. Pulse
 * asked twice for every ticker it built a context for, the news search and
 * the earnings summary each resolving separately, and the write plan and
 * the earnings brief asked again on top of that. So a resolved listing is
 * remembered for a day, with concurrent askers sharing the one walk.
 *
 * A name that would not quote is remembered for far less. A negative is
 * mostly the provider having a bad minute rather than the company having no
 * listing, and holding that for a day would send every caller to the bare
 * ticker until tomorrow.
 */
const SYMBOL_MEMO_MS = 24 * 60 * 60 * 1000;
const SYMBOL_MISS_MEMO_MS = 10 * 60 * 1000;
const MAX_SYMBOL_MEMO = 500;

const symbolMemo = new Map<string, { at: number; symbol: string | null }>();
const symbolInFlight = new Map<string, Promise<string | null>>();

function pruneSymbolMemo() {
  if (symbolMemo.size <= MAX_SYMBOL_MEMO) return;
  const extra = symbolMemo.size - MAX_SYMBOL_MEMO;
  for (const key of [...symbolMemo.keys()].slice(0, extra)) {
    symbolMemo.delete(key);
  }
}

async function walkForListedSymbol(raw: string): Promise<string | null> {
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

/** First Yahoo listing that actually quotes. Xetra before London. */
export async function resolveYahooListedSymbol(
  raw: string,
): Promise<string | null> {
  const key = raw.trim().toUpperCase();
  if (!key) return null;
  const hit = symbolMemo.get(key);
  if (hit) {
    const life = hit.symbol ? SYMBOL_MEMO_MS : SYMBOL_MISS_MEMO_MS;
    if (Date.now() - hit.at < life) return hit.symbol;
  }
  const pending = symbolInFlight.get(key);
  if (pending) return pending;

  const task = walkForListedSymbol(raw)
    .then((symbol) => {
      symbolMemo.set(key, { at: Date.now(), symbol });
      pruneSymbolMemo();
      return symbol;
    })
    .finally(() => {
      symbolInFlight.delete(key);
    });
  symbolInFlight.set(key, task);
  return task;
}

/** One daily bar, in the listing's own money. Converting is the caller's job. */
type DailyBar = { date: string; close: number };

/**
 * The ninety day series behind the sparkline, kept per symbol.
 *
 * A quote and a chart went out together for every ticker on every origin
 * hit, so a reader polling at the open cadence paid two provider calls a
 * name for a series that gains one bar a day. The bars are held for about a
 * minute while a session is running and ten while none is, and the bar for
 * today is patched from the quote that came back with it, so the sparkline
 * still ends on the live mark. Nothing about the price a reader sees comes
 * from here.
 */
const CHART_MEMO_SESSION_MS = 60_000;
const CHART_MEMO_CLOSED_MS = 10 * 60_000;
const MAX_CHART_MEMO = 400;

const chartMemo = new Map<string, { at: number; bars: DailyBar[] }>();
const chartInFlight = new Map<string, Promise<DailyBar[] | null>>();

function chartMemoMs(at: Date = new Date()): number {
  return marketSession(at) === "closed"
    ? CHART_MEMO_CLOSED_MS
    : CHART_MEMO_SESSION_MS;
}

function pruneChartMemo() {
  if (chartMemo.size <= MAX_CHART_MEMO) return;
  const extra = chartMemo.size - MAX_CHART_MEMO;
  for (const key of [...chartMemo.keys()].slice(0, extra)) {
    chartMemo.delete(key);
  }
}

function toDailyBars(
  rows: Array<{ date?: Date | string | number | null; close?: number | null }>,
): DailyBar[] {
  const out: DailyBar[] = [];
  for (const row of rows) {
    const close = row.close;
    const rawDate = row.date;
    if (typeof close !== "number" || !isPlausiblePrice(close) || !rawDate) {
      continue;
    }
    const when =
      rawDate instanceof Date
        ? rawDate
        : new Date(
            typeof rawDate === "number" && rawDate < 1e12
              ? rawDate * 1000
              : rawDate,
          );
    if (Number.isNaN(when.getTime())) continue;
    out.push({ date: dateKeyInTz(when, "America/New_York"), close });
  }
  return out;
}

async function dailyBarsForSymbol(
  yf: YahooFinanceInstance,
  symbol: string,
  period1: Date,
): Promise<DailyBar[] | null> {
  const hit = chartMemo.get(symbol);
  if (hit && Date.now() - hit.at < chartMemoMs()) return hit.bars;
  const pending = chartInFlight.get(symbol);
  if (pending) return pending;

  const task = (async () => {
    try {
      const chart = await yf.chart(symbol, { period1, interval: "1d" });
      const bars = toDailyBars(chart?.quotes ?? []);
      chartMemo.set(symbol, { at: Date.now(), bars });
      pruneChartMemo();
      return bars;
    } catch {
      // The last good series beats no series at all; a failed chart used
      // to leave the sparkline synthetic for the rest of the session.
      return hit?.bars ?? null;
    } finally {
      chartInFlight.delete(symbol);
    }
  })();
  chartInFlight.set(symbol, task);
  return task;
}

/** Today's bar restated from the quote that just came back beside it. */
function withLiveLastBar(
  bars: DailyBar[],
  todayKey: string,
  nativeClose: number,
): DailyBar[] {
  const last = bars[bars.length - 1];
  if (!last || last.date !== todayKey || last.close === nativeClose) {
    return bars;
  }
  return [...bars.slice(0, -1), { date: last.date, close: nativeClose }];
}

async function quoteOneSymbol(
  yf: YahooFinanceInstance,
  symbol: string,
  fxTask: Promise<FxRates>,
  period1: Date,
): Promise<Quote | null> {
  // The quote and the bars are asked for together, and the rates are only
  // waited on once both are back: an FX round in front of the wave used to
  // add its whole latency to every ticker behind it.
  const [quoteRaw, cachedBars] = await Promise.all([
    yahooCall(() => yf.quote(symbol)),
    dailyBarsForSymbol(yf, symbol, period1),
  ]);
  const fx = await fxTask;
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
  const previousCloseOrNull = priceToUsd(
    mark.previousClose,
    yahooCurrency,
    fx,
    symbol,
  );
  /*
    No rate, no quote. A price this app cannot turn into dollars must not
    become a dollar figure, and the whole of this app's design says a hole
    beats a wrong number: fallbackQuotes is deliberately not wired into the
    live path for the same reason, and weeklyNumbersAreSound refuses to send
    a letter rather than state a total it is unsure of. A dropped name is
    already an outcome every caller handles.
  */
  if (price == null) return null;
  const previousClose = previousCloseOrNull ?? 0;
  // Derived directly from (current price vs yesterday's close)
  // instead of reusing Yahoo's own change fields — regularMarket*
  // and postMarket* changes are relative to two DIFFERENT baselines
  // (previous close vs. the regular close), so summing them isn't
  // valid; recomputing from scratch is correct in every session.
  const change = previousClose > 0 ? price - previousClose : 0;
  const changePercent = previousClose > 0 ? change / previousClose : 0;
  const bars = withLiveLastBar(
    cachedBars ?? [],
    dateKeyInTz(new Date(), "America/New_York"),
    yahooNative,
  );
  const sparkline =
    bars.length > 1
      ? bars.flatMap((bar) => {
          const usd = priceToUsd(bar.close, yahooCurrency, fx, symbol);
          return usd == null ? [] : [usd];
        })
      : synthesizeSparkline(price, changePercent * 100);
  const dailyCloses = bars.slice(-15).flatMap((bar) => {
    const close = priceToUsd(bar.close, yahooCurrency, fx, symbol);
    return close == null ? [] : [{ date: bar.date, close }];
  });

  const preMarketPrice = scaleMoney(
    typeof quote.preMarketPrice === "number" ? quote.preMarketPrice : null,
    yahooNative,
    price,
  );
  const preMarketChange = scaleMoney(
    typeof quote.preMarketChange === "number" ? quote.preMarketChange : null,
    yahooNative,
    price,
  );
  const preMarketChangePercent =
    typeof quote.preMarketChangePercent === "number"
      ? quote.preMarketChangePercent / 100
      : null;
  const postMarketPrice = scaleMoney(
    typeof quote.postMarketPrice === "number" ? quote.postMarketPrice : null,
    yahooNative,
    price,
  );
  const postMarketChange = scaleMoney(
    typeof quote.postMarketChange === "number" ? quote.postMarketChange : null,
    yahooNative,
    price,
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
  tickers: string[],
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
    // Not awaited here. A refresh of the rates runs alongside the ticker
    // wave rather than in front of it, and each name waits for it only
    // once its own two calls are back.
    const fxTask = currentFxRates(yf);
    const period1 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const resolveOne = async (requested: string): Promise<QuoteHit | null> => {
      if (isMarketCircuitOpen("yahoo")) return null;
      for (const symbol of yahooQuoteCandidates(requested)) {
        try {
          const quote = await quoteOneSymbol(yf, symbol, fxTask, period1);
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
      },
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
    return { quotes: map, fx: await fxTask, failed };
  } catch (err) {
    console.error("yahoo-finance2 unavailable", err);
    return {
      quotes: {},
      fx: { ...EMPTY_FX },
      failed: unique,
    };
  }
}

/** Everything this module remembers between calls, for a test to clear. */
export function resetYahooMemosForTests() {
  fxMemo = null;
  fxPending = null;
  chartMemo.clear();
  chartInFlight.clear();
  symbolMemo.clear();
  symbolInFlight.clear();
  ytdCloseCache.clear();
  ytdCloseInFlight.clear();
}

export type ShareSplit = {
  ticker: string;
  /** The market open at which the new share count is the real one. */
  effectiveOn: string;
  /** Ten for one is 10 and 1. One for ten, the reverse, is 1 and 10. */
  numerator: number;
  denominator: number;
};

/**
 * The share splits a company has had in a window of days.
 *
 * The same chart endpoint the daily closes come from, asked for its events as
 * well as its bars. Nothing else this app talks to reports a split, and a
 * split nobody notices leaves a holding at the wrong number of shares: ten
 * for one shows a holder apparently down ninety per cent, and a reverse split
 * shows a windfall that nobody had.
 *
 * Null when the question could not be asked at all, which is a different
 * answer from an empty list and the caller treats it as one. "Nothing split"
 * and "the provider did not answer" look identical from outside and lead to
 * opposite decisions.
 */
export async function fetchSplits(
  ticker: string,
  fromIso: string,
  toIso: string,
): Promise<ShareSplit[] | null> {
  const yf = await getYahoo();
  const period1 = new Date(`${fromIso}T00:00:00Z`);
  // A day past the end, because the window is inclusive and the bar for the
  // last day has to be inside it.
  const period2 = new Date(
    new Date(`${toIso}T00:00:00Z`).getTime() + 86_400_000,
  );

  let asked = false;

  for (const symbol of yahooQuoteCandidates(ticker)) {
    try {
      const chart = await yahooCall(() =>
        yf.chart(symbol, { period1, period2, interval: "1d", events: "split" }),
      );
      asked = true;

      const splits = (
        chart as unknown as {
          events?: {
            splits?: Array<{
              date?: Date;
              numerator?: number;
              denominator?: number;
            }>;
          };
        }
      ).events?.splits;

      if (!splits?.length) continue;

      return splits
        .filter(
          (split) =>
            split.date instanceof Date &&
            Number.isFinite(split.numerator) &&
            Number.isFinite(split.denominator) &&
            (split.numerator as number) > 0 &&
            (split.denominator as number) > 0,
        )
        .map((split) => ({
          ticker: ticker.toUpperCase(),
          /*
            Yahoo timestamps a split at the opening bell, so the UTC date and
            the exchange's date are the same day and slicing it is safe here
            in a way it would not be for an evening timestamp.
          */
          effectiveOn: (split.date as Date).toISOString().slice(0, 10),
          numerator: split.numerator as number,
          denominator: split.denominator as number,
        }));
    } catch {
      // Try the next listing of the same company before giving up on it.
    }
  }

  // Asked and told nothing, versus never got an answer. The caller needs to
  // tell those apart.
  return asked ? [] : null;
}

export type DailyClose = { date: string; close: number };

const YTD_CLOSE_TTL_MS = 6 * 60 * 60 * 1000;
const ytdCloseCache = new Map<
  string,
  { year: number; at: number; rows: DailyClose[] }
>();
const ytdCloseInFlight = new Map<string, Promise<DailyClose[]>>();

function chartRowsToDailyCloses(
  quotes: Array<{
    date?: Date | string | number | null;
    close?: number | null;
  }>,
  currency: string | undefined,
  fx: FxRates,
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
                : rawDate,
            );
      if (Number.isNaN(when.getTime())) return null;
      // A bar this app cannot price in dollars is dropped, not passed on as
      // though the listing's own number were dollars. The predicate below
      // asserts the shape rather than checking it, so a null here would
      // have travelled as a number.
      const closeUsd = priceToUsd(close, currency, fx);
      if (closeUsd == null) return null;
      return {
        date: dateKeyInTz(when, "America/New_York"),
        close: closeUsd,
      };
    })
    .filter((b): b is DailyClose => b != null);
}

async function ytdClosesForSymbol(
  yf: YahooFinanceInstance,
  fxTask: Promise<FxRates>,
  symbol: string,
  year: number,
  period1: Date,
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
        yf.chart(symbol, { period1, interval: "1d" }),
      );
      const currency =
        typeof chart.meta?.currency === "string"
          ? chart.meta.currency
          : undefined;
      const rows = chartRowsToDailyCloses(
        chart.quotes ?? [],
        currency,
        await fxTask,
      );
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
  tickers: string[],
): Promise<Record<string, DailyClose[]>> {
  const unique = [...new Set(tickers.map((t) => t.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const year = new Date().getFullYear();
  const period1 = new Date(Date.UTC(year, 0, 1));
  try {
    const yf = await getYahoo();
    const fxTask = currentFxRates(yf);
    const out: Record<string, DailyClose[]> = {};
    // Pooled for the same reason the quote path is: an unbounded burst is
    // already sent by the time the circuit breaker can open.
    await mapWithConcurrency(unique, MAX_IN_FLIGHT, async (ticker) => {
      const key = ticker.toUpperCase();
      for (const symbol of yahooQuoteCandidates(ticker)) {
        const rows = await ytdClosesForSymbol(
          yf,
          fxTask,
          symbol,
          year,
          period1,
        );
        if (rows.length > 0) {
          out[key] = rows;
          return;
        }
      }
      out[key] = [];
    });
    return out;
  } catch (err) {
    console.error("YTD close fetch unavailable", err);
    return {};
  }
}

export type WeekReturn = { start: number; end: number; pct: number };

/** Prior Friday close to the latest close. Sunday look uses this, not today's session. */
export async function fetchWeekReturns(
  tickers: string[],
): Promise<Record<string, WeekReturn>> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return {};
  const period1 = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000);
  try {
    const yf = await getYahoo();
    const fxTask = currentFxRates(yf);
    const out: Record<string, WeekReturn> = {};
    await Promise.all(
      unique.map(async (ticker) => {
        for (const symbol of yahooQuoteCandidates(ticker)) {
          try {
            const chart = await yahooCall(() =>
              yf.chart(symbol, { period1, interval: "1d" }),
            );
            const currency =
              typeof chart.meta?.currency === "string"
                ? chart.meta.currency
                : undefined;
            const rows = chartRowsToDailyCloses(
              chart.quotes ?? [],
              currency,
              await fxTask,
            );
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
      }),
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

export async function fetchNextEarningsDate(
  ticker: string,
): Promise<Date | null> {
  if (isCoinSymbol(ticker)) return null;
  try {
    const yf = await getYahoo();
    const symbol = (await resolveYahooListedSymbol(ticker)) ?? ticker;
    const summary = await yahooCall(() =>
      yf.quoteSummary(symbol, {
        modules: ["earnings", "calendarEvents", "earningsHistory"],
      }),
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
  const unique = [
    ...new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)),
  ];

  const earnings: EarningsEvent[] = [];
  const catalysts: CatalystEvent[] = [];

  /*
    The next earnings date comes from the pulse context rather than from a
    summary call of its own. Both were asking Yahoo the same question about
    the same reader's names, and the pulse context already holds the answer
    for an hour; this route used to pay for a listing walk and a
    `quoteSummary` per ticker to arrive at the date sitting in that cache.

    Imported here rather than at the top of the file because the context
    module reads this one for its listing lookup, and a cycle between two
    modules that both run at import time is not worth having.
  */
  const dated = unique.filter((ticker) => !isCoinSymbol(ticker));
  const { fetchPulseContexts } = await import("@/lib/market/ticker-context");
  const contexts = dated.length > 0 ? await fetchPulseContexts(dated) : {};
  const todayKey = dateKeyInTz(new Date());

  for (const ticker of unique) {
    if (!isCoinSymbol(ticker)) {
      const nextKey = contexts[ticker]?.nextEarningsDate ?? null;
      // Counted from today rather than read off the context, which may
      // have been written on the other side of a midnight.
      const days = nextKey ? calendarDaysBetweenKeys(todayKey, nextKey) : null;
      // Upcoming only (Tallinn calendar) — drop yesterday/past
      if (nextKey && days != null && days >= 0 && days <= 90) {
        const row: EarningsEvent = { ticker, date: nextKey, days };
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
  }

  earnings.sort((a, b) => a.days - b.days);
  catalysts.sort((a, b) => {
    if (a.days === null && b.days === null)
      return a.ticker.localeCompare(b.ticker);
    if (a.days === null) return 1;
    if (b.days === null) return -1;
    return a.days - b.days;
  });

  return { earnings, catalysts };
}
