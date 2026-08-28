/**
 * Market-wide technical reading for Overview.
 *
 * Three gauges (VIX, 14-day RSI of SPY, CNN Fear & Greed) plus the S&P 500
 * versus its 200-day usual price map onto regimes that showed up together
 * in past cycles. The copy names that history. It does not tell anyone
 * what to do with it.
 */

import { downsampleIndices, SPARK_POINTS, SPARK_WINDOW } from "@/lib/market-sentiment-viz";
import { ratingForScore } from "@/lib/market/fear-greed";
import { rsi, sma } from "@/lib/market/indicators";

export type SentimentSpark = {
  price: number[];
  usual: number[];
  /** Session days aligned with price, ISO `YYYY-MM-DD` when we have them. */
  at?: string[];
  /** Downsampled index where the current stretch above/below usual begins. */
  streakFrom?: number | null;
  /** Market days in the spark window, before downsampling. */
  windowDays?: number;
};

export type SentimentMetrics = {
  vix: number | null;
  rsi: number | null;
  /** CNN Fear & Greed for US stocks, 0 to 100. Classification uses this. */
  fearGreed: number | null;
  /** Alternative.me crypto Fear & Greed, shown beside the CNN score. */
  cryptoFearGreed: number | null;
  /** Last SPY close used for the 200-day ratio. */
  spyPrice: number | null;
  sma200: number | null;
  /** (price / sma200) - 1. 0.12 is 12% above the average. */
  smaRatio: number | null;
  /** Market days SPY has sat on this side of the 200-day average. */
  streakDays: number | null;
  /** Median leftover length of completed same-side runs in this sample. */
  typicalMoreDays: number | null;
  /** Current streak is longer than every completed same-side run. */
  alreadyLong: boolean;
  /** Last year of SPY closes against the 200-day average, downsampled. */
  spark: SentimentSpark | null;
  asOf: string | null;
};

export type SentimentRegime =
  | "low-zone"
  | "stretched"
  | "elevated"
  | "trend"
  | "mixed"
  | "unavailable";

export type SentimentDirection = "up" | "down" | "none";

export type SentimentReading = {
  regime: SentimentRegime;
  label: string;
  copy: string;
  pill: "good" | "warn" | "bad" | "brand" | "neutral";
  panel: "default" | "warn" | "danger";
  direction: SentimentDirection;
  /** How closely the gauges match this pattern, 8 to 92. Not a chance of profit. */
  agreementPct: number | null;
};

export const SENTIMENT_COPY: Record<SentimentRegime, string> = {
  "low-zone":
    "Several gauges are at unusually low readings. Historically, a VIX of 32 or more together with a 14-day RSI of 32 or less has sat near a quiet stretch or a market low (2009, 2020, 2022).",
  stretched:
    "The S&P 500 has run a long way above its usual price. In earlier cycles, a Fear and Greed reading this high alongside a 14-day RSI stretched this far often came before a fall back towards that usual price.",
  elevated:
    "The VIX is running high, and the 14-day RSI and Fear & Greed have cooled together. In earlier cycles that pairing showed up when prices were jumpy, not as a clean turn.",
  trend:
    "The S&P 500 is above its usual price, the 14-day RSI is in the middle of its range, and Fear & Greed is above 50.",
  mixed:
    "The gauges do not line up with one historical pattern right now. Readings are mixed.",
  unavailable:
    "Not enough market numbers yet to place a reading.",
};

export const SENTIMENT_SLIDE_COPY =
  "The S&P 500 is below its usual price, the 14-day RSI is in the middle of its range, and Fear & Greed is below 50.";

/** Some gauges arrived, not enough to place a regime. Same pill as waiting. */
export const SENTIMENT_PARTIAL_COPY =
  "Some gauges are in. The rest have not landed, so this is not a full reading yet.";

const ELEVATED_VIX_COPY =
  "The VIX is running high. In earlier cycles that showed up when prices were jumpy, not as a clean turn.";

const ELEVATED_SOFT_COPY =
  "The 14-day RSI and Fear & Greed have cooled together. In earlier cycles that pairing showed up when prices were jumpy, not as a clean turn.";

export const SENTIMENT_LABEL: Record<SentimentRegime, string> = {
  "low-zone": "Historical low zone",
  stretched: "Stretched higher",
  elevated: "Higher swings",
  trend: "Steady climb",
  mixed: "Mixed reading",
  unavailable: "Waiting",
};

export const SENTIMENT_SLIDE_LABEL = "Steady slide";

const PILL: Record<SentimentRegime, SentimentReading["pill"]> = {
  "low-zone": "good",
  stretched: "bad",
  elevated: "warn",
  trend: "good",
  mixed: "neutral",
  unavailable: "neutral",
};

const PANEL: Record<SentimentRegime, SentimentReading["panel"]> = {
  "low-zone": "default",
  stretched: "danger",
  elevated: "warn",
  trend: "default",
  mixed: "default",
  unavailable: "default",
};

export function lastDefined(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

export function smaRatioFrom(
  price: number | null,
  sma200: number | null
): number | null {
  if (price == null || sma200 == null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(sma200) || !(sma200 > 0)) {
    return null;
  }
  return price / sma200 - 1;
}

export function spyMetricsFromCloses(closes: number[]): {
  rsi: number | null;
  sma200: number | null;
  lastClose: number | null;
  smaRatio: number | null;
} {
  const finiteCloses = closes.filter((n) => Number.isFinite(n) && n > 0);
  const lastClose =
    finiteCloses.length > 0 ? finiteCloses[finiteCloses.length - 1]! : null;
  const lastRsi = lastDefined(rsi(finiteCloses, 14));
  const sma200 = lastDefined(sma(finiteCloses, 200));
  return {
    rsi: lastRsi,
    sma200,
    lastClose,
    smaRatio: smaRatioFrom(lastClose, sma200),
  };
}

/** Caption under the Fear & Greed figure. CNN rating, plus crypto when we have it. */
export function fearGreedCaption(
  fearGreed: number | null,
  cryptoFearGreed: number | null
): string {
  const rating =
    fearGreed != null && Number.isFinite(fearGreed)
      ? ratingForScore(fearGreed)
      : null;
  const crypto =
    cryptoFearGreed != null && Number.isFinite(cryptoFearGreed)
      ? `crypto ${Math.round(cryptoFearGreed)}`
      : null;
  if (rating && crypto) return `${rating} · ${crypto}`;
  if (rating) return rating;
  if (crypto) return crypto;
  return "CNN, 0 to 100";
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

export function sentimentGaugesReady(
  metrics: Pick<SentimentMetrics, "vix" | "rsi" | "fearGreed" | "smaRatio">
): boolean {
  return (
    finite(metrics.vix) &&
    finite(metrics.rsi) &&
    finite(metrics.fearGreed) &&
    finite(metrics.smaRatio)
  );
}

export function sentimentHasAnyGauge(
  metrics: Pick<SentimentMetrics, "vix" | "rsi" | "fearGreed" | "smaRatio">
): boolean {
  return (
    finite(metrics.vix) ||
    finite(metrics.rsi) ||
    finite(metrics.fearGreed) ||
    finite(metrics.smaRatio)
  );
}

/**
 * A Yahoo blip that returns VIX and nothing else must not wipe a full
 * reading. Keep the last complete snapshot. Partial is only used when
 * that is all we have ever had.
 */
export function preferSentimentSnapshot(
  prev: SentimentMetrics | null,
  next: SentimentMetrics
): SentimentMetrics {
  const chosen =
    sentimentGaugesReady(next) || !prev
      ? next
      : sentimentGaugesReady(prev)
        ? prev
        : sentimentHasAnyGauge(next)
          ? next
          : prev;
  if (chosen.spark || !prev?.spark) return chosen;
  return { ...chosen, spark: prev.spark };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** 0 at the edges of the band, 1 across the inner 60%. */
function inBand(value: number, lo: number, hi: number): number {
  const span = hi - lo;
  if (!(span > 0)) return 0;
  const t = (value - lo) / span;
  if (t <= 0 || t >= 1) return 0;
  const edge = 0.2;
  if (t < edge) return t / edge;
  if (t > 1 - edge) return (1 - t) / edge;
  return 1;
}

function aboveComfort(value: number, gate: number, full: number): number {
  if (value < gate) return 0;
  if (value >= full) return 1;
  return clamp01((value - gate) / (full - gate));
}

function belowComfort(value: number, gate: number, full: number): number {
  if (value > gate) return 0;
  if (value <= full) return 1;
  return clamp01((gate - value) / (gate - full));
}

function mean(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((s, n) => s + n, 0) / scores.length;
}

function fitPct(scores: number[], cap = 92): number | null {
  const avg = mean(scores);
  if (avg == null) return null;
  return Math.max(8, Math.min(cap, Math.round(avg * cap)));
}

function directionOf(
  smaRatio: number | null,
  regime: SentimentRegime,
  trendDown: boolean
): SentimentDirection {
  if (regime === "trend") return trendDown ? "down" : "up";
  if (smaRatio == null) return "none";
  if (smaRatio > 0.002) return "up";
  if (smaRatio < -0.002) return "down";
  return "none";
}

type GaugeSet = {
  vix: number | null;
  rsiNow: number | null;
  fg: number | null;
  smaRatio: number | null;
};

function scoresFor(
  kind: "low-zone" | "stretched" | "elevated" | "trend-up" | "trend-down",
  g: GaugeSet
): number[] {
  const { vix, rsiNow, fg, smaRatio } = g;
  if (kind === "low-zone") {
    return [
      ...(vix != null ? [aboveComfort(vix, 32, 40)] : []),
      ...(rsiNow != null ? [belowComfort(rsiNow, 32, 20)] : []),
      ...(fg != null ? [belowComfort(fg, 20, 10)] : []),
    ];
  }
  if (kind === "stretched") {
    return [
      ...(rsiNow != null ? [aboveComfort(rsiNow, 74, 82)] : []),
      ...(fg != null ? [aboveComfort(fg, 78, 88)] : []),
      ...(smaRatio != null ? [aboveComfort(smaRatio, 0.12, 0.18)] : []),
    ];
  }
  if (kind === "elevated") {
    return [
      ...(vix != null && vix >= 24 ? [aboveComfort(vix, 24, 32)] : []),
      ...(rsiNow != null && rsiNow < 40 ? [belowComfort(rsiNow, 40, 28)] : []),
      ...(fg != null && fg < 35 ? [belowComfort(fg, 35, 22)] : []),
    ];
  }
  if (kind === "trend-down") {
    return [
      ...(rsiNow != null ? [inBand(rsiNow, 30, 50)] : []),
      ...(fg != null ? [belowComfort(fg, 50, 35)] : []),
      ...(smaRatio != null ? [inBand(smaRatio, -0.12, -0.005)] : []),
      ...(vix != null ? [inBand(vix, 12, 23)] : []),
    ];
  }
  return [
    ...(rsiNow != null ? [inBand(rsiNow, 50, 70)] : []),
    ...(fg != null ? [inBand(fg, 50, 75)] : []),
    ...(smaRatio != null ? [inBand(smaRatio, 0.005, 0.12)] : []),
    ...(vix != null ? [inBand(vix, 12, 23)] : []),
  ];
}

function agreementFor(
  regime: SentimentRegime,
  g: GaugeSet,
  trendDown: boolean
): number | null {
  if (regime === "unavailable") return null;

  if (regime === "low-zone") return fitPct(scoresFor("low-zone", g));
  if (regime === "stretched") return fitPct(scoresFor("stretched", g));
  if (regime === "elevated") return fitPct(scoresFor("elevated", g));
  if (regime === "trend") {
    return fitPct(scoresFor(trendDown ? "trend-down" : "trend-up", g));
  }

  const near = (
    [
      "trend-up",
      "trend-down",
      "elevated",
      "stretched",
      "low-zone",
    ] as const
  )
    .map((kind) => fitPct(scoresFor(kind, g)))
    .filter((n): n is number => n != null);
  if (near.length === 0) return 32;
  return Math.min(49, Math.max(8, Math.round(Math.max(...near) * 0.55)));
}

function medianInt(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * How long SPY has sat on one side of its 200-day average, and how much
 * longer similar completed runs in this window typically had left.
 */
export function spyTrendHistory(closes: number[]): {
  streakDays: number | null;
  typicalMoreDays: number | null;
  alreadyLong: boolean;
} {
  const empty = { streakDays: null, typicalMoreDays: null, alreadyLong: false };
  const prices = closes.filter((n) => Number.isFinite(n) && n > 0);
  const avgs = sma(prices, 200);
  const sides: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    const avg = avgs[i];
    const price = prices[i]!;
    if (avg == null || !(avg > 0)) {
      sides.push(0);
      continue;
    }
    if (price > avg) sides.push(1);
    else if (price < avg) sides.push(-1);
    else sides.push(sides[i - 1] ?? 0);
  }

  type Run = { side: 1 | -1; length: number; from: number };
  const runs: Run[] = [];
  let i = 0;
  while (i < sides.length) {
    while (i < sides.length && sides[i] === 0) i++;
    if (i >= sides.length) break;
    const side = sides[i] as 1 | -1;
    const from = i;
    let length = 0;
    while (i < sides.length && sides[i] === side) {
      length++;
      i++;
    }
    if (length > 0) runs.push({ side, length, from });
  }
  if (runs.length === 0) return empty;

  /*
    The 200-day average does not exist for the first 199 closes, so a run
    that is already under way on the first day we can evaluate has a start
    we cannot see: its measured length is a floor, not a length. The copy
    around this calls the sample "completed stretches", and counting a
    truncated one drags the typical leftover down and makes "already the
    long one" fire on a run that was only the first one in view.

    A run beginning one day later is a different matter, even when the day
    before it sat exactly on the average: that day was evaluable, so the
    run really did start where it looks like it started.
  */
  const firstEvaluable = avgs.findIndex((avg) => avg != null && avg > 0);
  const observed = runs.filter(
    (run) => firstEvaluable < 0 || run.from > firstEvaluable
  );

  const current = runs[runs.length - 1]!;
  const streakDays = current.length;
  const prior = observed
    .filter((run) => run !== current)
    .filter((run) => run.side === current.side);
  const remainders = prior
    .filter((run) => run.length > streakDays)
    .map((run) => run.length - streakDays);
  const typicalMoreDays = medianInt(remainders);
  const alreadyLong =
    prior.length > 0 && prior.every((run) => run.length < streakDays);

  return { streakDays, typicalMoreDays, alreadyLong };
}

function roundSpark(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Last year of SPY vs its 200-day average, small enough to paint and cache. */
export function spySparkFromCloses(
  closes: number[],
  dates?: (string | null | undefined)[],
  streakDays?: number | null
): SentimentSpark | null {
  const dated = dates != null && dates.length === closes.length;
  const prices: number[] = [];
  const keptAt: (string | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    const n = closes[i]!;
    if (!Number.isFinite(n) || !(n > 0)) continue;
    prices.push(n);
    if (dated) keptAt.push(dates[i] ?? null);
  }
  const avgs = sma(prices, 200);
  const price: number[] = [];
  const usual: number[] = [];
  const at: (string | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    const avg = avgs[i];
    if (avg == null || !(avg > 0)) continue;
    price.push(prices[i]!);
    usual.push(avg);
    if (dated) at.push(keptAt[i] ?? null);
  }
  if (price.length < 2) return null;
  const windowP = price.slice(-SPARK_WINDOW);
  const windowU = usual.slice(-SPARK_WINDOW);
  const windowA = at.slice(-SPARK_WINDOW);
  const idx = downsampleIndices(windowP.length, SPARK_POINTS);
  const spark: SentimentSpark = {
    price: idx.map((i) => roundSpark(windowP[i]!)),
    usual: idx.map((i) => roundSpark(windowU[i]!)),
    windowDays: windowP.length,
  };
  if (dated && windowA.length === windowP.length) {
    const days = idx.map((i) => windowA[i] ?? null);
    if (days.every((d): d is string => typeof d === "string" && d.length >= 8)) {
      spark.at = days;
    }
  }
  if (streakDays != null && streakDays >= 5 && windowP.length > 1) {
    const span = Math.min(streakDays, windowP.length);
    const startWin = windowP.length - span;
    const from = idx.findIndex((i) => i >= startWin);
    spark.streakFrom = from < 0 ? 0 : from;
  }
  return spark;
}

function reading(
  regime: SentimentRegime,
  metrics: Pick<SentimentMetrics, "vix" | "rsi" | "fearGreed" | "smaRatio">,
  copy: string = SENTIMENT_COPY[regime],
  trendDown = false
): SentimentReading {
  const g: GaugeSet = {
    vix: finite(metrics.vix) ? metrics.vix : null,
    rsiNow: finite(metrics.rsi) ? metrics.rsi : null,
    fg: finite(metrics.fearGreed) ? metrics.fearGreed : null,
    smaRatio: finite(metrics.smaRatio) ? metrics.smaRatio : null,
  };
  const direction = directionOf(g.smaRatio, regime, trendDown);
  const pill = regime === "trend" && trendDown ? "warn" : PILL[regime];
  const label =
    regime === "trend" && trendDown
      ? SENTIMENT_SLIDE_LABEL
      : SENTIMENT_LABEL[regime];
  return {
    regime,
    label,
    copy,
    pill,
    panel: PANEL[regime],
    direction,
    agreementPct: agreementFor(regime, g, trendDown),
  };
}

/**
 * First match wins. Capitulation is a subset of elevated VIX, so it is
 * checked first. Overextended can coincide with a still-high VIX, and
 * that stretch is the more specific historical pattern.
 */
export function classifyMarketSentiment(
  metrics: Pick<SentimentMetrics, "vix" | "rsi" | "fearGreed" | "smaRatio">
): SentimentReading {
  const vix = finite(metrics.vix) ? metrics.vix : null;
  const rsiNow = finite(metrics.rsi) ? metrics.rsi : null;
  const fg = finite(metrics.fearGreed) ? metrics.fearGreed : null;
  const smaRatio = finite(metrics.smaRatio) ? metrics.smaRatio : null;

  if (vix == null && rsiNow == null && fg == null && smaRatio == null) {
    return reading("unavailable", metrics);
  }

  if (
    vix != null &&
    rsiNow != null &&
    fg != null &&
    vix >= 32 &&
    rsiNow <= 32 &&
    fg <= 20
  ) {
    return reading("low-zone", metrics);
  }

  if (
    rsiNow != null &&
    fg != null &&
    smaRatio != null &&
    rsiNow >= 74 &&
    fg >= 78 &&
    smaRatio > 0.12
  ) {
    return reading("stretched", metrics);
  }

  const highVix = vix != null && vix >= 24;
  const softPair = rsiNow != null && fg != null && rsiNow < 40 && fg < 35;
  if (highVix || softPair) {
    const copy =
      highVix && softPair
        ? SENTIMENT_COPY.elevated
        : highVix
          ? ELEVATED_VIX_COPY
          : ELEVATED_SOFT_COPY;
    return reading("elevated", metrics, copy);
  }

  if (
    rsiNow != null &&
    fg != null &&
    smaRatio != null &&
    rsiNow >= 50 &&
    rsiNow <= 70 &&
    fg > 50 &&
    smaRatio > 0
  ) {
    return reading("trend", metrics);
  }

  if (
    rsiNow != null &&
    fg != null &&
    smaRatio != null &&
    rsiNow >= 30 &&
    rsiNow <= 50 &&
    fg < 50 &&
    smaRatio < 0
  ) {
    return reading("trend", metrics, SENTIMENT_SLIDE_COPY, true);
  }

  // Mixed is "we had every gauge and they did not fit." Three numbers
  // and a hole is not a pattern. It is a waiting state.
  if (
    sentimentGaugesReady({
      vix,
      rsi: rsiNow,
      fearGreed: fg,
      smaRatio,
    })
  ) {
    return reading("mixed", metrics);
  }
  return reading("unavailable", metrics, SENTIMENT_PARTIAL_COPY);
}

function numOrNull(n: unknown): boolean {
  if (n == null) return true;
  return typeof n === "number" && Number.isFinite(n);
}

function isSpark(v: unknown): boolean {
  if (v == null) return true;
  if (!v || typeof v !== "object") return false;
  const o = v as SentimentSpark;
  if (!Array.isArray(o.price) || !Array.isArray(o.usual)) return false;
  if (o.price.length !== o.usual.length) return false;
  if (o.price.length < 2 || o.price.length > 128) return false;
  const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
  if (!o.price.every(ok) || !o.usual.every(ok)) return false;
  if (o.at != null) {
    if (!Array.isArray(o.at) || o.at.length !== o.price.length) return false;
    if (!o.at.every((d) => typeof d === "string" && d.length >= 8)) return false;
  }
  if (o.streakFrom != null) {
    if (!Number.isFinite(o.streakFrom) || o.streakFrom < 0 || o.streakFrom >= o.price.length) {
      return false;
    }
  }
  if (o.windowDays != null && !(typeof o.windowDays === "number" && Number.isFinite(o.windowDays) && o.windowDays > 0)) {
    return false;
  }
  return true;
}

export function isSentimentMetrics(v: unknown): v is SentimentMetrics {
  if (!v || typeof v !== "object") return false;
  const o = v as SentimentMetrics;
  return (
    numOrNull(o.vix) &&
    numOrNull(o.rsi) &&
    numOrNull(o.fearGreed) &&
    numOrNull(o.cryptoFearGreed) &&
    numOrNull(o.spyPrice) &&
    numOrNull(o.sma200) &&
    numOrNull(o.smaRatio) &&
    numOrNull(o.streakDays) &&
    numOrNull(o.typicalMoreDays) &&
    (o.alreadyLong == null || typeof o.alreadyLong === "boolean") &&
    isSpark(o.spark) &&
    (o.asOf == null || typeof o.asOf === "string")
  );
}

const ADVICE_RE =
  /\b(buy now|sell everything|you should|must buy|must sell|guaranteed|guarantee)\b/i;

export function sentimentCopyIsDescriptive(text: string): boolean {
  if (/[\u2014\u2013]/.test(text)) return false;
  if (ADVICE_RE.test(text)) return false;
  return true;
}
