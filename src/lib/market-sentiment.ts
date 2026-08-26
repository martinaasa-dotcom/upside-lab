/**
 * Market-wide technical reading for Overview.
 *
 * Four gauges (VIX, 14-day RSI of SPY, CNN Fear & Greed, SPY vs its
 * 200-day average) map onto regimes that showed up together in past
 * cycles. The copy names that history. It does not tell anyone what to
 * do with it.
 */

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
  "Market sentiment reflects technical indicator logic and historical metrics. It does not constitute personalized investment advice.";

export const SENTIMENT_COPY: Record<SentimentRegime, string> = {
  "low-zone":
    "Several gauges are at unusually low readings. Historically, a VIX above 30 together with a 14-day RSI below 35 has sat near a quiet stretch or a market low (2009, 2020, 2022).",
  stretched:
    "Buying has run far ahead of the 200-day average. In earlier cycles, a Fear & Greed reading this high together with a 14-day RSI this stretched often came before a pullback toward the average.",
  elevated:
    "Prices have cooled and the VIX is elevated. During broader uptrends, stretches like this have often been retested before things settled.",
  trend:
    "The S&P 500 is trading above its 200-day average, with steady buying and a quieter VIX.",
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

export function spyMetricsFromCloses(closes: number[]): {
  rsi: number | null;
  sma200: number | null;
  lastClose: number | null;
  smaRatio: number | null;
} {
  const finite = closes.filter((n) => Number.isFinite(n) && n > 0);
  const lastClose = finite.length > 0 ? finite[finite.length - 1]! : null;
  const lastRsi = lastDefined(rsi(finite, 14));
  const sma200 = lastDefined(sma(finite, 200));
  const smaRatio =
    lastClose != null && sma200 != null && sma200 > 0
      ? lastClose / sma200 - 1
      : null;
  return { rsi: lastRsi, sma200, lastClose, smaRatio };
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
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

  return reading("mixed");
}

export function isSentimentMetrics(v: unknown): v is SentimentMetrics {
  if (!v || typeof v !== "object") return false;
  const o = v as SentimentMetrics;
  const numOrNull = (n: unknown) => n == null || typeof n === "number";
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
