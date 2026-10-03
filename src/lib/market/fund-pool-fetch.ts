/**
 * Asks the feed who retail investors are piling into today, for the Fund's
 * dynamic pool. See `fund-pool.ts` for why and for the filter.
 *
 * Never throws: a pool that could not be fetched is an empty pool, and the
 * Fund trades its fixed list exactly as before.
 */

import { poolFromQuotes, recentMonths, type PoolQuote } from "@/lib/fund-pool";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { yahooCall } from "@/lib/market/yahoo";
import { readPopularTickers } from "@/lib/popular-tickers-read";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";

type YahooFinanceInstance = InstanceType<typeof import("yahoo-finance2").default>;
let yahoo: YahooFinanceInstance | null = null;
async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

function symbolsOf(result: PromiseSettledResult<unknown>): string[] {
  if (result.status !== "fulfilled") return [];
  const quotes = (result.value as { quotes?: unknown[] } | null)?.quotes ?? [];
  return quotes
    .map((q) => (q && typeof q === "object" ? (q as { symbol?: unknown }).symbol : null))
    .filter((s): s is string => typeof s === "string");
}

export async function fetchFundPool(
  supabase: AppSupabaseClient,
  now: Date = new Date()
): Promise<string[]> {
  try {
    const candidates: string[] = [];
    if (!isMarketCircuitOpen("yahoo")) {
      const yf = await getYahoo();
      /*
        Trending and today's biggest gainers, not the heaviest volume: the
        volume list on an ordinary day is Coca-Cola, Bank of America and
        Ford, which is where money sits rather than where attention goes.
        The monthly record below already carries the month's volume leaders.
        The library's own validation is off because one odd row in a list
        otherwise throws away the whole list; every field read is checked
        by `poolFromQuotes`.
      */
      const off = { validateResult: false } as const;
      const [trending, gainers] = await Promise.allSettled([
        yahooCall(() => yf.trendingSymbols("US", { count: 25 }, off)),
        yahooCall(() => yf.screener({ scrIds: "day_gainers", count: 25 }, undefined, off)),
      ]);
      candidates.push(...symbolsOf(trending), ...symbolsOf(gainers));
    }
    for (const month of recentMonths(now)) {
      const stored = await readPopularTickers(supabase, month).catch(() => null);
      if (stored) candidates.push(...stored);
    }
    const unique = [...new Set(candidates.map((c) => c.trim().toUpperCase()))].filter(Boolean);
    if (unique.length === 0 || isMarketCircuitOpen("yahoo")) return [];

    const yf = await getYahoo();
    const quotes: PoolQuote[] = [];
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      try {
        const rows = await yahooCall(() =>
          yf.quote(chunk, undefined, { validateResult: false })
        );
        if (Array.isArray(rows)) quotes.push(...(rows as PoolQuote[]));
      } catch {
        /* a chunk that failed simply contributes nobody */
      }
    }
    return poolFromQuotes(unique, quotes);
  } catch {
    return [];
  }
}
