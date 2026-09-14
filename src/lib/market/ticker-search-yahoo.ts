import { TICKER_QUERY_MAX } from "@/lib/input-guard";
import {
  looksLikeTickerQuery,
  rankTickerSuggestions,
  type TickerSuggestion,
} from "@/lib/market/ticker-search";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
  tickerStem,
} from "@/lib/ticker";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { yahooCall } from "@/lib/market/yahoo";

const WATCH_SYMBOL = /^[A-Z0-9.=^-]{1,12}$/;
const SKIP_TYPES = new Set([
  "OPTION",
  "FUTURE",
  "CURRENCY",
  "CRYPTOCURRENCY",
  "MONEY_MARKET",
]);

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

function companyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return name.slice(0, 48);
}

function collectSearchHits(
  quotes: unknown[],
  seen: Set<string>,
  out: TickerSuggestion[],
  limit: number
) {
  for (const row of quotes) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    if (rec.isYahooFinance !== true) continue;
    if (typeof rec.symbol !== "string") continue;
    const quoteType = typeof rec.quoteType === "string" ? rec.quoteType : "";
    if (SKIP_TYPES.has(quoteType)) continue;
    const symbol = normalizeYahooTicker(rec.symbol);
    if (!symbol || !isPlausibleTicker(symbol) || !WATCH_SYMBOL.test(symbol)) {
      continue;
    }
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const name =
      companyName(rec.shortname) ?? companyName(rec.longname);
    out.push({ symbol, name });
    if (out.length >= limit) return;
  }
}

async function searchOnce(
  yf: YahooFinanceInstance,
  query: string
): Promise<unknown[]> {
  const result = await yahooCall(() =>
    yf.search(query, {
      quotesCount: 8,
      newsCount: 0,
      enableFuzzyQuery: true,
    })
  );
  return result.quotes ?? [];
}

export async function searchYahooTickers(
  query: string
): Promise<TickerSuggestion[]> {
  const q = query.trim();
  if (q.length < 1 || q.length > TICKER_QUERY_MAX) return [];
  if (isMarketCircuitOpen("yahoo")) return [];
  try {
    const yf = await getYahoo();
    const tickerQuery = looksLikeTickerQuery(q);
    const normalized = tickerQuery ? normalizeYahooTicker(q) : "";
    const stem = tickerStem(normalized || q.toUpperCase());
    const seen = new Set<string>();
    const out: TickerSuggestion[] = [];

    const firstQueries = [q];
    if (normalized && normalized !== q.toUpperCase()) {
      firstQueries.push(normalized);
    }
    const firstHits = await Promise.all(
      firstQueries.map((queryText) => searchOnce(yf, queryText))
    );
    for (const hits of firstHits) {
      collectSearchHits(hits, seen, out, 8);
    }

    const hasStem = out.some((row) => tickerStem(row.symbol) === stem);
    if (tickerQuery && !hasStem && normalized && !normalized.includes(".")) {
      collectSearchHits(await searchOnce(yf, `${normalized}.DE`), seen, out, 8);
    }
    if (tickerQuery && !hasStem && normalized?.includes(".")) {
      collectSearchHits(await searchOnce(yf, normalized), seen, out, 8);
    }
    if (
      tickerQuery &&
      normalized &&
      !seen.has(normalized) &&
      (normalized.includes(".") || normalized !== q.toUpperCase())
    ) {
      out.unshift({ symbol: normalized, name: null });
    }

    return rankTickerSuggestions(q, out).slice(0, 8);
  } catch (err) {
    console.error("[ticker-search] Yahoo search failed", err);
    return [];
  }
}
