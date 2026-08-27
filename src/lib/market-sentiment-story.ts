/**
 * Reader-facing Market reading: one short body, compact gauges, InfoTip
 * explainers. Classification stays in market-sentiment.ts.
 */

import { currency, number, signedPercent } from "@/lib/format";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  classifyMarketSentiment,
  type SentimentMetrics,
  type SentimentReading,
  type SentimentSpark,
} from "@/lib/market-sentiment";
import {
  bandRangePct,
  lerpScale,
  linearMarkerPct,
  SIGNED_EDGE_PCT,
  signedRatioAtPct,
  signedTrackFill,
  stretchFillPct,
} from "@/lib/market-sentiment-viz";
import { formatDateTime } from "@/lib/timezone";

const MIN_HISTORY_DAYS = 5;

export type SentimentGaugeNote = {
  label: string;
  value: string;
  sub: string;
  explain: string;
  valueClassName?: string;
  kind: "linear" | "signed";
  markerPct: number | null;
  band: { fromPct: number; toPct: number } | null;
  bandClass?: string;
  signedFillPct: number | null;
  dotClass: string;
  scaleLo: number | null;
  scaleHi: number | null;
  scaleDigits: number;
  zones: SentimentZone[];
  ticks: SentimentScaleTick[];
};

export type SentimentScaleTick = { pct: number; label: string };
export type SentimentZone = { lo: number; hi: number; label: string };

export type SentimentStretch = {
  fillPct: number;
  inLabel: string;
  moreLabel: string;
  above: boolean;
  streakDays: number;
  typicalMoreDays: number | null;
  alreadyLong: boolean;
  typicalTotalDays: number | null;
};

export type SentimentCard = {
  reading: SentimentReading;
  lead: string;
  fitLine: string | null;
  gauges: SentimentGaugeNote[];
  spark: SentimentSpark | null;
  stretch: SentimentStretch | null;
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
  metrics?: Pick<SentimentMetrics, "streakDays" | "smaRatio">,
  daysLiveOnStretch = false
): string | null {
  if (pct == null) return null;
  if (daysLiveOnStretch) return `${pct}% fit`;
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

function titleRating(rating: string): string {
  return rating.charAt(0).toUpperCase() + rating.slice(1);
}

function glanceClass(kind: "up" | "down" | "warn" | "none"): string | undefined {
  if (kind === "up") return "text-gain";
  if (kind === "down") return "text-loss";
  if (kind === "warn") return "text-caution";
  return undefined;
}

function glanceDot(kind: "up" | "down" | "warn" | "none"): string {
  if (kind === "up") return "bg-gain";
  if (kind === "down") return "bg-loss";
  if (kind === "warn") return "bg-caution";
  return "bg-foreground";
}

export function sentimentStretch(metrics: SentimentMetrics): SentimentStretch | null {
  const fillPct = stretchFillPct(
    metrics.streakDays,
    metrics.typicalMoreDays,
    metrics.alreadyLong === true
  );
  if (fillPct == null || metrics.streakDays == null) return null;
  const side = sideWord(metrics.smaRatio);
  return {
    fillPct,
    inLabel: `${metrics.streakDays} days ${side} usual`,
    moreLabel: metrics.alreadyLong
      ? "Already the long one in this sample"
      : metrics.typicalMoreDays != null
        ? `Typically ${marketDaysPhrase(metrics.typicalMoreDays)} more`
        : "",
    above: side === "above",
    streakDays: metrics.streakDays,
    typicalMoreDays: metrics.typicalMoreDays,
    alreadyLong: metrics.alreadyLong === true,
    typicalTotalDays:
      metrics.alreadyLong || metrics.typicalMoreDays == null
        ? null
        : metrics.streakDays + metrics.typicalMoreDays,
  };
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
  if (fearGreed == null) {
    const crypto =
      cryptoFearGreed != null
        ? ` Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`
        : "";
    return {
      sub: "CNN, 0 to 100",
      explain: `${explainBase}${crypto}`,
      glance: "none",
    };
  }
  const n = number(fearGreed, 0);
  const rating = titleRating(ratingForScore(fearGreed));
  const crypto =
    cryptoFearGreed != null
      ? ` Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`
      : "";
  const explain = `${explainBase} ${n} is called ${rating.toLowerCase()}.${crypto}`;
  if (fearGreed <= 25) return { sub: rating, explain, glance: "down" };
  if (fearGreed <= 45) return { sub: rating, explain, glance: "warn" };
  if (fearGreed <= 55) return { sub: rating, explain, glance: "none" };
  if (fearGreed <= 75) return { sub: rating, explain, glance: "up" };
  return { sub: rating, explain, glance: "warn" };
}

function usualGlance(metrics: Pick<SentimentMetrics, "smaRatio">): {
  sub: string;
  explain: string;
  glance: "up" | "down" | "warn" | "none";
} {
  const explainBase =
    "How far the S&P 500 is from its typical price over about the last year. That typical price is the average of the last 200 days the market was open. Above means this year has mostly been a climb. Below means a slide.";
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
      sub: "Stretched",
      explain: `${explainBase} ${n} is that far stretch. Past 12% has often faded back toward usual.`,
      glance: "warn",
    };
  }
  if (metrics.smaRatio > 0.002) {
    return {
      sub: "Above usual",
      explain: `${explainBase} ${n} is a healthy lead, not the far stretch that starts past 12%.`,
      glance: "up",
    };
  }
  if (metrics.smaRatio < -0.002) {
    return {
      sub: "Below usual",
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

export function zoneLabel(
  value: number,
  zones: SentimentZone[]
): string | null {
  for (const zone of zones) {
    if (value >= zone.lo && value < zone.hi) return zone.label;
  }
  const last = zones[zones.length - 1];
  if (last && value >= last.lo && value <= last.hi) return last.label;
  return null;
}

export function linearProbeCopy(gauge: SentimentGaugeNote, pct: number): string {
  if (gauge.scaleLo == null || gauge.scaleHi == null) return gauge.sub;
  const value = lerpScale(pct, gauge.scaleLo, gauge.scaleHi);
  const formatted = number(value, gauge.scaleDigits);
  const zone =
    gauge.label === "VIX"
      ? vixGlance(value).sub
      : gauge.label === "RSI"
        ? rsiGlance(value).sub
        : gauge.label === "Fear & Greed"
          ? fearGlance(value, null).sub
          : zoneLabel(value, gauge.zones);
  return zone ? `${formatted} · ${zone}` : formatted;
}

export function signedProbeCopy(gauge: SentimentGaugeNote, pct: number): string {
  const ratio = signedRatioAtPct(pct);
  const formatted = signedPercent(ratio);
  const zone = usualGlance({ smaRatio: ratio }).sub;
  return `${formatted} · ${zone}`;
}

export function stretchProbeCopy(stretch: SentimentStretch, pct: number): string {
  if (stretch.alreadyLong) return stretch.moreLabel;
  const total = stretch.typicalTotalDays;
  if (total == null || !(total > 0)) return stretch.inLabel;
  const days = Math.round((Math.max(0, Math.min(100, pct)) / 100) * total);
  return `${days} days of a typical ${marketDaysPhrase(total)}`;
}

export function sparkProbeCopy(
  price: number,
  usual: number,
  at?: string | null
): { date: string; vs: string; ratio: number } {
  const ratio = usual > 0 ? price / usual - 1 : 0;
  const date = at ? formatDateTime(at, { month: "short", day: "numeric" }) : "";
  return {
    date,
    vs: `${currency(price, 0)} vs usual ${currency(usual, 0)}`,
    ratio,
  };
}

const VIX_ZONES: SentimentZone[] = [
  { lo: 0, hi: 12, label: "Unusually quiet" },
  { lo: 12, hi: 20, label: "Quiet" },
  { lo: 20, hi: 30, label: "A bit jumpy" },
  { lo: 30, hi: Number.POSITIVE_INFINITY, label: "A scare" },
];

const RSI_ZONES: SentimentZone[] = [
  { lo: 0, hi: 32, label: "A hard drop" },
  { lo: 32, hi: 50, label: "On the low side" },
  { lo: 50, hi: 70, label: "Mid-range" },
  { lo: 70, hi: Number.POSITIVE_INFINITY, label: "A fast rise" },
];

const FEAR_ZONES: SentimentZone[] = [
  { lo: 0, hi: 25, label: "Extreme fear" },
  { lo: 25, hi: 45, label: "Fear" },
  { lo: 45, hi: 55, label: "Neutral" },
  { lo: 55, hi: 75, label: "Greed" },
  { lo: 75, hi: Number.POSITIVE_INFINITY, label: "Extreme greed" },
];

const USUAL_ZONES: SentimentZone[] = [
  { lo: Number.NEGATIVE_INFINITY, hi: -0.002, label: "Below usual" },
  { lo: -0.002, hi: 0.002, label: "Right on it" },
  { lo: 0.002, hi: 0.12, label: "Above usual" },
  { lo: 0.12, hi: Number.POSITIVE_INFINITY, label: "Stretched" },
];

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
      kind: "linear",
      markerPct: linearMarkerPct(metrics.vix, 10, 40),
      band: bandRangePct(12, 20, 10, 40),
      bandClass: "bg-foreground/20",
      signedFillPct: null,
      dotClass: glanceDot(vix.glance),
      scaleLo: 10,
      scaleHi: 40,
      scaleDigits: 2,
      zones: VIX_ZONES,
      ticks: [
        { pct: 0, label: "10" },
        { pct: linearMarkerPct(16, 10, 40) ?? 20, label: "Quiet" },
        { pct: 100, label: "40" },
      ],
    },
    {
      label: "RSI",
      value: number(metrics.rsi, 1),
      sub: rsiNow.sub,
      explain: rsiNow.explain,
      valueClassName: glanceClass(rsiNow.glance),
      kind: "linear",
      markerPct: linearMarkerPct(metrics.rsi, 0, 100),
      band: bandRangePct(30, 70, 0, 100),
      bandClass: "bg-foreground/20",
      signedFillPct: null,
      dotClass: glanceDot(rsiNow.glance),
      scaleLo: 0,
      scaleHi: 100,
      scaleDigits: 1,
      zones: RSI_ZONES,
      ticks: [
        { pct: 0, label: "0" },
        { pct: 50, label: "Mid" },
        { pct: 100, label: "100" },
      ],
    },
    {
      label: "Fear & Greed",
      value: number(metrics.fearGreed, 0),
      sub: fear.sub,
      explain: fear.explain,
      valueClassName: glanceClass(fear.glance),
      kind: "linear",
      markerPct: linearMarkerPct(metrics.fearGreed, 0, 100),
      band: null,
      signedFillPct: null,
      dotClass: glanceDot(fear.glance),
      scaleLo: 0,
      scaleHi: 100,
      scaleDigits: 0,
      zones: FEAR_ZONES,
      ticks: [
        { pct: 0, label: "Panic" },
        { pct: 50, label: "50" },
        { pct: 100, label: "Party" },
      ],
    },
    {
      label: "Usual price",
      value: signedPercent(metrics.smaRatio),
      sub: usual.sub,
      explain: usual.explain,
      valueClassName: glanceClass(usual.glance),
      kind: "signed",
      markerPct: null,
      band: null,
      signedFillPct: signedTrackFill(metrics.smaRatio),
      dotClass: glanceDot(usual.glance),
      scaleLo: -0.12,
      scaleHi: 0.12,
      scaleDigits: 1,
      zones: USUAL_ZONES,
      ticks: [
        { pct: 50 - SIGNED_EDGE_PCT, label: "-12%" },
        { pct: 50, label: "Usual" },
        { pct: 50 + SIGNED_EDGE_PCT, label: "+12%" },
      ],
    },
  ];
}

export function buildSentimentCard(metrics: SentimentMetrics): SentimentCard {
  const reading = classifyMarketSentiment(metrics);
  const stretch = sentimentStretch(metrics);
  return {
    reading,
    lead: sentimentBody(reading, metrics),
    fitLine: sentimentFitLine(reading.agreementPct, metrics, stretch != null),
    gauges: sentimentGaugeNotes(metrics),
    spark: metrics.spark,
    stretch,
  };
}
