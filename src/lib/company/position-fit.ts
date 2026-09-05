/**
 * What buying this would actually do to the portfolio you already have.
 *
 * The question the room is named after cannot be answered by this app, and
 * most of it cannot be answered by anybody. But it has a half that is not
 * an opinion at all: put $2,000 into this and it becomes 7% of everything
 * you own, your biggest group of companies goes from 34% to 41%, and a
 * rough month for it costs you $600, which is 2% of the whole portfolio.
 * Nobody can tell you whether the company is good. Anybody can tell you
 * that, and almost nowhere does.
 *
 * So this file is pure arithmetic on the reader's own rows and it contains
 * no model, no rating and no threshold that decides for them. It says what
 * the numbers become. The one shaped judgement in it is `concentrationNote`,
 * which observes that one holding would be a large share of everything they
 * own, and even that is phrased as an observation with the figure in it
 * rather than as advice.
 *
 * Nothing here writes anything. A reader can move the amount around all day
 * and nothing is bought, which is exactly the point: it is the cheapest
 * possible way to find out what a decision would feel like.
 */
import { sectorForTicker } from "@/lib/thesis-pulse";

export type FitHolding = {
  ticker: string;
  /** What the holding is worth today, in the portfolio's own currency. */
  value: number;
};

export type PositionFit = {
  /** Uppercase, as stored. */
  ticker: string;
  amount: number;
  /** Everything held today, plus cash. */
  portfolioBefore: number;
  /**
   * Everything held after. Buying moves money from cash into shares, so
   * the total is unchanged when the money comes from cash and larger when
   * it does not. This assumes new money, which is what somebody typing an
   * amount into a box means, and the copy says so.
   */
  portfolioAfter: number;
  /** The new holding as a share of everything, after. */
  weight: number;
  /** What they already hold of it, as a share, or null if it is new. */
  weightBefore: number | null;
  /** Where it would rank by size among the holdings. 1 is the biggest. */
  rank: number;
  holdingCount: number;
  /** The group of similar companies it joins, and that group before/after. */
  sector: string | null;
  sectorBefore: number | null;
  sectorAfter: number | null;
  /** The three biggest holdings as a share of the stocks, before and after. */
  topThreeBefore: number;
  topThreeAfter: number;
  /** A quarter off this one holding, in money and as a share of everything. */
  shockDollar: number;
  shockOfPortfolio: number;
};

/** How far this one holding is assumed to fall, for the shock line. */
export const SHOCK_FALL = 0.25;

function topThreeShare(values: number[]): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const top = [...values].sort((a, b) => b - a).slice(0, 3);
  return top.reduce((a, b) => a + b, 0) / total;
}

/**
 * `amount` is new money going in. Cash is counted in the portfolio total
 * both before and after, because a reader comparing "7% of my portfolio"
 * against what they see on Home has to be comparing the same total.
 */
export function positionFit(input: {
  ticker: string;
  amount: number;
  holdings: FitHolding[];
  cash: number;
}): PositionFit | null {
  const ticker = input.ticker.trim().toUpperCase();
  const amount = Number.isFinite(input.amount) ? Math.max(input.amount, 0) : 0;
  if (!ticker) return null;

  const rows = input.holdings
    .filter((h) => Number.isFinite(h.value) && h.value > 0)
    .map((h) => ({ ticker: h.ticker.toUpperCase(), value: h.value }));
  const stocksBefore = rows.reduce((sum, h) => sum + h.value, 0);
  // Borrowed money is a negative cash balance in this app, and it belongs
  // in the total: a reader carrying a loan has a smaller portfolio than
  // their holdings suggest, and a share of it is a bigger share.
  const cash = Number.isFinite(input.cash) ? input.cash : 0;
  const portfolioBefore = stocksBefore + cash;
  const portfolioAfter = portfolioBefore + amount;

  const heldBefore = rows
    .filter((h) => h.ticker === ticker)
    .reduce((sum, h) => sum + h.value, 0);
  const after = rows
    .filter((h) => h.ticker !== ticker)
    .concat([{ ticker, value: heldBefore + amount }]);

  const positionValue = heldBefore + amount;
  const weight = portfolioAfter > 0 ? positionValue / portfolioAfter : 0;

  const sorted = [...after].sort((a, b) => b.value - a.value);
  const rank = sorted.findIndex((h) => h.ticker === ticker) + 1;

  const sector = sectorForTicker(ticker);
  let sectorBefore: number | null = null;
  let sectorAfter: number | null = null;
  if (sector) {
    const inSectorBefore = rows
      .filter((h) => sectorForTicker(h.ticker) === sector)
      .reduce((sum, h) => sum + h.value, 0);
    const stocksAfter = stocksBefore + amount;
    sectorBefore = stocksBefore > 0 ? inSectorBefore / stocksBefore : null;
    sectorAfter =
      stocksAfter > 0 ? (inSectorBefore + amount) / stocksAfter : null;
  }

  return {
    ticker,
    amount,
    portfolioBefore,
    portfolioAfter,
    weight,
    weightBefore:
      heldBefore > 0 && portfolioBefore > 0 ? heldBefore / portfolioBefore : null,
    rank: rank > 0 ? rank : after.length,
    holdingCount: after.length,
    sector,
    sectorBefore,
    sectorAfter,
    topThreeBefore: topThreeShare(rows.map((h) => h.value)),
    topThreeAfter: topThreeShare(after.map((h) => h.value)),
    shockDollar: positionValue * SHOCK_FALL,
    shockOfPortfolio:
      portfolioAfter > 0 ? (positionValue * SHOCK_FALL) / portfolioAfter : 0,
  };
}

/**
 * The one observation this file is allowed to make, and it is an
 * observation rather than advice: it says what the share would be and what
 * that means arithmetically, never what to do about it.
 *
 * A fifth of everything in one company is the line, because that is the
 * point at which one company's bad year is the portfolio's bad year rather
 * than a bad line in it, and saying so is teaching rather than steering.
 */
export function concentrationNote(fit: PositionFit): string | null {
  const pct = Math.round(fit.weight * 100);
  if (pct < 20) return null;
  return `That would make ${fit.ticker} about ${pct}% of everything you own. At that size this one company decides how your year goes more than the rest of the portfolio put together.`;
}

/** Preset amounts, so somebody without a figure in mind still gets an answer. */
export function fitPresets(portfolioValue: number): number[] {
  const base = Number.isFinite(portfolioValue) && portfolioValue > 0
    ? portfolioValue
    : 10_000;
  const raw = [base * 0.01, base * 0.025, base * 0.05, base * 0.1];
  const rounded = raw.map((v) => {
    if (v >= 10_000) return Math.round(v / 1_000) * 1_000;
    if (v >= 1_000) return Math.round(v / 500) * 500;
    if (v >= 100) return Math.round(v / 50) * 50;
    return Math.max(50, Math.round(v / 10) * 10);
  });
  return [...new Set(rounded)].filter((v) => v > 0);
}
