/**
 * Fetches the overnight indication. See `overnight.ts` for what it is and,
 * more importantly, what it is not.
 */

import { withMarketCircuit, isMarketCircuitOpen } from "@/lib/market/circuit-breaker";
import { getYahoo } from "@/lib/market/yahoo";
import {
  OVERNIGHT_SYMBOLS,
  isOvernightGap,
  lastUsPrintAt,
  legChange,
  nextUsPrintAt,
  type OvernightIndication,
  type OvernightLeg,
} from "@/lib/market/overnight";

/**
 * Five minute bars over five days. Five days rather than two because the
 * anchor on a Sunday evening is the previous Friday, and two days does not
 * reach back that far.
 */
const BAR_INTERVAL = "5m" as const;
const LOOKBACK_DAYS = 5;

/**
 * Furthest back an anchor bar may sit. A long holiday weekend is the real
 * case; past this the bar is old enough that calling it "overnight" would
 * be a lie, so the leg is dropped instead.
 */
const MAX_ANCHOR_AGE_MS = 80 * 60 * 60 * 1000;

type Bar = { at: number; close: number };

function readBars(rows: unknown): Bar[] {
  if (!Array.isArray(rows)) return [];
  const out: Bar[] = [];
  for (const row of rows) {
    const r = row as { date?: unknown; close?: unknown };
    const close = r.close;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      continue;
    }
    const at =
      r.date instanceof Date
        ? r.date.getTime()
        : typeof r.date === "number"
          ? r.date * 1000
          : typeof r.date === "string"
            ? Date.parse(r.date)
            : NaN;
    if (!Number.isFinite(at)) continue;
    out.push({ at, close });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** Last bar at or before `boundary`, which is the anchor we measure from. */
function barAtOrBefore(bars: Bar[], boundary: number): Bar | null {
  let found: Bar | null = null;
  for (const bar of bars) {
    if (bar.at > boundary) break;
    found = bar;
  }
  return found;
}

async function fetchLeg(
  symbol: string,
  name: string,
  anchorAt: number,
  period1: Date
): Promise<{ leg: OvernightLeg; asOf: number; since: number } | null> {
  const yf = await getYahoo();
  const chart = await withMarketCircuit("yahoo", () =>
    yf.chart(symbol, { period1, interval: BAR_INTERVAL })
  ).catch(() => null);
  const bars = readBars(chart?.quotes);
  if (bars.length === 0) return null;

  const anchor = barAtOrBefore(bars, anchorAt);
  const latest = bars[bars.length - 1];
  if (!anchor || !latest) return null;
  if (anchorAt - anchor.at > MAX_ANCHOR_AGE_MS) return null;
  // The newest bar has to be newer than the anchor, or there is no
  // overnight move to report, only the same print twice.
  if (latest.at <= anchor.at) return null;

  const changePercent = legChange(anchor.close, latest.close);
  if (changePercent == null) return null;

  return {
    leg: { symbol, name, changePercent },
    asOf: latest.at,
    since: anchor.at,
  };
}

/**
 * Null whenever there is nothing honest to say: outside the gap, with the
 * circuit open, or when neither contract came back usable. The caller
 * renders nothing at all in that case rather than an empty shape, because
 * a blank slot where a number belongs reads as a number that failed.
 */
export async function fetchOvernightIndication(
  at: Date = new Date()
): Promise<OvernightIndication | null> {
  if (!isOvernightGap(at)) return null;
  if (isMarketCircuitOpen("yahoo")) return null;

  const anchorAt = lastUsPrintAt(at);
  const period1 = new Date(at.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const settled = await Promise.all(
    OVERNIGHT_SYMBOLS.map(({ symbol, name }) =>
      fetchLeg(symbol, name, anchorAt, period1).catch(() => null)
    )
  );
  const got = settled.filter((r): r is NonNullable<typeof r> => r != null);
  if (got.length === 0) return null;

  return {
    legs: got.map((r) => r.leg),
    asOf: Math.max(...got.map((r) => r.asOf)),
    since: Math.min(...got.map((r) => r.since)),
    resumesAt: nextUsPrintAt(at),
  };
}
