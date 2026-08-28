/**
 * What the market did while every US venue was shut.
 *
 * Between 20:00 and 04:00 New York there is no price for an individual US
 * stock. Yahoo carries pre and post market prints only inside 04:00 to
 * 20:00, and the free providers behind it carry less, so a holdings table
 * in that window is showing the last real print and nothing else is
 * available to show. Measured on a normal Monday: SPY had 0 bars between
 * 20:00 and 04:00, NVDA had 0, and the S&P and Nasdaq futures had 91 and
 * 90. Read from Tallinn that dead window is 03:00 to 11:00, which is most
 * of a working morning.
 *
 * Index futures do trade through it, and that is what this reports. It is
 * an *indication*, never a price: it says which way the market moved and
 * roughly how far, beside the portfolio value rather than inside it. The
 * value itself stays on the last real print, because a modelled number
 * standing where a price goes is the one thing this app does not do. A
 * holding with its own overnight news will not be in this number at all.
 */

import { nyWallClock } from "@/lib/market/session";

/** The two contracts. Both trade nearly around the clock on the CME. */
export const OVERNIGHT_SYMBOLS = [
  { symbol: "ES=F", name: "S&P 500" },
  { symbol: "NQ=F", name: "Nasdaq" },
] as const;

export type OvernightLeg = {
  /** Yahoo symbol, for cache keys and debugging. Never shown to a reader. */
  symbol: string;
  /** What a person calls the index. Shown. */
  name: string;
  /** Fraction, not percent. 0.004 is up four tenths of one percent. */
  changePercent: number;
};

export type OvernightIndication = {
  legs: OvernightLeg[];
  /** Epoch ms of the newest futures print behind these numbers. */
  asOf: number;
  /** Epoch ms of the anchor: the last moment US stocks were printing. */
  since: number;
  /** Epoch ms of 04:00 New York, when per-name prices start again. */
  resumesAt: number;
};

const PRE_OPEN_MIN = 4 * 60; // 04:00, first per-name print of the day
const POST_END_MIN = 20 * 60; // 20:00, last per-name print of the day
const FUTURES_SUNDAY_OPEN_MIN = 18 * 60; // 18:00, the CME week reopens

/**
 * True when no US venue is printing a price for an individual stock, *and*
 * futures are trading, so an indication is both needed and available.
 *
 * Friday 20:00 to Sunday 18:00 is deliberately false. Stocks are shut, but
 * so are futures, so there is nothing to indicate and a stale weekend
 * number beside the portfolio would be worse than no number at all.
 */
export function isOvernightGap(at: Date = new Date()): boolean {
  const { minutes, weekday } = nyWallClock(at);
  // Monday through Friday, the small hours before pre-market opens.
  if (weekday >= 1 && weekday <= 5 && minutes < PRE_OPEN_MIN) return true;
  // Monday through Thursday evening, once after-hours has ended.
  if (weekday >= 1 && weekday <= 4 && minutes >= POST_END_MIN) return true;
  // Sunday evening, when the futures week reopens ahead of Monday.
  if (weekday === 0 && minutes >= FUTURES_SUNDAY_OPEN_MIN) return true;
  return false;
}

/**
 * Epoch ms of the last moment US stocks were printing: 20:00 New York on
 * the most recent weekday. This is the anchor the futures move is measured
 * from, so on an ordinary night the number answers the reader's actual
 * question, which is "which way has it gone since the last price I saw".
 *
 * Weekdays only, not trading days: there is no holiday calendar here, the
 * same tradeoff `marketSession` documents. On the morning after a market
 * holiday the anchor is the previous evening, when stocks were shut, so the
 * move excludes the session futures spent digesting whatever happened while
 * the exchange was closed and the line understates it. Roughly nine
 * mornings a year, on a figure that is already labelled an indication
 * rather than a price.
 *
 * Walked in wall-clock minutes rather than by building a date in the New
 * York zone, so it is off by an hour on the two nights a year the clocks
 * change. That hour lands on picking a five minute futures bar one hour
 * either side of 20:00, which moves the reported percent by a rounding
 * step at most. Worth knowing, not worth a date library.
 */
export function lastUsPrintAt(at: Date = new Date()): number {
  const { minutes, weekday } = nyWallClock(at);
  const DAY = 24 * 60;
  let elapsed: number;
  if (weekday >= 1 && weekday <= 5 && minutes >= POST_END_MIN) {
    elapsed = minutes - POST_END_MIN;
  } else {
    const sinceYesterdayEvening = minutes + (DAY - POST_END_MIN);
    // How many further whole days back the previous weekday sits.
    const extraDays =
      weekday === 1 ? 2 : weekday === 0 ? 1 : 0; // Monday and Sunday reach Friday
    elapsed = sinceYesterdayEvening + extraDays * DAY;
  }
  return at.getTime() - elapsed * 60_000;
}

/**
 * Epoch ms of the next moment US stocks start printing again: 04:00 New
 * York, when pre-market opens. Shown to the reader on their own clock, so
 * the line answers "when is my portfolio live again" as well as "which way
 * did it go". Same wall-clock arithmetic, same twice-a-year DST caveat, as
 * `lastUsPrintAt` above.
 */
export function nextUsPrintAt(at: Date = new Date()): number {
  const { minutes } = nyWallClock(at);
  const DAY = 24 * 60;
  const ahead =
    minutes < PRE_OPEN_MIN
      ? PRE_OPEN_MIN - minutes
      : DAY - minutes + PRE_OPEN_MIN;
  return at.getTime() + ahead * 60_000;
}

/** Percent move of `last` against `anchor`, or null if either is unusable. */
export function legChange(
  anchor: number | null | undefined,
  last: number | null | undefined
): number | null {
  if (anchor == null || last == null) return null;
  if (!Number.isFinite(anchor) || !Number.isFinite(last)) return null;
  if (anchor <= 0 || last <= 0) return null;
  const pct = (last - anchor) / anchor;
  // A futures contract does not move 25% overnight. A number that says it
  // did is a rolled contract or a bad bar, and it must not reach a reader.
  if (!Number.isFinite(pct) || Math.abs(pct) > 0.25) return null;
  return pct;
}

/** The direction the whole indication points, for colouring one line. */
export function overnightDirection(
  indication: OvernightIndication | null
): number | null {
  const legs = indication?.legs ?? [];
  if (legs.length === 0) return null;
  const mean =
    legs.reduce((sum, leg) => sum + leg.changePercent, 0) / legs.length;
  return Number.isFinite(mean) ? mean : null;
}
