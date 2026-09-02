/**
 * Quote fallback chain — Yahoo (primary, free, no key) -> Twelve Data
 * (optional, free tier, needs TWELVE_DATA_API_KEY) -> Finnhub (optional,
 * free tier, needs FINNHUB_API_KEY) -> last-known cache (memory + Supabase).
 *
 * Missing names stay missing. The client keeps the last real cached
 * price instead of inventing one. A hole in the table beats a fake NAV.
 */
import { fetchFxOnly as fetchFxYahoo, fetchQuotesYahoo, type FxRates, type QuotesResult } from "@/lib/market/yahoo";
import { downsampleSparkline } from "@/lib/market/sparkline";
import { yahooQuoteCandidates } from "@/lib/ticker";
import type { Quote } from "@/lib/types";
import { sanitizeQuote } from "@/lib/market/quote-sanitize";
import { recallFx, recallQuotes, rememberFx, rememberQuotes } from "@/lib/market/quote-store";
import {
  markUnresolvable,
  partitionUnresolvable,
} from "@/lib/market/unresolvable";

/**
 * Most names one request may ask about.
 *
 * This is a cost ceiling, not a UI limit. A miss walks 17 exchange
 * candidates at two upstream calls each, so an uncapped request amplifies
 * roughly 34x per unknown name -- 50 made-up tickers measured at 1,718
 * Yahoo requests from a single unauthenticated GET. The per-IP limiter in
 * `rate-limit.ts` counts requests, which does not see that at all.
 *
 * 120 is far above any real book (the largest the app itself sends is a
 * user's whole holdings list) and far below the point where one request can
 * hurt the providers everybody shares.
 */
export const MAX_TICKERS_PER_REQUEST = 120;

function quoteForRequested(
  quotes: Record<string, Quote>,
  requested: string
): Quote | undefined {
  if (quotes[requested]) return quotes[requested];
  for (const candidate of yahooQuoteCandidates(requested)) {
    if (quotes[candidate]) return quotes[candidate];
  }
  return undefined;
}

function aliasResolvedQuotes(
  requested: string[],
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"]
) {
  for (const req of requested) {
    if (quotes[req]) continue;
    const hit = quoteForRequested(quotes, req);
    if (!hit) continue;
    quotes[req] = { ...hit, ticker: req };
    const sourceKey = [req, ...yahooQuoteCandidates(req)].find((key) => sources[key]);
    if (sourceKey) sources[req] = sources[sourceKey];
  }
}

function unresolvedSymbols(
  requested: string[],
  quotes: Record<string, Quote>
): string[] {
  return [...new Set(requested.filter((t) => !quoteForRequested(quotes, t)))];
}

function ingestLive(
  incoming: Record<string, Quote>,
  lastKnown: Record<string, Quote>,
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"],
  source: Exclude<QuotesResultWithSource["sources"][string], "cache">
) {
  const kept: Record<string, Quote> = {};
  for (const [ticker, raw] of Object.entries(incoming)) {
    const clean = sanitizeQuote(raw, lastKnown[ticker] ?? quotes[ticker] ?? null);
    if (!clean) continue;
    quotes[ticker] = clean;
    sources[ticker] = source;
    kept[ticker] = clean;
  }
  return kept;
}

function mergeCached(
  tickers: string[],
  cached: Record<string, Quote>,
  quotes: Record<string, Quote>,
  sources: QuotesResultWithSource["sources"]
) {
  for (const ticker of tickers) {
    if (quoteForRequested(quotes, ticker)) continue;
    const hit = quoteForRequested(cached, ticker);
    if (!hit) continue;
    quotes[ticker] = { ...hit, ticker, stale: true };
    sources[ticker] = "cache";
  }
}

function fxLooksLive(fx: FxRates): boolean {
  return (
    (fx.eurUsd != null && fx.eurUsd > 0) ||
    (fx.gbpUsd != null && fx.gbpUsd > 0) ||
    Object.values(fx.usdPer).some((n) => n > 0)
  );
}

export type QuotesResultWithSource = QuotesResult & {
  /** Which tier ultimately priced each ticker — surfaced for debugging/UI. */
  sources: Record<string, "yahoo" | "twelvedata" | "finnhub" | "cache">;
  /** Tickers no provider could price. Client should keep last known mark. */
  missing: string[];
  /**
   * Of `missing`, the names this request actually paid to discover -- ones
   * not already in the negative cache, so each walked the full suffix chain
   * at roughly 52 upstream calls apiece. This is the real cost of the
   * request. A repeat ask for the same dead ticker is 0 here, because it
   * was free. The unresolved budget is charged from `namesThatWouldWalk`
   * before the fetch rather than from this afterwards, since a bill that
   * arrives once the providers have been spent cannot stop anything.
   */
  newlyUnresolvable: string[];
  /** Epoch ms of the oldest print in this payload (live or cached). */
  updatedAt: number;
};

const EMPTY_FX: FxRates = {
  eurUsd: null,
  eurUsdOpen: null,
  eurUsdPreviousClose: null,
  eurUsdLast: null,
  gbpUsd: null,
  usdPer: {},
};

export async function fetchFxOnly(): Promise<FxRates> {
  const live = await fetchFxYahoo();
  if (fxLooksLive(live)) {
    rememberFx(live);
    return live;
  }
  const cached = await recallFx();
  return cached?.rates ?? live ?? EMPTY_FX;
}

export async function fetchQuotesWithFallback(
  tickers: string[]
): Promise<QuotesResultWithSource> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  const sources: QuotesResultWithSource["sources"] = {};
  const now = Date.now();
  if (unique.length === 0) {
    return {
      quotes: {},
      fx: { ...EMPTY_FX },
      delayed: false,
      sources,
      missing: [],
      newlyUnresolvable: [],
      updatedAt: now,
    };
  }

  const lastKnown = await recallQuotes(unique);

  // Names that resolved nowhere very recently are not asked about again --
  // they are the expensive ones, and asking twice costs 52 upstream calls
  // to learn what we already know. They still fall through to the cached
  // and missing paths below exactly as before.
  const { worthAsking, recentlyMissed } = partitionUnresolvable(unique);
  let newlyUnresolvable: string[] = [];
  const yahoo = await fetchQuotesYahoo(worthAsking);
  const quotes: Record<string, Quote> = {};
  ingestLive(yahoo.quotes, lastKnown, quotes, sources, "yahoo");
  aliasResolvedQuotes(unique, quotes, sources);

  let stillMissing = unresolvedSymbols(unique, quotes);

  if (stillMissing.length > 0) {
    const { fetchQuotesTwelveData, twelveDataConfigured } = await import(
      "@/lib/market/providers/twelvedata"
    );
    if (twelveDataConfigured()) {
      const fromTwelveData = await fetchQuotesTwelveData(stillMissing);
      ingestLive(fromTwelveData, lastKnown, quotes, sources, "twelvedata");
      aliasResolvedQuotes(unique, quotes, sources);
      stillMissing = unresolvedSymbols(unique, quotes);
    }
  }

  if (stillMissing.length > 0) {
    const { fetchQuotesFinnhub, finnhubConfigured } = await import(
      "@/lib/market/providers/finnhub"
    );
    if (finnhubConfigured()) {
      const fromFinnhub = await fetchQuotesFinnhub(stillMissing);
      ingestLive(fromFinnhub, lastKnown, quotes, sources, "finnhub");
      aliasResolvedQuotes(unique, quotes, sources);
      stillMissing = unresolvedSymbols(unique, quotes);
    }
  }

  // Anything that walked the whole provider chain and came back with
  // nothing is remembered, so the next attempt is free.
  if (stillMissing.length > 0) {
    newlyUnresolvable = stillMissing.filter((t) => !recentlyMissed.includes(t));
    markUnresolvable(newlyUnresolvable);
  }

  const liveQuotes: Record<string, Quote> = {};
  for (const [ticker, q] of Object.entries(quotes)) {
    if (!q.stale) liveQuotes[ticker] = q;
  }
  if (Object.keys(liveQuotes).length > 0) {
    rememberQuotes(liveQuotes, now);
  }

  if (stillMissing.length > 0) {
    mergeCached(stillMissing, lastKnown, quotes, sources);
    aliasResolvedQuotes(unique, quotes, sources);
    stillMissing = unresolvedSymbols(unique, quotes);
  }

  let fx = yahoo.fx;
  if (fxLooksLive(fx)) {
    rememberFx(fx, now);
  } else {
    const cachedFx = await recallFx();
    if (cachedFx) fx = cachedFx.rates;
  }

  const delayed =
    stillMissing.length > 0 ||
    Object.values(quotes).some((q) => q.stale) ||
    Object.values(sources).some((s) => s !== "yahoo");

  let updatedAt = now;
  for (const q of Object.values(quotes)) {
    q.sparkline = downsampleSparkline(q.sparkline);
    if (typeof q.quotedAt === "number" && q.quotedAt > 0) {
      updatedAt = Math.min(updatedAt, q.quotedAt);
    }
  }
  if (Object.values(quotes).every((q) => !q.stale) && Object.keys(quotes).length > 0) {
    updatedAt = now;
  }

  return {
    quotes,
    fx,
    delayed,
    sources,
    missing: unique.filter((t) => !quotes[t]),
    newlyUnresolvable,
    updatedAt,
  };
}

/**
 * Most names one request may walk the exchange chain for.
 *
 * `MAX_TICKERS_PER_REQUEST` bounds how many names a request may *name*.
 * This bounds how many of them may be expensive, which is a different
 * number: a name the caches can vouch for costs one upstream call, and a
 * name nothing can vouch for costs about fifty-two. Without this bound the
 * unresolved budget could not stop a burst at all, only bill for one after
 * the fact -- a weighted bucket lets a charge through whenever the bucket
 * is still under its limit, so a single request naming a hundred and
 * twenty invented symbols was always allowed and only put the address over
 * budget afterwards, once the providers had already been spent.
 *
 * Comfortably below `UNRESOLVED_LIMIT`, so an address's whole window is
 * worth a couple of these rather than one. Names over the line are simply
 * not asked about this time round; the ones that were asked about are in
 * the shared cache by the next poll, so a genuinely new portfolio fills in
 * over a few seconds instead of being refused.
 */
export const MAX_UNKNOWN_NAMES_PER_REQUEST = 25;

/**
 * Which of these names would pay the full price of a provider walk.
 *
 * A quote is cheap or ruinous depending on whether the symbol resolves.
 * One the shared quote cache already knows is answered by its first
 * candidate, and one already known to resolve nowhere is not asked about
 * at all. Everything else walks the bare symbol plus sixteen exchange
 * suffixes at two upstream calls each, and that walk is the whole reason
 * the unresolved budget exists.
 *
 * Asking this before the fetch is what turns the budget from a bill into a
 * decision. It costs no extra round trip in the ordinary case: the quote
 * store answers from memory first and writes whatever it fetches back into
 * memory, so the read `fetchQuotesWithFallback` does a moment later is
 * answered without touching Supabase again. For a real portfolio the
 * answer is an empty list, so nothing is charged and nothing is refused.
 */
export async function namesThatWouldWalk(
  tickers: readonly string[]
): Promise<string[]> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0) return [];
  const { worthAsking } = partitionUnresolvable(unique);
  if (worthAsking.length === 0) return [];
  const known = await recallQuotes(worthAsking);
  return worthAsking.filter((t) => !quoteForRequested(known, t));
}
