/**
 * Market-wide technical reading for Overview.
 *
 * Four gauges (VIX, 14-day RSI of SPY, CNN Fear & Greed, SPY vs its
 * 200-day average) map onto regimes that showed up together in past
 * cycles. The copy names that history. It does not tell anyone what to
 * do with it.
 */

import { ADVICE_DISCLAIMER_SHORT } from "@/lib/disclaimer";
import { ratingForScore } from "@/lib/market/fear-greed";
import { rsi, sma } from "@/lib/market/indicators";

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
  asOf: string | null;
};

export type SentimentRegime =
  | "low-zone"
  | "stretched"
  | "elevated"
  | "trend"
  | "mixed"
  | "unavailable";

export type SentimentReading = {
  regime: SentimentRegime;
  label: string;
  copy: string;
  pill: "good" | "warn" | "bad" | "brand" | "neutral";
  panel: "default" | "warn" | "danger";
};

export const SENTIMENT_DISCLAIMER =
  `Historical gauges, not a market call. ${ADVICE_DISCLAIMER_SHORT}`;

export const SENTIMENT_COPY: Record<SentimentRegime, string> = {
  "low-zone":
    "Several gauges are at unusually low readings. Historically, a VIX above 30 together with a 14-day RSI below 35 has sat near a quiet stretch or a market low (2009, 2020, 2022).",
  stretched:
    "Price has run far ahead of the 200-day average. In earlier cycles, a Fear & Greed reading this high together with a 14-day RSI this stretched often came before a pullback toward the average.",
  elevated:
    "Either the VIX is running high, or the 14-day RSI and Fear & Greed have cooled together. In earlier cycles that mix showed up when prices were jumpy, not as a clean turn.",
  trend:
    "The S&P 500 is above its 200-day average, the 14-day RSI is in the middle of its range, and Fear & Greed is above 50. That mix has often sat through a stretch of the same direction rather than a turn.",
  mixed:
    "The gauges do not line up with one historical pattern right now. Readings are mixed.",
  unavailable:
    "Not enough market numbers yet to place a reading.",
};

export const SENTIMENT_LABEL: Record<SentimentRegime, string> = {
  "low-zone": "Historical low zone",
  stretched: "Stretched higher",
  elevated: "Higher swings",
  trend: "Steady trend",
  mixed: "Mixed reading",
  unavailable: "Waiting",
};

const PILL: Record<SentimentRegime, SentimentReading["pill"]> = {
  "low-zone": "good",
  stretched: "bad",
  elevated: "warn",
  trend: "brand",
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
  if (sentimentGaugesReady(next) || !prev) return next;
  if (sentimentGaugesReady(prev)) return prev;
  return sentimentHasAnyGauge(next) ? next : prev;
}

function reading(regime: SentimentRegime): SentimentReading {
  return {
    regime,
    label: SENTIMENT_LABEL[regime],
    copy: SENTIMENT_COPY[regime],
    pill: PILL[regime],
    panel: PANEL[regime],
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
    return reading("unavailable");
  }

  if (
    vix != null &&
    rsiNow != null &&
    fg != null &&
    vix >= 32 &&
    rsiNow <= 32 &&
    fg <= 20
  ) {
    return reading("low-zone");
  }

  if (
    rsiNow != null &&
    fg != null &&
    smaRatio != null &&
    rsiNow >= 74 &&
    fg >= 78 &&
    smaRatio > 0.12
  ) {
    return reading("stretched");
  }

  if (
    (vix != null && vix >= 24) ||
    (rsiNow != null && fg != null && rsiNow < 40 && fg < 35)
  ) {
    return reading("elevated");
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
    return reading("trend");
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
    return reading("mixed");
  }
  return reading("unavailable");
}

function numOrNull(n: unknown): boolean {
  if (n == null) return true;
  return typeof n === "number" && Number.isFinite(n);
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
