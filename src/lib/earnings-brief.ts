/**
 * Extra read on an upcoming earnings date: typical move, a price range,
 * how the last few prints went, and a short note on the run-in.
 *
 * Educational, not a trade. Expected move prefers the options market's
 * ATM straddle when one exists, otherwise the median of the last prints.
 */

import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import { normalizeYahooTicker } from "@/lib/ticker";
import { resolveYahooListedSymbol } from "@/lib/market/yahoo";
import { unstable_cache } from "next/cache";
import { isMarketCircuitOpen, withMarketCircuit } from "@/lib/market/circuit-breaker";

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

export type EarningsPrint = {
  date: string;
  /** EPS surprise as a fraction (0.041 = 4.1% beat). */
  surprisePct: number | null;
  /** Close-to-close reaction spanning the print, as a fraction. */
  movePct: number | null;
};

export type EarningsBrief = {
  ticker: string;
  date: string;
  days: number;
  dateIsEstimate: boolean;
  spot: number | null;
  expectedMovePct: number | null;
  expectedMoveSource: "implied" | "history" | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  runupPct: number | null;
  prints: EarningsPrint[];
  beatCount: number;
  note: string;
};

type Bar = { date: string; close: number };

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function optionMid(
  bid?: number | null,
  ask?: number | null,
  last?: number | null
): number {
  const b = bid ?? 0;
  const a = ask ?? 0;
  const l = last ?? 0;
  if (b > 0 && a > 0) return (b + a) / 2;
  return l || b || a || 0;
}

/** Yahoo mix: 0.041 as a fraction, or "4.1" as percent points. */
export function asSurpriseFraction(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 1 ? n / 100 : n;
}

export function medianAbs(values: number[]): number | null {
  const abs = values.filter((v) => Number.isFinite(v)).map((v) => Math.abs(v));
  if (abs.length === 0) return null;
  abs.sort((a, b) => a - b);
  const mid = Math.floor(abs.length / 2);
  return abs.length % 2 === 0 ? (abs[mid - 1]! + abs[mid]!) / 2 : abs[mid]!;
}

export function priceRange(
  spot: number,
  movePct: number
): { low: number; high: number } {
  return { low: spot * (1 - movePct), high: spot * (1 + movePct) };
}

/**
 * Reaction spanning the print. After-hours (20:00 UTC or later) uses the
 * next session's close vs that day's close. Earlier prints use that
 * session vs the one before.
 */
export function sessionReaction(bars: Bar[], reportedAt: Date): number | null {
  if (bars.length < 2) return null;
  const key = utcDateKey(reportedAt);
  let i = bars.findIndex((b) => b.date >= key);
  if (i < 0) return null;
  const afterHours = reportedAt.getUTCHours() >= 20;
  if (afterHours) {
    const here = bars[i];
    const next = bars[i + 1];
    if (!here || !next || here.close <= 0) return null;
    return next.close / here.close - 1;
  }
  if (i === 0) i = 1;
  const prev = bars[i - 1];
  const here = bars[i];
  if (!prev || !here || prev.close <= 0) return null;
  return here.close / prev.close - 1;
}

export function buildEarningsNote(input: {
  expectedMovePct: number | null;
  runupPct: number | null;
  beatCount: number;
  printCount: number;
  typicalAbsMovePct: number | null;
}): string {
  const swing = input.expectedMovePct ?? input.typicalAbsMovePct;
  const swingLabel =
    swing != null ? `about ±${Math.round(swing * 100)}%` : null;
  const run = input.runupPct;
  const stretched =
    run != null &&
    swing != null &&
    Math.abs(run) >= Math.max(0.12, swing * 1.4);

  if (stretched && run! > 0 && swingLabel) {
    return `The price has already risen ${Math.round(run! * 100)}% in the run up to this. It usually moves ${swingLabel} on the day, so a good part of that rise could go either way.`;
  }
  if (stretched && run! < 0 && swingLabel) {
    return `The price has already fallen ${Math.round(Math.abs(run!) * 100)}% in the run up to this. It usually moves ${swingLabel} on the day.`;
  }
  if (input.printCount >= 3 && input.beatCount === input.printCount && swingLabel) {
    return `The company beat expectations at its last ${input.printCount} reports. The day can still go either way, usually ${swingLabel}.`;
  }
  if (input.printCount >= 3 && input.beatCount === 0 && swingLabel) {
    return `The company came in under expectations at its last ${input.printCount} reports. The price usually moves ${swingLabel} on the day.`;
  }
  if (input.printCount >= 3 && swingLabel) {
    return `The last ${input.printCount} reports were mixed, with ${input.beatCount} beating expectations. The price usually moves ${swingLabel} on the day.`;
  }
  if (swingLabel) {
    return `Investors are expecting a move of ${swingLabel}. That is how far, not which way.`;
  }
  return "A price usually moves more than usual on the day a company reports, in either direction.";
}

function runupFromBars(bars: Bar[], lookback = 20): number | null {
  if (bars.length < lookback + 1) return null;
  const last = bars[bars.length - 1]!;
  const prev = bars[bars.length - 1 - lookback]!;
  if (prev.close <= 0) return null;
  return last.close / prev.close - 1;
}

async function impliedMovePct(
  ticker: string,
  spot: number,
  earningsDays: number
): Promise<number | null> {
  if (!(spot > 0) || earningsDays < 0) return null;
  try {
    const yf = await getYahoo();
    const chain = await yf.options(ticker);
    const covering = (chain.expirationDates ?? [])
      .map((d: Date | string) => {
        const exp = typeof d === "string" ? new Date(d) : d;
        return { exp, days: daysUntilInTz(exp) };
      })
      .filter(
        (e) => e.days >= earningsDays - 1 && e.days <= earningsDays + 14
      )
      .sort((a, b) => a.days - b.days)[0];
    if (!covering) return null;

    const detailed = await yf.options(ticker, { date: covering.exp });
    const calls = detailed.options?.[0]?.calls ?? [];
    const puts = detailed.options?.[0]?.puts ?? [];
    if (!calls.length || !puts.length) return null;

    const nearest = <T extends { strike?: number }>(rows: T[]): T | null => {
      let best: T | null = null;
      let dist = Infinity;
      for (const row of rows) {
        const strike = row.strike ?? 0;
        if (!strike) continue;
        const d = Math.abs(strike - spot);
        if (d < dist) {
          best = row;
          dist = d;
        }
      }
      return best;
    };

    const atmCall = nearest(calls) as
      | { bid?: number; ask?: number; lastPrice?: number; strike?: number }
      | null;
    const atmPut = nearest(puts) as
      | { bid?: number; ask?: number; lastPrice?: number; strike?: number }
      | null;
    if (!atmCall || !atmPut) return null;
    if (
      Math.abs((atmCall.strike ?? 0) - spot) / spot > 0.08 ||
      Math.abs((atmPut.strike ?? 0) - spot) / spot > 0.08
    ) {
      return null;
    }
    const call = optionMid(atmCall.bid, atmCall.ask, atmCall.lastPrice);
    const put = optionMid(atmPut.bid, atmPut.ask, atmPut.lastPrice);
    if (call <= 0 || put <= 0) return null;
    const move = (call + put) / spot;
    return move > 0.005 && move < 0.8 ? move : null;
  } catch (err) {
    console.error(`Implied move failed for ${ticker}`, err);
    return null;
  }
}

type Quarterly = {
  reportedDate?: Date | string;
  surprisePct?: string | number;
  actual?: number;
  estimate?: number;
};

async function fetchEarningsBriefUncached(
  ticker: string,
  date: string,
  days: number
): Promise<EarningsBrief> {
  const symbol =
    (await resolveYahooListedSymbol(ticker)) ??
    (normalizeYahooTicker(ticker) || ticker.toUpperCase());
  const empty: EarningsBrief = {
    ticker: ticker.toUpperCase(),
    date,
    days,
    dateIsEstimate: false,
    spot: null,
    expectedMovePct: null,
    expectedMoveSource: null,
    rangeLow: null,
    rangeHigh: null,
    runupPct: null,
    prints: [],
    beatCount: 0,
    note: buildEarningsNote({
      expectedMovePct: null,
      runupPct: null,
      beatCount: 0,
      printCount: 0,
      typicalAbsMovePct: null,
    }),
  };

  if (isMarketCircuitOpen("yahoo")) return empty;
  try {
    const yf = await getYahoo();
    const period1 = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000);
    const [summary, chart, quote] = await Promise.all([
      withMarketCircuit("yahoo", () =>
        yf.quoteSummary(symbol, {
          modules: ["earnings", "calendarEvents"],
        })
      ),
      yf.chart(symbol, { period1, interval: "1d" }).catch(() => null),
      withMarketCircuit("yahoo", () => yf.quote(symbol)),
    ]);
    const chartRows = chart?.quotes ?? [];

    const dateIsEstimate = Boolean(
      summary.calendarEvents?.earnings?.isEarningsDateEstimate
    );
    const spotRaw =
      typeof quote.regularMarketPrice === "number" && quote.regularMarketPrice > 0
        ? quote.regularMarketPrice
        : null;
    const bars: Bar[] = [];
    for (const row of chartRows) {
      const raw = row.date as Date | string | undefined;
      const close = typeof row.close === "number" ? row.close : null;
      if (!raw || close == null || close <= 0) continue;
      const key =
        raw instanceof Date ? utcDateKey(raw) : String(raw).slice(0, 10);
      if (key) bars.push({ date: key, close });
    }

    const quarterly = (summary.earnings?.earningsChart?.quarterly ??
      []) as Quarterly[];
    const prints: EarningsPrint[] = [];
    for (const q of quarterly.slice(-4)) {
      const raw = q.reportedDate;
      if (!raw) continue;
      const reported = raw instanceof Date ? raw : new Date(raw);
      if (Number.isNaN(reported.getTime())) continue;
      prints.push({
        date: dateKeyInTz(reported),
        surprisePct: asSurpriseFraction(q.surprisePct),
        movePct: sessionReaction(bars, reported),
      });
    }

    const beatCount = prints.filter(
      (p) => p.surprisePct != null && p.surprisePct > 0
    ).length;
    const typicalAbsMovePct = medianAbs(
      prints.map((p) => p.movePct).filter((v): v is number => v != null)
    );
    const runupPct = runupFromBars(bars);
    const implied =
      spotRaw != null ? await impliedMovePct(symbol, spotRaw, days) : null;
    const expectedMovePct = implied ?? typicalAbsMovePct;
    const expectedMoveSource = implied
      ? "implied"
      : typicalAbsMovePct != null
        ? "history"
        : null;
    const range =
      spotRaw != null && expectedMovePct != null
        ? priceRange(spotRaw, expectedMovePct)
        : null;

    return {
      ticker: ticker.toUpperCase(),
      date,
      days,
      dateIsEstimate,
      spot: spotRaw,
      expectedMovePct,
      expectedMoveSource,
      rangeLow: range?.low ?? null,
      rangeHigh: range?.high ?? null,
      runupPct,
      prints,
      beatCount,
      note: buildEarningsNote({
        expectedMovePct,
        runupPct,
        beatCount,
        printCount: prints.length,
        typicalAbsMovePct,
      }),
    };
  } catch (err) {
    console.error(`Earnings brief failed for ${ticker}`, err);
    return empty;
  }
}

const fetchEarningsBriefCached = unstable_cache(
  async (ticker: string, date: string, days: number) =>
    fetchEarningsBriefUncached(ticker, date, days),
  ["earnings-brief-v1"],
  { revalidate: 60 * 60 }
);

export async function fetchEarningsBrief(
  ticker: string,
  date: string,
  days: number
): Promise<EarningsBrief> {
  return fetchEarningsBriefCached(ticker, date, days);
}

const BRIEF_HORIZON_DAYS = 30;
const BRIEF_MAX = 6;

/** Fill in the nearest upcoming names. Failures stay as date-only rows. */
export async function attachEarningsBriefs<
  T extends { ticker: string; date: string; days: number },
>(events: T[]): Promise<Array<T & Partial<EarningsBrief>>> {
  const near = events
    .filter((e) => e.days >= 0 && e.days <= BRIEF_HORIZON_DAYS)
    .slice(0, BRIEF_MAX);
  if (near.length === 0) return events;

  const briefs: Array<EarningsBrief | null> = new Array(near.length).fill(null);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, near.length) }, async () => {
    while (cursor < near.length) {
      const idx = cursor++;
      const e = near[idx]!;
      try {
        briefs[idx] = await fetchEarningsBrief(e.ticker, e.date, e.days);
      } catch (err) {
        console.error(`Earnings brief skipped for ${e.ticker}`, err);
        briefs[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  const byTicker = new Map<string, EarningsBrief>();
  for (const b of briefs) {
    if (b) byTicker.set(b.ticker.toUpperCase(), b);
  }

  return events.map((e) => {
    const brief = byTicker.get(e.ticker.toUpperCase());
    return brief ? { ...e, ...brief, ticker: e.ticker, date: e.date, days: e.days } : e;
  });
}
