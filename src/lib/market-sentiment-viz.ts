/**
 * Geometry for the Market reading spark, stretch track, and gauge rows.
 * Pure numbers. The widget only paints what this returns.
 */

export const SPARK_WINDOW = 252;
export const SPARK_POINTS = 64;
/** 12% above usual is the stretched-higher gate. Scale the signed bar to that. */
const SIGNED_FULL = 0.12;
const HALF_CAP = 0.88;
const FILL_FLOOR = 8;
const FILL_CEILING = 92;

export function downsampleSeries(values: number[], n: number): number[] {
  if (n <= 1) return values.slice(-1);
  if (values.length <= n) return values;
  const last = values.length - 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i / (n - 1)) * last);
    out.push(values[idx]!);
  }
  return out;
}

export function stretchFillPct(
  streakDays: number | null,
  typicalMoreDays: number | null,
  alreadyLong: boolean
): number | null {
  if (streakDays == null || streakDays < 5) return null;
  if (alreadyLong) return FILL_CEILING;
  if (typicalMoreDays == null || typicalMoreDays < 5) return null;
  const total = streakDays + typicalMoreDays;
  if (!(total > 0)) return null;
  return Math.max(FILL_FLOOR, Math.min(FILL_CEILING, (streakDays / total) * 100));
}

export function linearMarkerPct(
  value: number | null,
  lo: number,
  hi: number
): number | null {
  if (value == null || !Number.isFinite(value) || !(hi > lo)) return null;
  return Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100));
}

export function bandRangePct(
  bandLo: number,
  bandHi: number,
  lo: number,
  hi: number
): { fromPct: number; toPct: number } | null {
  if (!(hi > lo) || !(bandHi > bandLo)) return null;
  const fromPct = Math.max(0, Math.min(100, ((bandLo - lo) / (hi - lo)) * 100));
  const toPct = Math.max(0, Math.min(100, ((bandHi - lo) / (hi - lo)) * 100));
  if (toPct - fromPct < 2) return null;
  return { fromPct, toPct };
}

/** Width as a percent of the full track. Sign is left (neg) or right (pos). */
export function signedTrackFill(ratio: number | null): number | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  if (ratio === 0) return 0;
  const mag = Math.min(1, Math.abs(ratio) / SIGNED_FULL);
  const width = Math.max(0.06, mag * HALF_CAP) * 50;
  return ratio < 0 ? -width : width;
}

function yAt(
  v: number,
  min: number,
  span: number,
  padT: number,
  innerH: number
): number {
  if (!(span > 0)) return padT + innerH / 2;
  return padT + (1 - (v - min) / span) * innerH;
}

export function sentimentSparkLayout(
  price: number[],
  usual: number[],
  width = 240,
  height = 56
): {
  priceLine: string;
  usualLine: string;
  gain: string[];
  loss: string[];
  last: { x: number; y: number; above: boolean };
} | null {
  if (price.length < 2 || price.length !== usual.length) return null;
  const padL = 2;
  const padR = 8;
  const padT = 6;
  const padB = 6;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < price.length; i++) {
    const p = price[i]!;
    const u = usual[i]!;
    if (p < min) min = p;
    if (u < min) min = u;
    if (p > max) max = p;
    if (u > max) max = u;
  }
  const span = max - min;
  const lastIdx = price.length - 1;
  const xAt = (i: number) => padL + (i / lastIdx) * innerW;
  const ysP: number[] = [];
  const ysU: number[] = [];
  const xs: number[] = [];
  for (let i = 0; i < price.length; i++) {
    xs.push(xAt(i));
    ysP.push(yAt(price[i]!, min, span, padT, innerH));
    ysU.push(yAt(usual[i]!, min, span, padT, innerH));
  }
  const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const priceLine = xs.map((x, i) => pt(x, ysP[i]!)).join(" ");
  const usualLine = xs.map((x, i) => pt(x, ysU[i]!)).join(" ");
  const gain: string[] = [];
  const loss: string[] = [];
  for (let i = 0; i < lastIdx; i++) {
    const quad = `${pt(xs[i]!, ysP[i]!)} ${pt(xs[i + 1]!, ysP[i + 1]!)} ${pt(xs[i + 1]!, ysU[i + 1]!)} ${pt(xs[i]!, ysU[i]!)}`;
    const midP = (price[i]! + price[i + 1]!) / 2;
    const midU = (usual[i]! + usual[i + 1]!) / 2;
    if (midP >= midU) gain.push(quad);
    else loss.push(quad);
  }
  const lastP = price[lastIdx]!;
  const lastU = usual[lastIdx]!;
  return {
    priceLine,
    usualLine,
    gain,
    loss,
    last: {
      x: (xs[lastIdx]! / width) * 100,
      y: (ysP[lastIdx]! / height) * 100,
      above: lastP >= lastU,
    },
  };
}
