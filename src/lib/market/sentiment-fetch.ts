/**
 * Snapshot behind GET /api/market/sentiment.
 *
 * One SPY daily chart (about ten years) yields the 14-day RSI, the
 * 200-day average, and the sample of completed 200-day stretches. VIX is
 * a live quote. CNN Fear & Greed is the S&P reading used for
 * classification; crypto Fear & Greed is shown beside it and never
 * substituted into the equity-cycle rules.
 */

import {
  isCircuitOpenError,
  isMarketCircuitOpen,
  marketFetch,
  withMarketCircuit,
} from "@/lib/market/circuit-breaker";
import { fetchFearGreedIndex } from "@/lib/market/fear-greed-fetch";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { marketSession } from "@/lib/market/session";
import { getYahoo } from "@/lib/market/yahoo";
import { siteUrl } from "@/lib/site-url";
import {
  preferSentimentSnapshot,
  sentimentGaugesReady,
  sentimentHasAnyGauge,
  spyMetricsFromCloses,
  spyTrendHistory,
  spySparkFromCloses,
  type SentimentMetrics,
} from "@/lib/market-sentiment";

const SPY = "SPY";
const VIX = "^VIX";
const LOOKBACK_DAYS = 3650;
const CRYPTO_FNG_URL = "https://api.alternative.me/fng/?limit=1";

const TTL_OPEN_MS = 120_000;
const TTL_CLOSED_MS = 600_000;
/** Incomplete snapshots expire fast so a Yahoo blip can recover. */
const TTL_PARTIAL_MS = 30_000;

let cached: { at: number; snap: SentimentMetrics } | null = null;
let inflight: Promise<SentimentMetrics | null> | null = null;

function ttlMs(): number {
  return marketSession() === "closed" ? TTL_CLOSED_MS : TTL_OPEN_MS;
}

function liveNumber(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

function score100(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100) {
    return n;
  }
  if (typeof n === "string" && n.trim()) {
    const parsed = Number(n);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
  }
  return null;
}

function barDate(raw: unknown): string | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string" && raw.length >= 8) return raw.slice(0, 10);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function chartBars(rows: unknown): { close: number; at: string | null }[] {
  if (!Array.isArray(rows)) return [];
  const out: { close: number; at: string | null }[] = [];
  for (const row of rows) {
    const close = (row as { close?: unknown }).close;
    if (typeof close === "number" && Number.isFinite(close) && close > 0) {
      out.push({
        close,
        at: barDate((row as { date?: unknown }).date),
      });
    }
  }
  return out;
}

async function fetchSpyBars(): Promise<{ close: number; at: string | null }[]> {
  if (isMarketCircuitOpen("yahoo")) return [];
  const yf = await getYahoo();
  const period1 = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const chart = await withMarketCircuit("yahoo", () =>
    yf.chart(SPY, { period1, interval: "1d" })
  );
  return chartBars(chart?.quotes);
}

async function fetchCryptoFearGreed(): Promise<number | null> {
  if (isMarketCircuitOpen("alt-fear-greed")) return null;
  try {
    const res = await marketFetch("alt-fear-greed", CRYPTO_FNG_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (compatible; UpsideLab/1.0; +" + siteUrl() + ")",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    const data = (json as { data?: unknown }).data;
    if (!Array.isArray(data) || data.length === 0) return null;
    const score = score100((data[0] as { value?: unknown }).value);
    return score == null ? null : Math.round(score);
  } catch (err) {
    if (isCircuitOpenError(err)) return null;
    console.error("Crypto Fear & Greed fetch failed", err);
    return null;
  }
}

async function loadSnapshot(): Promise<SentimentMetrics> {
  const [quotes, bars, cnn, crypto] = await Promise.all([
    fetchQuotesWithFallback([VIX]).catch(() => null),
    fetchSpyBars().catch((err) => {
      if (!isCircuitOpenError(err)) {
        console.error("SPY history for sentiment failed", err);
      }
      return [] as { close: number; at: string | null }[];
    }),
    fetchFearGreedIndex().catch(() => null),
    fetchCryptoFearGreed(),
  ]);

  const closes = bars.map((b) => b.close);
  const spy = spyMetricsFromCloses(closes);
  const history = spyTrendHistory(closes);
  const vix = liveNumber(quotes?.quotes[VIX]?.price);
  const fearGreed = score100(cnn?.score);
  const asOf = new Date().toISOString();

  return {
    vix,
    rsi: spy.rsi,
    fearGreed: fearGreed == null ? null : Math.round(fearGreed),
    cryptoFearGreed: crypto,
    spyPrice: spy.lastClose,
    sma200: spy.sma200,
    smaRatio: spy.smaRatio,
    streakDays: history.streakDays,
    typicalMoreDays: history.typicalMoreDays,
    alreadyLong: history.alreadyLong,
    spark: spySparkFromCloses(
      closes,
      bars.map((b) => b.at),
      history.streakDays
    ),
    asOf,
  };
}

function cacheTtlMs(snap: SentimentMetrics): number {
  return sentimentGaugesReady(snap) ? ttlMs() : TTL_PARTIAL_MS;
}

export async function fetchMarketSentimentSnapshot(): Promise<SentimentMetrics | null> {
  if (cached && Date.now() - cached.at < cacheTtlMs(cached.snap)) {
    return cached.snap;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const snap = await loadSnapshot();
      const chosen = preferSentimentSnapshot(cached?.snap ?? null, snap);
      if (
        chosen === snap &&
        (sentimentGaugesReady(snap) || sentimentHasAnyGauge(snap))
      ) {
        cached = { at: Date.now(), snap: chosen };
      }
      return chosen;
    } catch (err) {
      console.error("Market sentiment snapshot failed", err);
      return cached?.snap ?? null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function sentimentCacheTtlSec(snap?: SentimentMetrics): number {
  const ms =
    snap && !sentimentGaugesReady(snap) ? TTL_PARTIAL_MS : ttlMs();
  return Math.round(ms / 1000);
}
