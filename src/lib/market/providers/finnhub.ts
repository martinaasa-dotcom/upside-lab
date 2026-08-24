/**
 * Finnhub fallback quote provider — free tier (60 calls/min, no credit
 * card) at https://finnhub.io/register. Only used when FINNHUB_API_KEY is
 * set and only for tickers no earlier provider in the chain could price.
 */
import { synthesizeSparkline } from "@/lib/market/sparkline";
import { listingCurrency } from "@/lib/listing-currency";
import type { Quote } from "@/lib/types";
import {
  isMarketCircuitOpen,
  marketFetch,
  MarketHttpError,
} from "@/lib/market/circuit-breaker";
import { finnhubQuoteSchema, isPlausiblePrice } from "@/lib/market/quote-sanitize";
import { mapWithConcurrency } from "@/lib/market/pool";

/**
 * How many Finnhub calls may be in flight at once.
 *
 * Finnhub's free tier is 60 calls a minute and this provider has no batch
 * endpoint, so one quote is one call. A request may ask about 120 names
 * (MAX_TICKERS_PER_REQUEST), and every one of them reaching here is a name
 * neither Yahoo nor Twelve Data could price, so latency is not what this
 * number is protecting: firing all 120 at once measured 360 upstream calls
 * against a feed already answering 429, because no chain finished in time
 * for the breaker to stop the next. Six is wide enough that the handful of
 * odd tickers a real book contains still resolve in one wave, and narrow
 * enough that three failures open the circuit and the rest are skipped.
 */
const MAX_IN_FLIGHT = 6;

export function finnhubConfigured(): boolean {
  const key = process.env.FINNHUB_API_KEY;
  return Boolean(key && key !== "your_key_here");
}

/** Best-effort, one request per ticker (Finnhub has no batch quote endpoint). */
export async function fetchQuotesFinnhub(
  tickers: string[]
): Promise<Record<string, Quote>> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || tickers.length === 0) return {};
  if (isMarketCircuitOpen("finnhub")) return {};

  const now = Date.now();
  const out: Record<string, Quote> = {};
  await mapWithConcurrency(tickers, MAX_IN_FLIGHT, async (ticker) => {
    if (isMarketCircuitOpen("finnhub")) return;
    try {
      const res = await marketFetch(
        "finnhub",
        `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return;
      const parsed = finnhubQuoteSchema.safeParse(await res.json());
      if (!parsed.success) return;
      const row = parsed.data;
      const price = row.c;
      if (price == null || !isPlausiblePrice(price)) return;
      const previousClose =
        row.pc != null && isPlausiblePrice(Math.abs(row.pc)) ? row.pc : price;
      const change = row.d ?? price - previousClose;
      const changePercent = (row.dp ?? 0) / 100;
      out[ticker.toUpperCase()] = {
        ticker: ticker.toUpperCase(),
        price,
        change,
        changePercent,
        previousClose,
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
        stale: false,
        quotedAt: now,
      };
    } catch (err) {
      if (err instanceof MarketHttpError) {
        console.error(`Finnhub HTTP ${err.status} for ${ticker}`);
      } else {
        console.error(`Finnhub fallback failed for ${ticker}`, err);
      }
    }
  });
  return out;
}
