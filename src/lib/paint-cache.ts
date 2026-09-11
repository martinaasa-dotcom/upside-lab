/**
 * Last-known payloads for surfaces that used to mount empty and wait on
 * a fetch. Same idea as community-cache / quote-cache: paint what we
 * already have, then let the request correct it.
 */

import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import type { SeasonalityModel } from "@/lib/market/seasonality";
import type { TrendRowLike } from "@/lib/market/trend-story";
import {
  isSentimentMetrics,
  type SentimentMetrics,
} from "@/lib/market-sentiment";
import type { Quote } from "@/lib/types";

const memory = new Map<string, unknown>();

function load<T>(key: string, ok: (v: unknown) => v is T): T | null {
  const mem = memory.get(key);
  if (mem !== undefined && ok(mem)) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!ok(parsed)) return null;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function save<T>(key: string, value: T) {
  memory.set(key, value);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

const TRENDS_PREFIX = "upside-trends-paint-v1:";
const SEASONALITY_PREFIX = "upside-seasonality-paint-v1:";
const MACRO_KEY = "upside-macro-paint-v1";
const SENTIMENT_KEY = "upside-sentiment-paint-v1";
const FUND_COMPARE_KEY = "upside-fund-compare-v1";

function isTrendRows(v: unknown): v is TrendRowLike[] {
  return (
    Array.isArray(v) &&
    v.every(
      (row) =>
        row &&
        typeof row === "object" &&
        typeof (row as TrendRowLike).ticker === "string"
    )
  );
}

export function loadTrendsPaint(tickerKey: string): TrendRowLike[] | null {
  if (!tickerKey) return null;
  return load(`${TRENDS_PREFIX}${tickerKey}`, isTrendRows);
}

export function saveTrendsPaint(tickerKey: string, rows: TrendRowLike[]) {
  if (!tickerKey) return;
  save(`${TRENDS_PREFIX}${tickerKey}`, rows);
}

function isSeasonality(v: unknown): v is SeasonalityModel {
  if (!v || typeof v !== "object") return false;
  const o = v as SeasonalityModel;
  return typeof o.ticker === "string" && Array.isArray(o.cycleMonthly);
}

export function loadSeasonalityPaint(ticker: string): SeasonalityModel | null {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return null;
  return load(`${SEASONALITY_PREFIX}${sym}`, isSeasonality);
}

export function saveSeasonalityPaint(model: SeasonalityModel) {
  const sym = model.ticker.trim().toUpperCase();
  if (!sym) return;
  save(`${SEASONALITY_PREFIX}${sym}`, model);
}

export type MacroNumbers = {
  vix: number | null;
  eurusd: number | null;
  btc: number | null;
  tenYear: number | null;
};

export type MacroPaint = {
  macro: MacroNumbers;
  fearGreed: FearGreedSnapshot | null;
  /**
   * When that reading was taken.
   *
   * Optional because entries written before this field existed are still
   * in readers' browsers; `fear-greed-pool.ts` reads a missing one as
   * arbitrarily old, which shows the number and re-asks rather than
   * trusting it. Without a time the guard against re-fetching could never
   * expire, so a reader opening the app in the morning kept yesterday's
   * mood under a card that says today.
   */
  fearGreedAt?: number;
};

function isMacroPaint(v: unknown): v is MacroPaint {
  if (!v || typeof v !== "object") return false;
  const o = v as MacroPaint;
  return o.macro != null && typeof o.macro === "object";
}

export function loadMacroPaint(): MacroPaint | null {
  return load(MACRO_KEY, isMacroPaint);
}

export function saveMacroPaint(next: MacroPaint) {
  save(MACRO_KEY, next);
}

/**
 * Write the macro numbers without disturbing the mood reading beside them.
 *
 * These are two things on one key, fetched on two schedules, and a caller
 * that rebuilds the whole record to save one half silently drops whatever
 * it did not think to carry. That is not hypothetical: the macro poll
 * wrote `{ macro, fearGreed }` every time a quote landed, which threw away
 * `fearGreedAt` each time, so the reading was saved without the timestamp
 * its own freshness rule depends on and the guard could never fire.
 * Measured on the real app, the score arrived and the paint carried no
 * time at all.
 */
export function saveMacroNumbers(macro: MacroNumbers) {
  const prev = loadMacroPaint();
  save(MACRO_KEY, {
    macro,
    fearGreed: prev?.fearGreed ?? null,
    fearGreedAt: prev?.fearGreedAt,
  });
}

/** The mood reading, without disturbing the macro numbers beside it. */
export function saveFearGreedPaint(fearGreed: FearGreedSnapshot, at: number) {
  const prev = loadMacroPaint();
  save(MACRO_KEY, {
    macro: prev?.macro ?? { vix: null, eurusd: null, btc: null, tenYear: null },
    fearGreed,
    fearGreedAt: at,
  });
}

export function loadFearGreedPaint(): FearGreedSnapshot | null {
  const fg = loadMacroPaint()?.fearGreed;
  if (!fg || typeof fg.score !== "number") return null;
  return fg;
}

export function loadSentimentPaint(): SentimentMetrics | null {
  return load(SENTIMENT_KEY, isSentimentMetrics);
}

export function saveSentimentPaint(next: SentimentMetrics) {
  save(SENTIMENT_KEY, next);
}

export type FundComparePaint = {
  portfolios: { id: string; name: string; cash_balance: number }[];
  holdings: {
    portfolio_id: string;
    ticker: string;
    shares: number;
    buy_price: number;
  }[];
  paths: Record<
    string,
    { sheet: { date: string; nav: number }[]; spy: { date: string; nav: number }[] }
  >;
  live: Record<string, { value: number; quotes: Record<string, Quote> }>;
};

function isFundCompare(v: unknown): v is FundComparePaint {
  if (!v || typeof v !== "object") return false;
  const o = v as FundComparePaint;
  return Array.isArray(o.portfolios) && Array.isArray(o.holdings);
}

export function loadFundComparePaint(): FundComparePaint | null {
  return load(FUND_COMPARE_KEY, isFundCompare);
}

export function saveFundComparePaint(next: FundComparePaint) {
  save(FUND_COMPARE_KEY, next);
}

export function patchFundComparePaint(partial: Partial<FundComparePaint>) {
  const prev = loadFundComparePaint() ?? {
    portfolios: [],
    holdings: [],
    paths: {},
    live: {},
  };
  saveFundComparePaint({
    portfolios: partial.portfolios ?? prev.portfolios,
    holdings: partial.holdings ?? prev.holdings,
    paths: { ...prev.paths, ...partial.paths },
    live: { ...prev.live, ...partial.live },
  });
}
