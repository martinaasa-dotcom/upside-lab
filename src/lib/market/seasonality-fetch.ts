import {
  buildSeasonalityModel,
  type DailyBar,
  type SeasonalityModel,
} from "@/lib/market/seasonality";
import { yahooQuoteCandidates } from "@/lib/ticker";
import { unstable_cache } from "next/cache";
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

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function fetchSeasonalityBars(ticker: string): Promise<{
  daily: DailyBar[];
}> {
  if (isMarketCircuitOpen("yahoo")) return { daily: [] };
  const yf = await getYahoo();
  const daily: DailyBar[] = [];

  for (const symbol of yahooQuoteCandidates(ticker)) {
    try {
      const dailyChart = await yahooCall(() =>
        yf.chart(symbol, {
          period1: new Date("1993-01-01"),
          period2: new Date(),
          interval: "1d",
        })
      );

      for (const row of dailyChart.quotes ?? []) {
        const rawDate = row.date as Date | string | undefined;
        let date: string | null = null;
        if (rawDate instanceof Date) {
          date = toIsoDate(rawDate);
        } else if (typeof rawDate === "string") {
          date = rawDate.slice(0, 10);
        }
        const open = num(row.open);
        const high = num(row.high);
        const low = num(row.low);
        const close = num(row.close);
        if (!date || open == null || high == null || low == null || close == null) {
          continue;
        }
        daily.push({ date, open, high, low, close });
      }
      if (daily.length > 0) return { daily };
    } catch {
      /* try the next exchange */
    }
  }

  return { daily };
}

async function buildSeasonalityUncached(
  ticker: string
): Promise<SeasonalityModel | null> {
  const symbol = ticker.trim().toUpperCase();
  const { daily } = await fetchSeasonalityBars(symbol);
  if (daily.length < 50) return null;
  return buildSeasonalityModel({ ticker: symbol, daily });
}

/** One shared model per ticker. Weekly calendar shape. Not per-user. */
const getSeasonalityModelShared = unstable_cache(
  async (ticker: string) => buildSeasonalityUncached(ticker),
  ["seasonality-model-v1"],
  { revalidate: 6 * 60 * 60 }
);

export async function getSeasonalityModel(
  ticker: string,
  opts?: { force?: boolean }
): Promise<SeasonalityModel | null> {
  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;
  if (opts?.force) return buildSeasonalityUncached(symbol);
  return getSeasonalityModelShared(symbol);
}
