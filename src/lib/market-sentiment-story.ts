/**
 * Reader-facing Market reading: one short body, compact gauges, InfoTip
 * explainers. Classification stays in market-sentiment.ts.
 */

import { number, signedPercent } from "@/lib/format";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  classifyMarketSentiment,
  fearGreedCaption,
  type SentimentMetrics,
  type SentimentReading,
} from "@/lib/market-sentiment";

const MIN_HISTORY_DAYS = 5;

export type SentimentGaugeNote = {
  label: string;
  value: string;
  sub: string;
  explain: string;
  valueClassName?: string;
};

export type SentimentCard = {
  reading: SentimentReading;
  lead: string;
  fitLine: string | null;
  gauges: SentimentGaugeNote[];
};

export function marketDaysPhrase(days: number): string {
  if (days < 5) return "a few days";
  const weeks = Math.round(days / 5);
  if (weeks === 1) return "about a week";
  if (weeks === 2) return "about 2 weeks";
  if (weeks < 8) return `about ${weeks} weeks`;
  const months = Math.round(days / 21);
  if (months <= 1) return "about a month";
  return `about ${months} months`;
}

function directionLead(direction: SentimentReading["direction"]): string | null {
  if (direction === "up") return "Upward.";
  if (direction === "down") return "Downward.";
  return null;
}

export function sentimentLead(reading: SentimentReading): string {
  const head = directionLead(reading.direction);
  if (!head) return reading.copy;
  if (reading.copy.startsWith("Upward") || reading.copy.startsWith("Downward")) {
    return reading.copy;
  }
  return `${head} ${reading.copy}`;
}

function sideWord(smaRatio: number | null): "above" | "below" {
  return smaRatio != null && smaRatio < 0 ? "below" : "above";
}

export function sentimentFitLine(
  pct: number | null,
  metrics?: Pick<SentimentMetrics, "streakDays" | "smaRatio">
): string | null {
  if (pct == null) return null;
  const streak = metrics?.streakDays;
  if (!metrics || streak == null || streak < MIN_HISTORY_DAYS) {
    return `${pct}% fit to this pattern`;
  }
  return `${pct}% fit · ${streak} days ${sideWord(metrics.smaRatio)} usual`;
}

/** What history did, not a repeat of how long this stretch already is. */
export function sentimentHistoryLine(metrics: SentimentMetrics): string | null {
  const streak = metrics.streakDays;
  if (streak == null || streak < MIN_HISTORY_DAYS) return null;
  if (metrics.alreadyLong) {
    return "This run is already longer than every completed stretch in this sample.";
  }
  const more = metrics.typicalMoreDays;
  if (more != null && more >= MIN_HISTORY_DAYS) {
    return `In this sample, stretches like this typically ran ${marketDaysPhrase(more)} more before price came back to usual.`;
  }
  return null;
}

export function sentimentBody(
  reading: SentimentReading,
  metrics: SentimentMetrics
): string {
  const lead = sentimentLead(reading);
  const history = sentimentHistoryLine(metrics);
  return history ? `${lead} ${history}` : lead;
}

function glanceClass(kind: "up" | "down" | "warn" | "none"): string | undefined {
  if (kind === "up") return "text-gain";
  if (kind === "down") return "text-loss";
  if (kind === "warn") return "text-caution";
  return undefined;
}

function vixGlance(vix: number | null): {
  sub: string;
  explain: string;
  glance: "up" | "down" | "warn" | "none";
} {
  const explainBase =
    "How jumpy US stocks have been lately. 12 to 20 is quiet. Around 30 is a scare.";
  if (vix == null) {
    return { sub: "Cboe volatility", explain: explainBase, glance: "none" };
  }
  const n = number(vix, 2);
  if (vix < 12) {
    return {
      sub: "Unusually quiet",
      explain: `${explainBase} This reading of ${n} is unusually quiet.`,
      glance: "up",
    };
  }
  if (vix <= 20) {
    return {
      sub: "Quiet",
      explain: `${explainBase} This reading of ${n} is quiet.`,
      glance: "up",
    };
  }
  if (vix < 30) {
    return {
      sub: "A bit jumpy",
      explain: `${explainBase} This reading of ${n} is a bit jumpy, not a scare.`,
      glance: "warn",
    };
  }
  return {
    sub: "A scare",
    explain: `${explainBase} This reading of ${n} is a scare.`,
    glance: "down",
  };
}

function rsiGlance(rsiNow: number | null): {
  sub: string;
  explain: string;
  glance: "up" | "down" | "warn" | "none";
} {
  const explainBase =
    "How fast SPY has moved over the last 14 days. Near 30 the recent drop has been hard. Near 70 the recent rise has been fast.";
  if (rsiNow == null) {
    return { sub: "14-day SPY", explain: explainBase, glance: "none" };
  }
  const n = number(rsiNow, 1);
  if (rsiNow <= 32) {
    return {
      sub: "A hard drop",
      explain: `${explainBase} ${n} means the recent drop has been hard.`,
      glance: "down",
    };
  }
  if (rsiNow < 50) {
    return {
      sub: "On the low side",
      explain: `${explainBase} ${n} is on the low side of the middle.`,
      glance: "warn",
    };
  }
  if (rsiNow <= 70) {
    return {
      sub: "Mid-range",
      explain: `${explainBase} ${n} is in the middle.`,
      glance: "up",
    };
  }
  return {
    sub: "A fast rise",
    explain: `${explainBase} ${n} means the recent rise has been fast.`,
    glance: "warn",
  };
}

function fearGlance(
  fearGreed: number | null,
  cryptoFearGreed: number | null
): {
  sub: string;
  explain: string;
  glance: "up" | "down" | "warn" | "none";
} {
  const explainBase =
    "CNN's 0 to 100 score for how fearful or greedy US stock investors look. Under 25 is panic. Over 75 is a party.";
  const sub = fearGreedCaption(fearGreed, cryptoFearGreed);
  if (fearGreed == null) {
    const crypto =
      cryptoFearGreed != null
        ? ` Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`
        : "";
    return { sub, explain: `${explainBase}${crypto}`, glance: "none" };
  }
  const n = number(fearGreed, 0);
  const rating = ratingForScore(fearGreed);
  const crypto =
    cryptoFearGreed != null
      ? ` Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`
      : "";
  const explain = `${explainBase} ${n} is called ${rating}.${crypto}`;
  if (fearGreed <= 25) return { sub, explain, glance: "down" };
  if (fearGreed <= 45) return { sub, explain, glance: "warn" };
  if (fearGreed <= 55) return { sub, explain, glance: "none" };
  if (fearGreed <= 75) return { sub, explain, glance: "up" };
  return { sub, explain, glance: "warn" };
}

function usualGlance(metrics: SentimentMetrics): {
  sub: string;
  explain: string;
  glance: "up" | "down" | "warn" | "none";
} {
  const explainBase =
    "How far the S&P 500 is from its typical price over about the last year. That typical price is the average of the last 200 days the market was open. Above means this year has mostly been a climb. Below means a slide.";
  const streak = metrics.streakDays;
  const streakBit =
    streak != null && streak >= MIN_HISTORY_DAYS ? `${streak} days` : null;
  if (metrics.smaRatio == null) {
    return {
      sub: "Vs the last year",
      explain: `${explainBase} Past 12% above has often faded back toward usual.`,
      glance: "none",
    };
  }
  const n = signedPercent(metrics.smaRatio);
  if (metrics.smaRatio > 0.12) {
    return {
      sub: streakBit ? `Stretched, ${streakBit}` : "Stretched",
      explain: `${explainBase} ${n} is that far stretch. Past 12% has often faded back toward usual.`,
      glance: "warn",
    };
  }
  if (metrics.smaRatio > 0.002) {
    return {
      sub: streakBit ? `Above, ${streakBit}` : "Above usual",
      explain: `${explainBase} ${n} is a healthy lead, not the far stretch that starts past 12%.`,
      glance: "up",
    };
  }
  if (metrics.smaRatio < -0.002) {
    return {
      sub: streakBit ? `Below, ${streakBit}` : "Below usual",
      explain: `${explainBase} ${n} means price is under that typical level.`,
      glance: "down",
    };
  }
  return {
    sub: "Right on it",
    explain: `${explainBase} ${n} is sitting right on that typical price.`,
    glance: "none",
  };
}

export function sentimentGaugeNotes(metrics: SentimentMetrics): SentimentGaugeNote[] {
  const vix = vixGlance(metrics.vix);
  const rsiNow = rsiGlance(metrics.rsi);
  const fear = fearGlance(metrics.fearGreed, metrics.cryptoFearGreed);
  const usual = usualGlance(metrics);
  return [
    {
      label: "VIX",
      value: number(metrics.vix, 2),
      sub: vix.sub,
      explain: vix.explain,
      valueClassName: glanceClass(vix.glance),
    },
    {
      label: "RSI",
      value: number(metrics.rsi, 1),
      sub: rsiNow.sub,
      explain: rsiNow.explain,
      valueClassName: glanceClass(rsiNow.glance),
    },
    {
      label: "Fear & Greed",
      value: number(metrics.fearGreed, 0),
      sub: fear.sub,
      explain: fear.explain,
      valueClassName: glanceClass(fear.glance),
    },
    {
      label: "Usual price",
      value: signedPercent(metrics.smaRatio),
      sub: usual.sub,
      explain: usual.explain,
      valueClassName: glanceClass(usual.glance),
    },
  ];
}

export function buildSentimentCard(metrics: SentimentMetrics): SentimentCard {
  const reading = classifyMarketSentiment(metrics);
  return {
    reading,
    lead: sentimentBody(reading, metrics),
    fitLine: sentimentFitLine(reading.agreementPct, metrics),
    gauges: sentimentGaugeNotes(metrics),
  };
}
