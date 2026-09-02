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
  signedRatioAtPct,
  stretchFillPct,
} from "@/lib/market-sentiment-viz";
import { formatDateTime } from "@/lib/timezone";

const MIN_HISTORY_DAYS = 5;

export type SentimentScaleTick = { pct: number; label: string };
export type SentimentZone = { lo: number; hi: number; label: string };
export type SentimentTrackFill = {
  fromPct: number;
  toPct: number;
  className: string;
};

export type SentimentGaugeNote = {
  label: string;
  value: string;
  sub: string;
  explain: string;
  valueClassName?: string;
  kind: "linear" | "signed";
  markerPct: number | null;
  fills: SentimentTrackFill[];
  signedFillPct: number | null;
  dotClass: string;
  scaleLo: number | null;
  scaleHi: number | null;
  scaleDigits: number;
  zones: SentimentZone[];
  ticks: SentimentScaleTick[];
};

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
  fitLine: string;
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

/*
 * A one-word sentence with no subject is not how a person talks, and
 * "Upward. The S&P 500 is above its usual price ..." was the first thing on
 * the card. These say what is trending instead.
 */
function directionLead(direction: SentimentReading["direction"]): string | null {
  if (direction === "up") return "The market is trending up.";
  if (direction === "down") return "The market is trending down.";
  return null;
}

export function sentimentLead(reading: SentimentReading): string {
  const head = directionLead(reading.direction);
  if (!head) return reading.copy;
  if (reading.copy.startsWith("The market is trending")) {
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
): string {
  if (pct == null) return "S&P 500";
  const match = `${pct}% match this reading`;
  if (daysLiveOnStretch) return `S&P 500 · ${match}`;
  const streak = metrics?.streakDays;
  if (!metrics || streak == null || streak < MIN_HISTORY_DAYS) {
    return `S&P 500 · ${match}`;
  }
  return `S&P 500 · ${match} · ${streak} days ${sideWord(metrics.smaRatio)} usual`;
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
    return `In this sample, stretches like this typically ran ${marketDaysPhrase(more)} more before the price came back to its usual level.`;
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
        ? `Past runs lasted ${marketDaysPhrase(metrics.typicalMoreDays)} longer`
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
    "How jumpy US stocks have been lately. Under 15 is unusually quiet. 15 to 25 is the normal range. Around 30 is a scare.";
  if (vix == null) {
    return { sub: "Cboe volatility", explain: explainBase, glance: "none" };
  }
  const n = number(vix, 2);
  if (vix < 15) {
    return {
      sub: "Unusually quiet",
      explain: `${explainBase} This reading of ${n} is unusually quiet.`,
      glance: "up",
    };
  }
  if (vix <= 25) {
    return {
      sub: "Normal",
      explain: `${explainBase} This reading of ${n} is in the normal range.`,
      glance: "none",
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
    "How fast the S&P 500 has moved over the last 14 days. Near 30 the recent drop has been hard. Near 70 the recent rise has been fast. The bar runs from 20 to 80, and only stretches if the reading is outside that.";
  if (rsiNow == null) {
    return {
      sub: "The S&P 500 over 14 days",
      explain: explainBase,
      glance: "none",
    };
  }
  const n = number(rsiNow, 1);
  if (rsiNow <= 32) {
    return {
      sub: "A hard drop",
      explain: `${explainBase} ${n} means the recent drop has been hard.`,
      glance: "down",
    };
  }
  /*
   * One neutral band across the middle, colour only at the ends.
   *
   * This used to turn orange at 48.6 and green at 50.1, so a reading a hair
   * under the midpoint wore a caution colour and a hair over wore a good
   * one, with nothing different about what the number meant. Both are the
   * middle of the range, and the middle of a range is not a verdict.
   */
  if (rsiNow <= 68) {
    return {
      sub: "Middle of its range",
      explain: `${explainBase} ${n} is in the middle of that range.`,
      glance: "none",
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
    "CNN's 0 to 100 score for how fearful or greedy US stock investors look. Under 25 is extreme fear. Over 75 is extreme greed.";
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
  /*
   * Neither end of this scale is good or bad for the reader, so neither is
   * painted as a gain or a loss. The card's own copy says extreme fear has
   * sat near a market low (2009, 2020, 2022), which is the opposite of what
   * a red number teaches; both extremes are simply unusual, and the middle
   * is ordinary.
   */
  if (fearGreed <= 25) return { sub: rating, explain, glance: "warn" };
  if (fearGreed >= 75) return { sub: rating, explain, glance: "warn" };
  return { sub: rating, explain, glance: "none" };
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
  { lo: 0, hi: 15, label: "Unusually quiet" },
  { lo: 15, hi: 25, label: "Normal" },
  { lo: 25, hi: 30, label: "A bit jumpy" },
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

const VIX_SCALE = { lo: 10, hi: 40 } as const;
const RSI_BASE = { lo: 20, hi: 80 };

/**
 * A track whose ends open rather than pinning the marker.
 *
 * The base range is where a reading normally sits and where the coloured
 * bands are drawn. `linearMarkerPct` clamps to the track, so a reading past
 * an end parks the marker on the edge and stops moving: two very different
 * readings then draw the same picture, next to a number that says otherwise.
 *
 * One rule for both gauges, because VIX had a fixed 10 to 40 while RSI
 * opened, and the day that difference shows is a day the VIX is at 60 and
 * the reader has opened this panel to find out how bad it is.
 */
function openTrackScale(
  value: number | null,
  base: { lo: number; hi: number },
  bounds: { min?: number; max?: number } = {}
): { lo: number; hi: number } {
  if (value == null || !Number.isFinite(value)) {
    return { lo: base.lo, hi: base.hi };
  }
  const floorAt = (n: number) =>
    bounds.min == null ? n : Math.max(bounds.min, n);
  const ceilAt = (n: number) => (bounds.max == null ? n : Math.min(bounds.max, n));
  let lo = base.lo;
  let hi = base.hi;
  // Out to the next round ten, so the axis labels stay readable.
  if (value < base.lo) lo = floorAt(Math.floor(value / 10) * 10);
  if (value > base.hi) hi = ceilAt(Math.ceil(value / 10) * 10);
  // And to the reading itself if a bound clipped the round number short.
  if (value < lo) lo = floorAt(Math.floor(value));
  if (value > hi) hi = ceilAt(Math.ceil(value));
  return { lo, hi };
}

/** RSI sits on 20 to 80, and cannot leave 0 to 100. */
export function rsiTrackScale(rsi: number | null): { lo: number; hi: number } {
  return openTrackScale(rsi, RSI_BASE, { min: 0, max: 100 });
}

/**
 * The VIX sits on 10 to 40. Unlike RSI it has no ceiling: it printed above
 * 80 in March 2020 and above 60 in August 2024, so the top end is left open.
 */
export function vixTrackScale(vix: number | null): { lo: number; hi: number } {
  return openTrackScale(vix, VIX_SCALE, { min: 0 });
}

function trackFills(
  scaleLo: number,
  scaleHi: number,
  bands: Array<{ lo: number; hi: number; className: string }>
): SentimentTrackFill[] {
  return bands.flatMap((band) => {
    const range = bandRangePct(band.lo, band.hi, scaleLo, scaleHi);
    return range ? [{ ...range, className: band.className }] : [];
  });
}

export function sentimentGaugeNotes(metrics: SentimentMetrics): SentimentGaugeNote[] {
  const vix = vixGlance(metrics.vix);
  const rsiNow = rsiGlance(metrics.rsi);
  const fear = fearGlance(metrics.fearGreed, metrics.cryptoFearGreed);
  const rsiScale = rsiTrackScale(metrics.rsi);
  const vixScale = vixTrackScale(metrics.vix);
  return [
    {
      label: "VIX",
      value: number(metrics.vix, 2),
      sub: vix.sub,
      explain: vix.explain,
      valueClassName: glanceClass(vix.glance),
      kind: "linear",
      markerPct: linearMarkerPct(metrics.vix, vixScale.lo, vixScale.hi),
      fills: trackFills(vixScale.lo, vixScale.hi, [
        { lo: vixScale.lo, hi: 15, className: "bg-gain/20" },
        { lo: 15, hi: 25, className: "bg-foreground/20" },
        { lo: 25, hi: 30, className: "bg-caution/20" },
        { lo: 30, hi: vixScale.hi, className: "bg-loss/20" },
      ]),
      signedFillPct: null,
      dotClass: glanceDot(vix.glance),
      scaleLo: vixScale.lo,
      scaleHi: vixScale.hi,
      scaleDigits: 2,
      zones: VIX_ZONES,
      ticks: [
        { pct: 0, label: String(vixScale.lo) },
        { pct: 100, label: String(vixScale.hi) },
      ],
    },
    {
      label: "RSI",
      value: number(metrics.rsi, 1),
      sub: rsiNow.sub,
      explain: rsiNow.explain,
      valueClassName: glanceClass(rsiNow.glance),
      kind: "linear",
      markerPct: linearMarkerPct(metrics.rsi, rsiScale.lo, rsiScale.hi),
      fills: trackFills(rsiScale.lo, rsiScale.hi, [
        { lo: rsiScale.lo, hi: 30, className: "bg-loss/20" },
        { lo: 30, hi: 70, className: "bg-foreground/20" },
        { lo: 70, hi: rsiScale.hi, className: "bg-loss/20" },
      ]),
      signedFillPct: null,
      dotClass: glanceDot(rsiNow.glance),
      scaleLo: rsiScale.lo,
      scaleHi: rsiScale.hi,
      scaleDigits: 1,
      zones: RSI_ZONES,
      ticks: [
        { pct: 0, label: String(rsiScale.lo) },
        { pct: 100, label: String(rsiScale.hi) },
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
      fills: trackFills(0, 100, [
        { lo: 0, hi: 25, className: "bg-warning/40" },
        { lo: 25, hi: 45, className: "bg-warning/20" },
        { lo: 55, hi: 75, className: "bg-warning/20" },
        { lo: 75, hi: 100, className: "bg-warning/40" },
      ]),
      signedFillPct: null,
      dotClass: glanceDot(fear.glance),
      scaleLo: 0,
      scaleHi: 100,
      scaleDigits: 0,
      zones: FEAR_ZONES,
      ticks: [
        { pct: 0, label: "0" },
        { pct: 100, label: "100" },
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
