/**
 * About a year and a half of daily closes per ticker, for Upside Fund's
 * rules.
 *
 * The rules read a 200-day average, a 126-day return and a 14-day RSI, so
 * they need about 230 sessions behind today; this asks for more than that
 * so a long weekend or a missing bar never leaves a name short. It runs
 * once a trading day, from the Fund's cron, for about seventy names, so it
 * is pooled rather than fired all at once, and a name the feed cannot
 * answer for is simply absent: the rules then have no read for it and do
 * not trade it, which is the only safe answer to a missing price.
 */

import { yahooQuoteCandidates } from "@/lib/ticker";
import { isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { yahooCall } from "@/lib/market/yahoo";
import { mapWithConcurrency } from "@/lib/market/pool";

export type DailyCloseSeries = { dates: string[]; closes: number[] };

const DAYS_BACK = 420;
const IN_FLIGHT = 6;

type YahooFinanceInstance = InstanceType<typeof import("yahoo-finance2").default>;
let yahooInstance: YahooFinanceInstance | null = null;
async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahooInstance) return yahooInstance;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahooInstance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahooInstance;
}

async function historyFor(
  yf: YahooFinanceInstance,
  ticker: string,
  period1: Date
): Promise<DailyCloseSeries | null> {
  for (const symbol of yahooQuoteCandidates(ticker)) {
    try {
      const chart = await yahooCall(() =>
        yf.chart(symbol, { period1, interval: "1d" })
      );
      const dates: string[] = [];
      const closes: number[] = [];
      for (const row of chart.quotes ?? []) {
        const raw = row.date as Date | string | undefined;
        const close = typeof row.close === "number" ? row.close : null;
        if (!raw || close == null || !Number.isFinite(close) || close <= 0) continue;
        dates.push(
          raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10)
        );
        closes.push(close);
      }
      if (closes.length >= 60) return { dates, closes };
    } catch {
      /* try the next exchange */
    }
  }
  return null;
}

/** Daily closes, oldest first, keyed by the upper-cased ticker asked for. */
export async function fetchDailyCloseHistory(
  tickers: string[]
): Promise<Record<string, DailyCloseSeries>> {
  const unique = [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ];
  if (unique.length === 0 || isMarketCircuitOpen("yahoo")) return {};
  const period1 = new Date(Date.now() - DAYS_BACK * 86_400_000);
  const out: Record<string, DailyCloseSeries> = {};
  try {
    const yf = await getYahoo();
    await mapWithConcurrency(unique, IN_FLIGHT, async (ticker) => {
      const series = await historyFor(yf, ticker, period1);
      if (series) out[ticker] = series;
    });
  } catch (err) {
    console.error("Daily history unavailable", err);
  }
  return out;
}
