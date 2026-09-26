/**
 * The pure half of one Upside Fund trading day: turning what is stored
 * into what `fund-strategy.ts` needs, and its answer back into words.
 *
 * Kept apart from the cron route so every step that decides money can be
 * tested without a database or a network: the route only reads, calls
 * these, and writes.
 */

import {
  FUND_BENCHMARK,
  FUND_RULES,
  readTicker,
  stopPrice,
  type FundPosition,
  type TickerRead,
} from "@/lib/fund-strategy";
import type { DailyCloseSeries } from "@/lib/market/daily-history";
import type { FundHolding } from "@/lib/margus-fund";

/** Closes on or before `day`, so a catch-up run never reads the future. */
export function closesThrough(series: DailyCloseSeries, day: string): DailyCloseSeries {
  let end = series.dates.length;
  while (end > 0 && series.dates[end - 1]! > day) end -= 1;
  return { dates: series.dates.slice(0, end), closes: series.closes.slice(0, end) };
}

/** Every read the rules need for `day`, keyed by ticker. */
export function readsFor(
  history: Record<string, DailyCloseSeries>,
  day: string
): { reads: Record<string, TickerRead>; bench: TickerRead | null } {
  const benchSeries = history[FUND_BENCHMARK];
  if (!benchSeries) return { reads: {}, bench: null };
  const bench = closesThrough(benchSeries, day).closes;
  const reads: Record<string, TickerRead> = {};
  for (const [ticker, series] of Object.entries(history)) {
    if (ticker === FUND_BENCHMARK) continue;
    const r = readTicker(ticker, closesThrough(series, day).closes, bench);
    if (r) reads[ticker] = r;
  }
  return { reads, bench: readTicker(FUND_BENCHMARK, bench, bench) };
}

/**
 * The stored holdings as the rules see them.
 *
 * Two things the rules need are not stored, on purpose, so the new engine
 * needed no new columns: how far each holding has run (its highest close
 * since it was bought, read off its own history) and whether half of it
 * has already been sold into strength (read off the Fund's own reports,
 * which record every trade). The benchmark row is not a company: it is the
 * money waiting for the next setup, and it comes back as `parkedShares`.
 */
export function positionsFromHoldings(input: {
  holdings: FundHolding[];
  history: Record<string, DailyCloseSeries>;
  day: string;
  /** Tickers that had half sold into strength since they were bought. */
  trimmedSince: (ticker: string, entryDate: string) => boolean;
}): { positions: FundPosition[]; parkedShares: number } {
  const positions: FundPosition[] = [];
  let parkedShares = 0;
  for (const h of input.holdings) {
    const ticker = h.ticker.toUpperCase();
    if (ticker === FUND_BENCHMARK) {
      parkedShares += Number(h.shares);
      continue;
    }
    const series = input.history[ticker];
    let peak = Number(h.cost_basis);
    let daysHeld = 0;
    if (series) {
      const through = closesThrough(series, input.day);
      for (let i = 0; i < through.dates.length; i += 1) {
        if (through.dates[i]! < h.entry_date) continue;
        if (through.dates[i]! > h.entry_date) daysHeld += 1;
        peak = Math.max(peak, through.closes[i]!);
      }
    }
    positions.push({
      ticker,
      shares: Number(h.shares),
      entryPrice: Number(h.cost_basis),
      daysHeld,
      peak,
      trimmed: input.trimmedSince(ticker, h.entry_date),
    });
  }
  return { positions, parkedShares };
}

const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One checkable line on a holding the rules left alone today. */
export function holdLine(pos: FundPosition, read: TickerRead): string {
  const gain = read.price / pos.entryPrice - 1;
  const stop = stopPrice(pos, read);
  const sign = gain >= 0 ? "+" : "";
  return `${sign}${(gain * 100).toFixed(1)}% since it was bought. RSI ${read.rsi.toFixed(0)}, stop at ${usd(stop)}.`;
}

/**
 * The plan a new holding is bought with, written down on the day it is
 * bought: the stop as a price, and the two ways it is sold.
 */
export function exitPlanFor(read: TickerRead): string {
  const pos: FundPosition = {
    ticker: read.ticker,
    shares: 0,
    entryPrice: read.price,
    daysHeld: 0,
    peak: read.price,
    trimmed: false,
  };
  return `Stop at ${usd(stopPrice(pos, read))}; half sold at an RSI of ${FUND_RULES.overboughtRsi}, the rest on the next push; out after twelve months.`;
}

/**
 * The names closest to qualifying: leaders already in a long uptrend and
 * far enough ahead of the Nasdaq 100, waiting only for the pullback. What
 * each is waiting for is a number, so a reader can watch for it too.
 */
export function watchlistFrom(
  reads: Record<string, TickerRead>,
  held: Set<string>,
  count = 4
): { ticker: string; waitFor: string }[] {
  return Object.values(reads)
    .filter(
      (r) =>
        !held.has(r.ticker) &&
        r.price > r.sma200 &&
        r.strength > FUND_RULES.minStrength &&
        r.rsiLow > FUND_RULES.oversoldRsi
    )
    .sort((a, b) => a.rsi - b.rsi)
    .slice(0, count)
    .map((r) => ({
      ticker: r.ticker,
      waitFor: `A pullback to an RSI of ${FUND_RULES.oversoldRsi} (now ${r.rsi.toFixed(0)}) while it holds above ${usd(r.sma200)}.`,
    }));
}
