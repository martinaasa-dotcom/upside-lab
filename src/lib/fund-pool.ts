/**
 * The companies the Fund looks at beyond its fixed list: whatever retail
 * investors are piling into right now.
 *
 * The fixed list (`FUND_UNIVERSE`) is measured, and a fixed list goes stale:
 * a company that becomes everybody's favourite in March is not on it until
 * somebody edits a file. So every run also asks the feed what is trending
 * and what is up most today, and adds the monthly popular names this app
 * already records for the last three months, so a name that was a
 * favourite a few weeks ago is still looked at after one day's noise has
 * moved on.
 *
 * Joining the pool is not being bought. Every name in it meets exactly the
 * rules the fixed list meets: a long uptrend, well ahead of the S&P 500 over
 * six months, and then a dip that turns up or a close at a new three-month
 * high. Most of what trends on a given day fails those, which is the point.
 *
 * What it cannot have is a backtest. Nobody kept a record of what was
 * trending in 2019, so the pool's effect on returns is not measured the way
 * every rule in `fund-strategy.ts` is. The filters below keep out the shapes
 * that cannot be judged by those rules at all: funds (leveraged index funds
 * top the volume list most days), companies too small to buy and sell
 * cleanly, and shares priced in cents.
 */

import { FUND_BENCHMARK, FUND_UNIVERSE } from "@/lib/fund-strategy";

export const POOL_RULES = {
  /** Worth at least this much, so a buy and a sell are clean at the close. */
  minMarketCap: 5e9,
  /** A share priced under this is a different kind of instrument. */
  minPrice: 5,
  /** At most this many names join, so one run's price walk stays bounded. */
  maxNames: 40,
};

/** Yahoo's codes for the main US exchanges. */
const US_EXCHANGES = new Set(["NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "BTS"]);
const TICKER_RE = /^[A-Z]{1,5}(-[A-Z])?$/;

export type PoolQuote = {
  symbol?: string;
  quoteType?: string;
  marketCap?: number;
  regularMarketPrice?: number;
  exchange?: string;
};

/**
 * Which candidates may join, in the order they were offered (today's
 * trending names first). Pure, so the filter is tested apart from the feed.
 */
export function poolFromQuotes(
  candidates: readonly string[],
  quotes: readonly PoolQuote[]
): string[] {
  const fixed = new Set<string>([FUND_BENCHMARK, ...FUND_UNIVERSE]);
  const bySymbol = new Map<string, PoolQuote>();
  for (const q of quotes) {
    if (q.symbol) bySymbol.set(q.symbol.toUpperCase(), q);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of candidates) {
    const t = raw.trim().toUpperCase();
    if (seen.has(t) || fixed.has(t) || !TICKER_RE.test(t)) continue;
    seen.add(t);
    const q = bySymbol.get(t);
    if (!q || q.quoteType !== "EQUITY") continue;
    if (!q.exchange || !US_EXCHANGES.has(q.exchange)) continue;
    if (!(typeof q.marketCap === "number" && q.marketCap >= POOL_RULES.minMarketCap)) continue;
    if (!(typeof q.regularMarketPrice === "number" && q.regularMarketPrice >= POOL_RULES.minPrice)) continue;
    out.push(t);
    if (out.length >= POOL_RULES.maxNames) break;
  }
  return out;
}

/** This month and the two before it, as the popular-names table keys them. */
export function recentMonths(now: Date, count = 3): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
