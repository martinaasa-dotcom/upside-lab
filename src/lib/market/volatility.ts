/**
 * Realized volatility, and the step it was measured over.
 *
 * This drives Call %, so it decides how far out of the money a reader is
 * told to write, and it is one multiplication away from being quietly
 * wrong. Annualizing multiplies by the square root of 252, which is only
 * right if one step is one trading day. It is today: the one caller,
 * `pickCallPct`, is reached only from `buildWritePlan`, which fetches its
 * own chart and hands over the full daily close series.
 *
 * The trap is the sparkline sitting right beside it. That is the same
 * closes downsampled to at most 32 points for drawing, so over a ninety
 * day window a step is about 2.9 days, and it is already passed around as
 * `price_history` through `/api/options/scan`. Wiring it in here would look
 * like an obvious simplification and would overstate volatility by about
 * sqrt(2.9). Measured over 200 random walks built to a true 20% annual
 * volatility:
 *
 *     true daily close HV     0.201
 *     from the sparkline      0.341     1.69x
 *
 * The buckets in `callPctFromVolatility` turn at 0.28, so that is a
 * genuinely low-volatility name measured as a mid or high one, and a reader
 * told to write a strike further out than the name deserves. Nothing on the
 * screen would look broken.
 *
 * So the period is a named argument rather than an assumption, and it
 * defaults to the only value that is currently correct. A series that is
 * not daily has to say so out loud.
 *
 * The other half of the same rule: the series has to be real.
 * `synthesizeSparkline` draws a smooth line with a sine wave on it when a
 * provider has a price but no history, and the volatility of that is a
 * property of the drawing.
 */

/** Trading days in a year, the convention every volatility figure uses. */
export const TRADING_DAYS_PER_YEAR = 252;

/**
 * Annualized realized volatility from a close series, or null when there
 * is not enough of it to mean anything.
 *
 * `tradingDaysPerStep` is how many trading days separate two points. It is
 * 1 for a daily close series, which is the only thing that should normally
 * be passed here; anything else has to say so.
 */
export function realizedVolAnnual(
  prices: readonly number[],
  opts?: { tradingDaysPerStep?: number }
): number | null {
  const perStep = opts?.tradingDaysPerStep ?? 1;
  if (!Number.isFinite(perStep) || perStep <= 0) return null;
  if (prices.length < 8) return null;

  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1];
    const b = prices[i];
    if (Number.isFinite(a) && Number.isFinite(b) && a! > 0 && b! > 0) {
      rets.push(Math.log(b! / a!));
    }
  }
  if (rets.length < 5) return null;

  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance =
    rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const out = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR / perStep);
  return Number.isFinite(out) && out > 0 ? out : null;
}
