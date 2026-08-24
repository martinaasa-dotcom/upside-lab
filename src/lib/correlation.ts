/**
 * Do two names move together? Pearson, on returns, never on prices.
 *
 * The panel this feeds asks one question and the reader uses the answer to
 * decide whether they are diversified. Correlating the price series itself
 * cannot answer it: two names that both drifted up over ninety days score
 * near +1 whatever their day to day moves did, because both series are
 * dominated by the same trend. Measured on a pair that rises 0.5% a day
 * with exactly opposite daily wobble, which is a perfect hedge:
 *
 *     on price levels    +0.93
 *     on daily returns   -1.00
 *
 * So the panel told a reader that a hedged pair "rise and fall as one, so
 * holding both spreads your money without spreading your risk", which is
 * the opposite of the truth, on the one question it exists to answer.
 *
 * Differencing first removes the shared trend and leaves the co-movement,
 * which is the thing being asked about, and it is what every published
 * correlation of two securities means.
 */

/**
 * Simple returns between consecutive points, dropping any step that cannot
 * produce one. A sparkline is already downsampled, so a step is not always
 * a day; it is the same step for both series, which is what matters.
 */
export function toReturns(series: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const now = series[i]!;
    if (!Number.isFinite(prev) || !Number.isFinite(now) || prev === 0) continue;
    out.push((now - prev) / prev);
  }
  return out;
}

/**
 * Correlation of two price series, which means correlation of their
 * returns. Use this everywhere a person is shown a number; `pearson` below
 * is the bare statistic and does not know what it has been handed.
 */
export function priceCorrelation(
  a: readonly number[],
  b: readonly number[]
): number | null {
  // Align on the tail before differencing, so a step in one series is the
  // same step in the other. Differencing first and trimming after would
  // pair up moves from different days.
  const n = Math.min(a.length, b.length);
  if (n < 6) return null;
  return pearson(toReturns(a.slice(a.length - n)), toReturns(b.slice(b.length - n)));
}

/** The bare statistic. Feed it returns, not levels. */
export function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const pairs: Array<[number, number]> = [];
  for (let i = a.length - n, j = b.length - n; i < a.length && j < b.length; i++, j++) {
    const x = a[i]!;
    const y = b[j]!;
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push([x, y]);
  }
  if (pairs.length < 5) return null;
  const meanA = pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
  const meanB = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (const [x, y] of pairs) {
    const da = x - meanA;
    const db = y - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  if (!(den > 0)) return null;
  const out = num / den;
  return Number.isFinite(out) ? out : null;
}

export type CorrCell = {
  a: string;
  b: string;
  corr: number;
};

export function correlationMatrix(
  series: Array<{ ticker: string; sparkline: number[] }>
): CorrCell[] {
  const cells: CorrCell[] = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const c = priceCorrelation(series[i]!.sparkline, series[j]!.sparkline);
      if (c == null) continue;
      cells.push({
        a: series[i]!.ticker,
        b: series[j]!.ticker,
        corr: c,
      });
    }
  }
  return cells.sort((x, y) => Math.abs(y.corr) - Math.abs(x.corr));
}

/** Square matrix for heat-grid UI (diagonal = 1). */
export function correlationGrid(
  series: Array<{ ticker: string; sparkline: number[] }>
): { tickers: string[]; grid: (number | null)[][] } {
  const tickers = series.map((s) => s.ticker);
  const grid: (number | null)[][] = tickers.map(() =>
    tickers.map(() => null)
  );
  for (let i = 0; i < series.length; i++) {
    grid[i]![i] = 1;
    for (let j = i + 1; j < series.length; j++) {
      const c = priceCorrelation(series[i]!.sparkline, series[j]!.sparkline);
      grid[i]![j] = c;
      grid[j]![i] = c;
    }
  }
  return { tickers, grid };
}
