/**
 * How far a company actually moves when the market moves, from its own
 * prices rather than from a number somebody typed.
 *
 * `book-shock.ts` says it plainly about its own table: nothing in it was
 * measured or modelled, and it is shaped by what these sectors have
 * broadly done. That was a small exposure while the table covered ninety
 * names a person had chosen. It is a larger one now that a sector routes
 * most of the market into it, because the figure on a Risk card is a
 * number about the reader's own holding and it was a judgement about a
 * category the holding had been sorted into.
 *
 * The app already holds what is needed. Every quote carries a sparkline,
 * which is the same window for every name because it comes from one walk,
 * so a company and the index can be compared over exactly the same days
 * with no extra fetch at all.
 *
 * What this can and cannot do is the important part, and the copy that
 * reads it has to keep saying so. It measures one thing, how far this
 * company has swung against the market lately, which is what four of the
 * nine scenarios turn on. It says nothing about the others: how a company
 * fares when oil doubles or a supply chain breaks is not in a few weeks of
 * closes, and those stay the typed judgement they always were.
 */

/**
 * Fewer than this and the answer is noise dressed as a measurement.
 *
 * Twenty daily moves is about a month of trading, which is short for this
 * and is what the sparkline carries. It is enough to separate a utility
 * from a chip maker and nowhere near enough to argue about the second
 * decimal, so nothing here prints one.
 */
const MIN_RETURNS = 20;

/**
 * The same bounds `shockBeta` already clamps its broad-market reading to.
 *
 * A month of closes can throw up an absurd figure from one gap or one
 * results day, and a portfolio row saying a company falls three times as
 * far as the market because of a single print is worse than the typed
 * guess it replaced.
 */
const MIN_BETA = -1.2;
const MAX_BETA = 2.6;

export type MeasuredBeta = {
  beta: number;
  /** Daily moves the figure was worked out from, for the disclosure. */
  points: number;
};

function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    const now = closes[i]!;
    if (!(prev > 0) || !(now > 0)) return [];
    out.push(now / prev - 1);
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * This company's beta against the market, or null when the prices cannot
 * support one.
 *
 * The two series are lined up from the most recent day backwards rather
 * than from the start. They come from one provider walk so they are
 * usually the same length, and when they are not it is because one name
 * listed later or missed a day: the recent end is the part they share.
 */
export function measuredBeta(
  holdingCloses: number[] | undefined,
  marketCloses: number[] | undefined
): MeasuredBeta | null {
  if (!holdingCloses || !marketCloses) return null;
  const span = Math.min(holdingCloses.length, marketCloses.length);
  if (span < MIN_RETURNS + 1) return null;

  const own = dailyReturns(holdingCloses.slice(holdingCloses.length - span));
  const market = dailyReturns(marketCloses.slice(marketCloses.length - span));
  if (own.length < MIN_RETURNS || own.length !== market.length) return null;

  const ownMean = mean(own);
  const marketMean = mean(market);
  let covariance = 0;
  let variance = 0;
  for (let i = 0; i < own.length; i++) {
    const dm = market[i]! - marketMean;
    covariance += (own[i]! - ownMean) * dm;
    variance += dm * dm;
  }
  // A market that did not move has no slope to measure against.
  if (!(variance > 0)) return null;

  const raw = covariance / variance;
  if (!Number.isFinite(raw)) return null;
  return {
    beta: Math.min(MAX_BETA, Math.max(MIN_BETA, raw)),
    points: own.length,
  };
}

/**
 * Betas for a whole portfolio, keyed by ticker, skipping the names whose
 * prices cannot support one.
 */
export function measuredBetas(
  holdings: { ticker: string; sparkline?: number[] }[],
  marketCloses: number[] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of holdings) {
    const read = measuredBeta(h.sparkline, marketCloses);
    if (read) out[h.ticker.toUpperCase()] = read.beta;
  }
  return out;
}
