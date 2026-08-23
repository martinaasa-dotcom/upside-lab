/** The 30 names people have been watching most this month. */

export const POPULAR_TICKER_COUNT = 30;

/**
 * The seven that are always offered, whatever the month said.
 *
 * These are the companies almost every new reader can name, and the
 * watchlist screen is the one place a person is asked to think of names
 * cold. A month where the live feed happened to surface small caps left
 * that screen offering RIG and PLUG and no Apple, which reads as a broken
 * list rather than a current one.
 *
 * They are seeded first and in this order, so the row opens with the
 * familiar names and the month's movers follow. Everything after them is
 * still whatever people are actually trading.
 */
export const ALWAYS_POPULAR_TICKERS: readonly string[] = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
];

/**
 * Used when Yahoo is down or the monthly snapshot is missing.
 * Generic liquid names, not anyone's personal book.
 */
export const FALLBACK_POPULAR_TICKERS: readonly string[] = [
  "NVDA",
  "AAPL",
  "MSFT",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "AMD",
  "NFLX",
  "SPY",
  "QQQ",
  "IWM",
  "JPM",
  "V",
  "MA",
  "COST",
  "WMT",
  "XOM",
  "JNJ",
  "UNH",
  "LLY",
  "PLTR",
  "COIN",
  "HOOD",
  "MSTR",
  "SMCI",
  "IONQ",
  "SOFI",
  "DIS",
];

const TICKER_RE = /^[A-Z]{1,5}([.-][A-Z])?$/;

export function currentPopularMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function isPopularTicker(raw: string): boolean {
  return TICKER_RE.test(raw.trim().toUpperCase());
}

/**
 * The month's list, always led by the seven, always topped up to 30.
 *
 * Seeding happens here rather than in the cron so it also covers rows that
 * were written before this rule existed, and the generic fallback, and
 * anything a future feed returns. One place decides what the watchlist
 * offers.
 */
export function sanitizePopularTickers(raw: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of ALWAYS_POPULAR_TICKERS) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  if (!Array.isArray(raw)) {
    for (const t of FALLBACK_POPULAR_TICKERS) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= POPULAR_TICKER_COUNT) break;
    }
    return out;
  }
  for (const item of raw) {
    const t = String(item ?? "")
      .trim()
      .toUpperCase();
    if (!isPopularTicker(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= POPULAR_TICKER_COUNT) break;
  }
  if (out.length >= POPULAR_TICKER_COUNT) return out;
  for (const t of FALLBACK_POPULAR_TICKERS) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= POPULAR_TICKER_COUNT) break;
  }
  return out;
}

export type PopularTickersPayload = {
  month: string;
  tickers: string[];
  source: "month" | "live" | "fallback";
};
