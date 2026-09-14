import { sanitizePopularTickers } from "@/lib/popular-tickers";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { yahooCall } from "@/lib/market/yahoo";

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

function symbolOf(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const symbol = (row as { symbol?: unknown }).symbol;
  return typeof symbol === "string" ? symbol : null;
}

/**
 * Most-traded US names first, then names people are searching today,
 * capped at 30. Volume is the popularity we can actually measure.
 */
export async function fetchMonthlyPopularTickers(): Promise<string[]> {
  if (isMarketCircuitOpen("yahoo")) {
    throw new Error("Yahoo circuit open");
  }
  const yf = await getYahoo();
  const [actives, trending] = await Promise.allSettled([
    yahooCall(() =>
      yf.screener({ scrIds: "most_actives", count: 40 })
    ),
    yahooCall(() => yf.trendingSymbols("US", { count: 20 })),
  ]);

  const raw: string[] = [];
  if (actives.status === "fulfilled") {
    for (const q of actives.value.quotes ?? []) {
      const s = symbolOf(q);
      if (s) raw.push(s);
    }
  }
  if (trending.status === "fulfilled") {
    for (const q of trending.value.quotes ?? []) {
      const s = symbolOf(q);
      if (s) raw.push(s);
    }
  }
  if (raw.length === 0) {
    throw new Error("Yahoo returned no popular names");
  }
  return sanitizePopularTickers(raw);
}
