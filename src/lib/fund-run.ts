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
  entrySignal,
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
  return `Stop at ${usd(stopPrice(pos, read))}; half sold at an RSI of ${FUND_RULES.overboughtRsi}, the rest on the next push; out after six months, or sooner if it falls well behind the S&P 500.`;
}

/**
 * The names closest to qualifying: leaders already in a long uptrend and
 * far enough ahead of the S&P 500, waiting only for one of the two ways
 * in. What each is waiting for is a number, so a reader can watch for it
 * too: a dip to a short-term low, or a close above its three-month high,
 * whichever is nearer.
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
        entrySignal(r) == null
    )
    .map((r) => {
      const toHigh = r.high > 0 ? r.high / r.price - 1 : Infinity;
      const breakoutNear =
        FUND_RULES.breakoutEnabled &&
        r.sma50 > r.sma200 &&
        toHigh >= 0 &&
        toHigh < 0.05;
      // Distance to each way in, on one scale: per cent to the high, or
      // RSI points to the dip divided by ten.
      const dipGap = Math.max(0, r.rsi - FUND_RULES.oversoldRsi) / 10;
      const gap = breakoutNear ? Math.min(toHigh * 100, dipGap) : dipGap;
      const waitFor =
        breakoutNear && toHigh * 100 <= dipGap
          ? `A close above ${usd(r.high)}, its highest of the last three months (now ${usd(r.price)}).`
          : `A pullback to an RSI of ${FUND_RULES.oversoldRsi} (now ${r.rsi.toFixed(0)}) while it holds above ${usd(r.sma200)}.`;
      return { ticker: r.ticker, gap, waitFor };
    })
    .sort((a, b) => a.gap - b.gap)
    .slice(0, count)
    .map(({ ticker, waitFor }) => ({ ticker, waitFor }));
}

/**
 * The trading days a run should write, oldest first.
 *
 * Every day after the last report up to the last finished session, and
 * all of them in one run: a backlog used to drain one day per run, so a
 * fund that started again a week back took days to catch up and set off
 * the backlog alarm on the way. With no report yet the Fund starts on its
 * inception date rather than on today, which is what lets a restart be
 * replayed from the day it says it started. A day the benchmark has no
 * close for (a holiday, or a close the feed has not published yet) is
 * left out, because trading it would trade yesterday's prices under
 * today's date.
 */
export function fundDaysToRun(input: {
  lastReportDate: string | null;
  inceptionDate: string | null;
  latestSession: string;
  /** Days the benchmark closed on; absent to skip that filter. */
  benchDates?: readonly string[];
  /** `tradingDaysBetween`, passed in so this stays free of the clock. */
  between: (fromExclusive: string, toInclusive: string) => string[];
}): string[] {
  const { lastReportDate, inceptionDate, latestSession } = input;
  let days: string[];
  if (lastReportDate) {
    days = input.between(lastReportDate, latestSession);
  } else if (inceptionDate && inceptionDate <= latestSession) {
    days = input.between(dayBefore(inceptionDate), latestSession);
  } else {
    days = [latestSession];
  }
  if (!input.benchDates) return days;
  const traded = new Set(input.benchDates);
  return days.filter((d) => traded.has(d));
}

function dayBefore(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Is the race's start line in the benchmark's own units?
 *
 * The first report's `spy_price` is where the index's line starts. The
 * run that started on 2026-09-26 started under the QQQ code and wrote
 * QQQ's close ($744.50) there; the reset meant to restart it against SPY
 * was never applied, so the SPY code carried on from that row and drew
 * the index against SPY's real $771.35, 3.6% ahead before either had
 * moved. Checked on every run against the benchmark's own
 * close that day, so a repeat is an error the day it happens rather than
 * a chart somebody has to notice is wrong.
 */
export function startLineOff(input: {
  firstReportDate: string | null;
  firstReportPrice: number | null;
  benchSeries: { dates: readonly string[]; closes: readonly number[] };
}): number | null {
  const { firstReportDate, firstReportPrice, benchSeries } = input;
  if (!firstReportDate || !(firstReportPrice && firstReportPrice > 0)) return null;
  const i = benchSeries.dates.indexOf(firstReportDate);
  if (i < 0) return null;
  const close = benchSeries.closes[i]!;
  const off = firstReportPrice / close - 1;
  return Math.abs(off) > 0.01 ? off : null;
}
