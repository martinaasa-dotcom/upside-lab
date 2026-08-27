/**
 * Geometry for the Market reading spark, stretch track, and gauge rows.
 * Pure numbers. The widget only paints what this returns.
 */

export const SPARK_WINDOW = 252;
export const SPARK_POINTS = 64;
/** 12% above usual is the stretched-higher gate. Scale the signed bar to that. */
const SIGNED_FULL = 0.12;
const HALF_CAP = 0.88;
/** Distance from centre, in % of the track, where ±12% lands. */
export const SIGNED_EDGE_PCT = HALF_CAP * 50;
const FILL_FLOOR = 8;
const FILL_CEILING = 92;
/** History keeps at least this share of the spark when a leftover run is drawn. */
const HIST_MIN_FRAC = 0.62;

export function downsampleIndices(length: number, n: number): number[] {
  if (length <= 0) return [];
  if (n <= 1) return [length - 1];
  if (length <= n) return Array.from({ length }, (_, i) => i);
  const last = length - 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.round((i / (n - 1)) * last));
  }
  return out;
}

export function downsampleSeries(values: number[], n: number): number[] {
  return downsampleIndices(values.length, n).map((i) => values[i]!);
}

export function lerpScale(pct: number, lo: number, hi: number): number {
  const t = Math.max(0, Math.min(100, pct)) / 100;
  return lo + t * (hi - lo);
}

/** Inverse of the signed usual-price bar, so a probe on the marker reads the live %. */
export function signedRatioAtPct(pct: number): number {
  const offset = Math.max(-50, Math.min(50, pct - 50));
  if (offset === 0) return 0;
  const mag = Math.min(1, Math.abs(offset) / SIGNED_EDGE_PCT);
  const ratio = mag * SIGNED_FULL;
  return offset < 0 ? -ratio : ratio;
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

/**
 * How many leftover days to draw to the right of today, on the same
 * day-scale as the year spark. Zero when the run is already the long one,
 * or when leftover history is too thin. Caps so the year never shrinks
 * below HIST_MIN_FRAC. Empty space only: never a modelled price.
 */
export function sparkGhostDays(
  windowDays: number,
  typicalMoreDays: number | null,
  alreadyLong: boolean
): number {
  if (alreadyLong || typicalMoreDays == null || typicalMoreDays < 5) return 0;
  if (!(windowDays > 0)) return 0;
  const maxGhost = windowDays * (1 / HIST_MIN_FRAC - 1);
  return Math.min(typicalMoreDays, Math.floor(maxGhost));
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
  height = 56,
  streakFrom: number | null = null,
  ghostDays = 0,
  windowDays = SPARK_WINDOW
): {
  priceLine: string;
  usualLine: string;
  gain: string[];
  loss: string[];
  last: { x: number; y: number; above: boolean };
  probes: { x: number; yPrice: number; yUsual: number }[];
  streak: { x0: number; x1: number } | null;
  ghost: { x0: number; x1: number } | null;
  nowX: number;
} | null {
  if (price.length < 2 || price.length !== usual.length) return null;
  const padL = 2;
  const padR = 8;
  const padT = 6;
  const padB = 6;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const ghost = ghostDays > 0 && windowDays > 0 ? ghostDays : 0;
  const histW =
    ghost > 0 ? innerW * (windowDays / (windowDays + ghost)) : innerW;
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
  const xAt = (i: number) => padL + (i / lastIdx) * histW;
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
  const probes = xs.map((x, i) => ({
    x: (x / width) * 100,
    yPrice: (ysP[i]! / height) * 100,
    yUsual: (ysU[i]! / height) * 100,
  }));
  const from =
    streakFrom != null && streakFrom >= 0 && streakFrom < lastIdx
      ? Math.floor(streakFrom)
      : null;
  const nowX = ((padL + histW) / width) * 100;
  const ghostEnd = ((padL + innerW) / width) * 100;
  return {
    priceLine,
    usualLine,
    gain,
    loss,
    last: {
      x: probes[lastIdx]!.x,
      y: probes[lastIdx]!.yPrice,
      above: lastP >= lastU,
    },
    probes,
    streak:
      from != null
        ? { x0: probes[from]!.x, x1: probes[lastIdx]!.x }
        : null,
    ghost: ghost > 0 ? { x0: nowX, x1: ghostEnd } : null,
    nowX,
  };
}

export function sparkIndexFromClientX(
  clientX: number,
  rect: DOMRect,
  lastIdx: number,
  width = 240,
  histEndX?: number
): number {
  if (rect.width <= 0 || lastIdx <= 0) return 0;
  const padL = 2;
  const padR = 8;
  const innerW = width - padL - padR;
  const histW =
    histEndX != null && histEndX > padL ? histEndX - padL : innerW;
  const x = ((clientX - rect.left) / rect.width) * width;
  if (x > padL + histW) return -1;
  const t = (x - padL) / histW;
  return Math.max(0, Math.min(lastIdx, Math.round(t * lastIdx)));
}

export function pctFromClientX(clientX: number, rect: DOMRect): number {
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
}
