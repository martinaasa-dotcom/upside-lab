/**
 * Shared live mark for the Upside Portfolio (cash + open holdings at
 * quote, else cost basis). Overview teaser and Fund page must use this
 * same formula so they never disagree.
 */

import { finiteNumber, roundMoney, safeDiv, sumMoney } from "@/lib/money";

export type FundMarkHolding = {
  ticker: string;
  shares: number;
  cost_basis: number;
  status?: string;
};

export function liveFundTotalValue(input: {
  cash: number;
  holdings: FundMarkHolding[];
  quotes: Record<string, { price?: number } | undefined>;
}): number {
  const open = input.holdings.filter(
    (h) => !h.status || h.status === "open"
  );
  const holdingsValue = sumMoney(
    open.map((h) => {
      const quoted = input.quotes[h.ticker]?.price;
      const px =
        typeof quoted === "number" && Number.isFinite(quoted)
          ? quoted
          : finiteNumber(h.cost_basis);
      return finiteNumber(h.shares) * px;
    })
  );
  return roundMoney(finiteNumber(input.cash) + holdingsValue);
}

/**
 * How much of that total is a real price, and how much is what he paid.
 *
 * `liveFundTotalValue` falls back to the cost basis for a company whose
 * quote did not arrive, which is the right fallback: the alternative is a
 * portfolio value that drops by a whole holding whenever one provider has
 * a bad minute. What was wrong is that the page then printed the answer
 * under a green dot saying "Live, just now" with nothing anywhere saying
 * part of it had not moved since the day it was bought. A total leaning on
 * a stale figure is fine; a total leaning on one silently is not.
 */
export function fundQuoteCoverage(input: {
  holdings: FundMarkHolding[];
  quotes: Record<string, { price?: number } | undefined>;
}): { priced: number; unpriced: string[] } {
  const open = input.holdings.filter((h) => !h.status || h.status === "open");
  const unpriced: string[] = [];
  let priced = 0;
  for (const h of open) {
    const quoted = input.quotes[h.ticker]?.price;
    if (typeof quoted === "number" && Number.isFinite(quoted) && quoted > 0) {
      priced += 1;
    } else {
      unpriced.push(h.ticker);
    }
  }
  return { priced, unpriced };
}

/**
 * Everything the fund has made or lost since it started.
 *
 * The percentage is **null** when there is no starting capital to measure
 * against, rather than zero. The page used to write
 * `starting_capital > 0 ? ... : 0`, so a fund row that had not loaded, or
 * one whose starting figure was missing, printed a flat "0.0%" return as a
 * fact. Nothing about that number was true, and a zero is the one wrong
 * answer a reader has no reason to question.
 */
export function fundTotalReturn(input: {
  liveTotal: number;
  startingCapital: number | null | undefined;
}): { dollar: number | null; pct: number | null } {
  const start = input.startingCapital;
  if (start == null || !Number.isFinite(start) || start <= 0) {
    return { dollar: null, pct: null };
  }
  const dollar = roundMoney(finiteNumber(input.liveTotal) - start);
  return { dollar, pct: safeDiv(dollar, start) };
}

/**
 * The benchmark's own move since the fund's first day, or null.
 *
 * Same rule as above and for the same reason: with no inception price and
 * no live price there is nothing to compare against, and answering zero
 * draws a flat line across the chart that says the market did nothing.
 */
export function spyReturnSince(input: {
  inceptionPrice: number | null | undefined;
  livePrice: number | null | undefined;
}): number | null {
  const from = input.inceptionPrice;
  const to = input.livePrice;
  if (from == null || to == null) return null;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return (to - from) / from;
}

/** Live NAV minus the last daily snapshot. Same math on Overview and Fund. */
export function liveFundTodayMove(input: {
  liveTotal: number;
  lastReportValue: number | null | undefined;
}): { todayDollar: number; todayPct: number | null } {
  const prev = input.lastReportValue;
  const live = finiteNumber(input.liveTotal);
  if (prev == null || !Number.isFinite(prev)) {
    return { todayDollar: 0, todayPct: null };
  }
  const todayDollar = roundMoney(live - prev);
  return {
    todayDollar,
    todayPct: prev > 0 ? safeDiv(todayDollar, prev) : null,
  };
}

export function fundDayNumber(inceptionDate: string | null | undefined): number {
  if (!inceptionDate) return 1;
  const start = new Date(`${inceptionDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start)) return 1;
  return Math.max(1, Math.floor((Date.now() - start) / 86_400_000) + 1);
}
