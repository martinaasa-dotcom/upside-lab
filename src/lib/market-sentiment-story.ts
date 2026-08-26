/**
 * Reader-facing Market reading: direction, pattern fit, history, gauge
 * notes, and a daily aside. Classification stays in market-sentiment.ts.
 * This file only writes the sentences.
 */

import { number, signedPercent } from "@/lib/format";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  classifyMarketSentiment,
  fearGreedCaption,
  sentimentHasAnyGauge,
  type SentimentMetrics,
  type SentimentReading,
} from "@/lib/market-sentiment";
import { hashSeed, mulberry32, pick } from "@/lib/seeded-rng";
import { dateKeyInTz } from "@/lib/timezone";

const MARKET_TZ = "America/New_York";
const MIN_HISTORY_DAYS = 5;

export type SentimentGaugeNote = {
  label: string;
  value: string;
  sub: string;
  tone?: "up" | "down";
};

export type SentimentCard = {
  reading: SentimentReading;
  lead: string;
  fitLine: string | null;
  history: string | null;
  gauges: SentimentGaugeNote[];
  fact: string | null;
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

export function sentimentFitLine(pct: number | null): string | null {
  if (pct == null) return null;
  return `${pct}% fit to this pattern`;
}

function sideWord(smaRatio: number | null): "above" | "below" {
  return smaRatio != null && smaRatio < 0 ? "below" : "above";
}

export function sentimentHistoryLine(metrics: SentimentMetrics): string | null {
  const streak = metrics.streakDays;
  if (streak == null || streak < MIN_HISTORY_DAYS) return null;
  const side = sideWord(metrics.smaRatio);
  if (metrics.alreadyLong) {
    return `SPY has sat ${side} its 200-day average for ${streak} market days, longer than every completed stretch in this sample of daily prices.`;
  }
  const more = metrics.typicalMoreDays;
  if (more != null && more >= MIN_HISTORY_DAYS) {
    return `SPY has sat ${side} its 200-day average for ${streak} market days. In this sample of daily prices, stretches like this typically ran ${marketDaysPhrase(more)} more before price met the average again.`;
  }
  return `SPY has sat ${side} its 200-day average for ${streak} market days.`;
}

function vixNote(vix: number | null): string {
  const base =
    "The VIX is a number for how jumpy US stocks have been, not a forecast. 12 to 20 is a quiet stretch. Around 30 is a scare.";
  if (vix == null) return base;
  const n = number(vix, 2);
  if (vix < 12) {
    return `${base} This reading of ${n} is unusually sleepy.`;
  }
  if (vix <= 20) {
    return `${base} This reading of ${n} sits in the quiet band.`;
  }
  if (vix < 30) {
    return `${base} This reading of ${n} is a bit jumpy, not a scare.`;
  }
  return `${base} This reading of ${n} is scare territory.`;
}

function rsiNote(rsiNow: number | null): string {
  const base =
    "RSI is a 14-day speedometer for SPY. Near 30 the recent drop has been hard. Near 70 the recent run has been fast.";
  if (rsiNow == null) return base;
  const n = number(rsiNow, 1);
  if (rsiNow <= 32) {
    return `${base} ${n} is a hard recent drop.`;
  }
  if (rsiNow < 50) {
    return `${base} ${n} is on the slow side of the middle.`;
  }
  if (rsiNow <= 70) {
    return `${base} ${n} is walking, not sprinting.`;
  }
  return `${base} ${n} is a fast recent run.`;
}

function fearNote(
  fearGreed: number | null,
  cryptoFearGreed: number | null
): string {
  const base =
    "Fear & Greed is CNN's 0 to 100 mood score for US stocks. Under 25 is panic. Over 75 is a party.";
  if (fearGreed == null) {
    if (cryptoFearGreed == null) return `${base} ${fearGreedCaption(null, null)}.`;
    return `${base} Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`;
  }
  const rating = ratingForScore(fearGreed);
  const n = number(fearGreed, 0);
  const crypto =
    cryptoFearGreed != null
      ? ` Coins sit at ${Math.round(cryptoFearGreed)} on their own score.`
      : "";
  return `${base} ${n} is called ${rating}.${crypto}`;
}

function smaNote(smaRatio: number | null): string {
  const base =
    "This is SPY versus the average of the last 200 days. Above means the last year-ish has been a climb. Below means a slide.";
  if (smaRatio == null) {
    return `${base} The far stretch that often faded started past 12%.`;
  }
  const n = signedPercent(smaRatio);
  if (smaRatio > 0.12) {
    return `${base} ${n} is that far stretch.`;
  }
  if (smaRatio > 0.002) {
    return `${base} ${n} is a solid lead, not the far stretch that starts past 12%.`;
  }
  if (smaRatio < -0.002) {
    return `${base} ${n} means price is under that average.`;
  }
  return `${base} ${n} is sitting right on the average.`;
}

export function sentimentGaugeNotes(metrics: SentimentMetrics): SentimentGaugeNote[] {
  const smaTone: "up" | "down" | undefined =
    metrics.smaRatio == null
      ? undefined
      : metrics.smaRatio > 0.002
        ? "up"
        : metrics.smaRatio < -0.002
          ? "down"
          : undefined;
  return [
    {
      label: "VIX",
      value: number(metrics.vix, 2),
      sub: vixNote(metrics.vix),
    },
    {
      label: "RSI",
      value: number(metrics.rsi, 1),
      sub: rsiNote(metrics.rsi),
    },
    {
      label: "Fear & Greed",
      value: number(metrics.fearGreed, 0),
      sub: fearNote(metrics.fearGreed, metrics.cryptoFearGreed),
    },
    {
      label: "vs 200-day",
      value: signedPercent(metrics.smaRatio),
      sub: smaNote(metrics.smaRatio),
      tone: smaTone,
    },
  ];
}

function sessionDateLabel(asOf: string): string {
  const d = new Date(asOf);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MARKET_TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

type FactCtx = {
  date: string;
  vix: number | null;
  rsi: number | null;
  fg: number | null;
  crypto: number | null;
  smaRatio: number | null;
  streak: number | null;
  alreadyLong: boolean;
  more: number | null;
  direction: SentimentReading["direction"];
  label: string;
};

type FactMaker = (ctx: FactCtx) => string | null;

const FACTS: FactMaker[] = [
  ({ date, vix }) =>
    vix == null
      ? null
      : `On ${date}, the VIX sat at ${number(vix, 2)}. That is a jumpy-or-quiet number for US stocks, and ${vix <= 20 ? "this one is on the quiet side" : vix < 30 ? "this one is a bit restless" : "this one is a scare reading"}.`,
  ({ date, rsi }) =>
    rsi == null
      ? null
      : `On ${date}, SPY's 14-day RSI was ${number(rsi, 1)}. Think of it as a speedometer: 30 is a hard recent drop, 70 is a fast recent run.`,
  ({ date, fg }) =>
    fg == null
      ? null
      : `On ${date}, CNN Fear & Greed was ${number(fg, 0)}, which it calls ${ratingForScore(fg)}. Under 25 is panic. Over 75 is a party.`,
  ({ date, smaRatio }) =>
    smaRatio == null
      ? null
      : `On ${date}, SPY was ${signedPercent(smaRatio)} versus its 200-day average. That average is just the last 200 closes, added up and divided.`,
  ({ date, vix, rsi }) =>
    vix == null || rsi == null
      ? null
      : `On ${date}, a VIX of ${number(vix, 2)} next to an RSI of ${number(rsi, 1)} is the opposite of a headline day. Quiet volatility and a mid-range speedometer often travel together.`,
  ({ date, fg, crypto }) =>
    fg == null || crypto == null
      ? null
      : `On ${date}, stocks scored ${number(fg, 0)} on Fear & Greed while coins scored ${Math.round(crypto)}. They are two different crowds, and they do not have to agree.`,
  ({ date, streak, smaRatio }) =>
    streak == null || streak < MIN_HISTORY_DAYS
      ? null
      : `On ${date}, SPY had spent ${streak} market days ${sideWord(smaRatio)} its 200-day average in a row. A market day is a day the exchange was open.`,
  ({ date, more, smaRatio }) =>
    more == null || more < MIN_HISTORY_DAYS
      ? null
      : `On ${date}, earlier stretches ${sideWord(smaRatio)} the 200-day average typically had ${marketDaysPhrase(more)} left before price met that average again. That is a sample of past daily prices, not a clock.`,
  ({ date, alreadyLong, streak, smaRatio }) =>
    !alreadyLong || streak == null
      ? null
      : `On ${date}, this stretch ${sideWord(smaRatio)} the 200-day average (${streak} market days) was already the long one in this sample. Earlier completed runs were shorter.`,
  ({ date, vix, fg }) =>
    vix == null || fg == null
      ? null
      : `On ${date}, the VIX was ${number(vix, 2)} and Fear & Greed was ${number(fg, 0)}. One is how jumpy prices have been. The other is a mood score. They can disagree.`,
  ({ date, rsi, smaRatio }) =>
    rsi == null || smaRatio == null
      ? null
      : `On ${date}, RSI ${number(rsi, 1)} is the last two weeks of SPY. ${signedPercent(smaRatio)} versus the 200-day is the last year-ish. Short speed and long direction are different questions.`,
  ({ date, vix }) =>
    vix == null || vix > 20
      ? null
      : `On ${date}, a VIX of ${number(vix, 2)} is closer to a nap than a scare. People start talking about it around 30.`,
  ({ date, rsi }) =>
    rsi == null || rsi < 50 || rsi > 70
      ? null
      : `On ${date}, RSI ${number(rsi, 1)} is the middle of the road for SPY. Not a washout, not a sprint.`,
  ({ date, fg }) =>
    fg == null || fg < 45 || fg > 55
      ? null
      : `On ${date}, Fear & Greed at ${number(fg, 0)} is the shrug in the middle. That is what "neutral" is for.`,
  ({ date, smaRatio }) =>
    smaRatio == null || smaRatio <= 0 || smaRatio > 0.12
      ? null
      : `On ${date}, SPY at ${signedPercent(smaRatio)} versus the 200-day average is a comfortable lead, not the far stretch that starts past 12%.`,
  ({ date, smaRatio }) =>
    smaRatio == null || smaRatio >= 0
      ? null
      : `On ${date}, SPY was ${signedPercent(smaRatio)} under its 200-day average. That is the long-run slide side of the line.`,
  ({ date, direction, label }) =>
    direction === "none"
      ? null
      : `On ${date}, the named pattern is "${label}", and the 200-day side is ${direction === "up" ? "upward" : "downward"}. The percent next to the title is how closely the gauges match that pattern, not a chance of profit.`,
  ({ date, vix, smaRatio }) =>
    vix == null || smaRatio == null
      ? null
      : `On ${date}, volatility (VIX ${number(vix, 2)}) and distance from the 200-day average (${signedPercent(smaRatio)}) are two different stories. One can be quiet while the other is still stretched.`,
  ({ date, crypto, fg }) =>
    crypto == null
      ? null
      : `On ${date}, the coin mood score was ${Math.round(crypto)}${fg == null ? "" : ` beside a stock mood score of ${number(fg, 0)}`}. Coins are shown because people ask. They are not part of the stock pattern.`,
  ({ date, rsi, fg }) =>
    rsi == null || fg == null
      ? null
      : `On ${date}, RSI ${number(rsi, 1)} and Fear & Greed ${number(fg, 0)} are both "how hot has this felt lately" numbers. RSI is 14 days of SPY. Fear & Greed is a broader mood score.`,
];

function factSeed(metrics: SentimentMetrics, reading: SentimentReading): string {
  const day = metrics.asOf ? dateKeyInTz(metrics.asOf, MARKET_TZ) : "none";
  const vix = metrics.vix == null ? "x" : metrics.vix.toFixed(1);
  const rsiNow = metrics.rsi == null ? "x" : metrics.rsi.toFixed(0);
  const fg = metrics.fearGreed == null ? "x" : String(Math.round(metrics.fearGreed));
  const smaBps =
    metrics.smaRatio == null ? "x" : String(Math.round(metrics.smaRatio * 1000));
  const streak = metrics.streakDays ?? "x";
  return `${day}|${reading.regime}|${reading.direction}|${vix}|${rsiNow}|${fg}|${smaBps}|${streak}`;
}

function gaugesStamp(ctx: FactCtx): string {
  const parts = [
    ctx.vix != null ? `VIX ${number(ctx.vix, 2)}` : null,
    ctx.rsi != null ? `RSI ${number(ctx.rsi, 1)}` : null,
    ctx.fg != null ? `Fear & Greed ${number(ctx.fg, 0)}` : null,
    ctx.smaRatio != null ? `${signedPercent(ctx.smaRatio)} versus the 200-day` : null,
  ].filter((s): s is string => Boolean(s));
  return parts.join(", ");
}

export function sentimentDailyFact(
  metrics: SentimentMetrics,
  reading: SentimentReading = classifyMarketSentiment(metrics)
): string | null {
  if (!metrics.asOf || !sentimentHasAnyGauge(metrics)) return null;
  const date = sessionDateLabel(metrics.asOf);
  if (!date) return null;
  const ctx: FactCtx = {
    date,
    vix: metrics.vix,
    rsi: metrics.rsi,
    fg: metrics.fearGreed,
    crypto: metrics.cryptoFearGreed,
    smaRatio: metrics.smaRatio,
    streak: metrics.streakDays,
    alreadyLong: metrics.alreadyLong === true,
    more: metrics.typicalMoreDays,
    direction: reading.direction,
    label: reading.label,
  };
  const lines = FACTS.map((make) => make(ctx)).filter((s): s is string => Boolean(s));
  if (lines.length === 0) return null;
  const rng = mulberry32(hashSeed(factSeed(metrics, reading)));
  const body = pick(rng, lines);
  const stamp = gaugesStamp(ctx);
  return stamp ? `${body} That day's gauges: ${stamp}.` : body;
}

export function buildSentimentCard(metrics: SentimentMetrics): SentimentCard {
  const reading = classifyMarketSentiment(metrics);
  return {
    reading,
    lead: sentimentLead(reading),
    fitLine: sentimentFitLine(reading.agreementPct),
    history: sentimentHistoryLine(metrics),
    gauges: sentimentGaugeNotes(metrics),
    fact: sentimentDailyFact(metrics, reading),
  };
}
