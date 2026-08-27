/**
 * The shape of one holding's forecast path, drawn on a scale the whole grid
 * shares.
 *
 * The card sparks used to scale each holding to its own smallest and largest
 * price, which is the right answer for a chart on its own and the wrong one
 * for nine side by side: a path ending +84% and a path ending +257% each
 * filled the same 56px box, so every card in the grid drew the same rise.
 * A reader looking at nine of them said they all had the same trajectory,
 * "as if everyone gets rich", and that was not a taste complaint. It was
 * the drawing being wrong. Nine cards that rhyme cannot be compared, and
 * comparing them is the only reason five forecasts sit on one screen.
 *
 * Two decisions fix it, and both have to hold together.
 *
 * **The axis is percent from today, not dollars.** A $60 stock and an $830
 * fund cannot share a dollar axis, and the reader is not asking "which is
 * more expensive". Today is 0 on every card.
 *
 * **The bounds come from every card at once.** So today lands on the same
 * pixel row everywhere, the biggest mover in the portfolio is the only one
 * that reaches the top of its box, and a steady fund draws a visibly
 * flatter line than the name beside it. That flat line is information, and
 * self-scaling was throwing it away.
 */

export type SparkBounds = {
  /** Lowest fraction from today across the grid. Never above 0. */
  min: number;
  /** Highest fraction from today across the grid. Never below 0. */
  max: number;
};

export type SparkBox = {
  width: number;
  height: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
};

export type SparkGeometry = {
  /** `points` for the path itself. */
  line: string;
  /** `points` for the fill under it, closed along the bottom. */
  area: string;
  /** Where today sits. Same row on every card, which is the whole point. */
  baseY: number;
  /** The end dot, in percent of the box, because the viewBox is stretched. */
  dotLeft: number;
  dotTop: number;
};

/**
 * The smallest range the axis will ever show.
 *
 * A portfolio where nothing moves has no top or bottom to scale to, and
 * dividing by that span is how a spark becomes a NaN or a line pinned to an
 * edge. It is also a real reading: 2% of span means a path that ends half a
 * percent from today draws as nearly flat rather than being stretched into
 * a story it does not have.
 */
export const SPARK_MIN_SPAN = 0.02;

/**
 * Prices to fractions from the first price.
 *
 * Returns null rather than an empty list when there is nothing to draw, so
 * a caller cannot accidentally render an axis with no path on it.
 */
export function sparkSeries(prices: readonly number[]): number[] | null {
  const usable = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (usable.length < 2) return null;
  const base = usable[0]!;
  if (base <= 0) return null;
  return usable.map((p) => (p - base) / base);
}

/**
 * One axis for the whole grid.
 *
 * Zero is always inside the bounds, because today's dashed rule has to be
 * on the card even for a holding whose path only ever rises.
 */
export function sharedSparkBounds(
  series: readonly (readonly number[])[]
): SparkBounds {
  let min = 0;
  let max = 0;
  for (const one of series) {
    for (const v of one) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const span = max - min;
  if (span >= SPARK_MIN_SPAN) return { min, max };
  // Widen both ways rather than one, so a flat grid keeps today in the
  // middle of the box instead of hard against the top or the bottom.
  const pad = (SPARK_MIN_SPAN - span) / 2;
  return { min: min - pad, max: max + pad };
}

/** Where a fraction from today falls in the box, top down. */
export function sparkY(
  value: number,
  bounds: SparkBounds,
  box: SparkBox
): number {
  const innerH = box.height - box.padT - box.padB;
  const span = bounds.max - bounds.min;
  if (!(span > 0)) return box.padT + innerH / 2;
  return box.padT + (1 - (value - bounds.min) / span) * innerH;
}

/**
 * Everything the SVG needs, from a series and the grid's shared bounds.
 *
 * Kept out of the component because the bug this file exists to stop was
 * geometry, and geometry that lives in JSX is geometry nothing checks.
 */
export function sparkGeometry(
  series: readonly number[],
  bounds: SparkBounds,
  box: SparkBox
): SparkGeometry | null {
  if (series.length < 2) return null;
  const innerW = box.width - box.padL - box.padR;
  const lastIdx = series.length - 1;
  const xAt = (i: number) => box.padL + (i / lastIdx) * innerW;
  const yAt = (v: number) => sparkY(v, bounds, box);
  const line = series
    .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
    .join(" ");
  const floor = (box.height - box.padB).toFixed(1);
  return {
    line,
    area: `${xAt(0).toFixed(1)},${floor} ${line} ${xAt(lastIdx).toFixed(1)},${floor}`,
    baseY: yAt(0),
    dotLeft: (xAt(lastIdx) / box.width) * 100,
    dotTop: (yAt(series[lastIdx]!) / box.height) * 100,
  };
}
