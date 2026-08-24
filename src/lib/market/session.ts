/**
 * Where the US market is in its day, for anything that polls.
 *
 * Pre-market (04:00) through after-hours (20:00) still prints, so those
 * windows poll as often as the regular session. Nights and weekends slow
 * down; they do not freeze on a flattened close.
 */

import { dateKeyInTz } from "@/lib/timezone";
import type { Quote } from "@/lib/types";

const US_TZ = "America/New_York";

export type MarketSession = "open" | "extended" | "closed";

/** Minutes since midnight in New York, plus the weekday there. */
function nyClock(at: Date): { minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: US_TZ,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday")
  );

  return { minutes: hour * 60 + minute, weekday };
}

export function marketSession(at: Date = new Date()): MarketSession {
  const { minutes, weekday } = nyClock(at);
  if (weekday === 0 || weekday === 6) return "closed";
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "open";
  // Pre-market from 04:00, after-hours to 20:00. Holidays aren't tracked; a
  // holiday just costs one slow poll cycle, which is cheap.
  if (minutes >= 4 * 60 && minutes < 20 * 60) return "extended";
  return "closed";
}

/** New York minutes-since-midnight for the regular session boundaries. */
const PRE_OPEN_MIN = 4 * 60; // 04:00, first extended print Yahoo carries
const OPEN_MIN = 9 * 60 + 30; // 09:30
const CLOSE_MIN = 16 * 60; // 16:00
const POST_END_MIN = 20 * 60; // 20:00, last extended print Yahoo carries

/** Minutes from `minutes` forward to the next regular open, wrapping midnight. */
function minutesToOpen(minutes: number, weekday: number): number {
  if (weekday >= 1 && weekday <= 5 && minutes < OPEN_MIN) {
    return OPEN_MIN - minutes;
  }
  // After today's open, the next one is tomorrow, or Monday from Friday
  // evening onward. Saturday and Sunday walk forward to Monday.
  const daysAhead =
    weekday === 5 ? 3 : weekday === 6 ? 2 : weekday === 0 ? 1 : 1;
  return 24 * 60 - minutes + OPEN_MIN + (daysAhead - 1) * 24 * 60;
}

/**
 * How often live prices are worth re-fetching in the background, in ms.
 *
 * A curve rather than the three flat steps this used to be, because the two
 * things it trades off both move continuously. What is worth spending is set
 * by how fast the number can change: fastest at the open and the close,
 * quick through pre-market and after-hours, and close to nothing at 02:00
 * when no US venue is printing at all. What is worth saving is the shared
 * free tier the quote chain runs on, and 02:00 is exactly where a flat
 * cadence spent it on a price that had not moved since 20:00.
 *
 * The overnight number is deliberately slack. Between 20:00 and 04:00 New
 * York there is no per-name print to fetch: Yahoo carries pre and post
 * market only inside 04:00 to 20:00, and the free chain behind it carries
 * less. Polling every two minutes through that window bought the same
 * frozen close 240 times. The cadence tightens again on the approach to
 * 04:00 so the first pre-market print lands within a poll of appearing,
 * rather than up to a quarter of an hour after it.
 *
 * This is the *background* cadence, and it is not what a reader waiting on
 * the screen gets. See `quoteViewMaxAgeMs`.
 */
export function quotePollMs(at: Date = new Date()): number {
  const { minutes, weekday } = nyClock(at);
  const weekend = weekday === 0 || weekday === 6;

  if (!weekend && minutes >= OPEN_MIN && minutes < CLOSE_MIN) {
    // The open and the close are where a book moves fastest.
    const nearOpen = minutes < OPEN_MIN + 30;
    const nearClose = minutes >= CLOSE_MIN - 30;
    return nearOpen || nearClose ? 20_000 : 30_000;
  }

  if (!weekend && minutes >= CLOSE_MIN && minutes < POST_END_MIN) {
    // After-hours prints thin out as the evening goes on.
    return minutes < CLOSE_MIN + 60 ? 45_000 : 120_000;
  }

  // Everything else is the run up to the next open: late evening, the
  // overnight gap, and pre-market. One ramp covers all three.
  const toOpen = minutesToOpen(minutes, weekday);
  if (toOpen <= 30) return 20_000; // 09:00 to 09:30, the run into the bell
  if (toOpen <= 120) return 30_000; // 07:30 onward, pre-market gets busy
  if (toOpen <= OPEN_MIN - PRE_OPEN_MIN) return 60_000; // 04:00 to 07:30
  // The 45 minutes before 04:00. Nothing prints yet, but the first
  // pre-market print of the day should land within a poll of appearing.
  if (toOpen <= OPEN_MIN - PRE_OPEN_MIN + 45) return 2 * 60_000;
  // The overnight gap, and the weekday evening that runs into it. 14 hours
  // reaches back past 20:00, so the whole dead stretch is one bucket.
  if (toOpen <= 14 * 60) return 10 * 60_000;
  return 30 * 60_000; // the weekend, where no US venue prints for days
}

/**
 * How stale a quote may be at the moment a person is actually looking, in ms.
 *
 * The background cadence above answers "how often is it worth fetching while
 * nobody is watching". This answers a different question, and it is the one
 * the reader feels: they opened the app, or came back to the tab, and the
 * number on the screen has to be the real one. A book that is correct on a
 * 10 minute background cadence is still wrong to *show* someone a 9 minute
 * old price without refetching it.
 *
 * So the two numbers are allowed to diverge, and overnight they diverge by a
 * lot: poll every 10 minutes, but refetch on sight if what we hold is more
 * than a minute old. The cost is one request per app open, which is the
 * cheapest request in the product.
 */
export function quoteViewMaxAgeMs(at: Date = new Date()): number {
  const session = marketSession(at);
  if (session === "open") return 15_000;
  if (session === "extended") return 20_000;
  return 60_000;
}

/**
 * True when a quote fetch this recent is still inside the current background
 * cadence. Use this to decide whether a *timer* has work to do.
 */
export function isQuotePollFresh(
  updatedAt: number | null | undefined,
  at: Date = new Date()
): boolean {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = Date.now() - updatedAt;
  return age >= 0 && age < quotePollMs(at);
}

/**
 * True when what we already hold is fresh enough to put in front of someone
 * right now. Use this, never `isQuotePollFresh`, on any path a reader
 * triggered: opening a room, returning to the tab, switching portfolio.
 */
export function isQuoteFreshForView(
  updatedAt: number | null | undefined,
  at: Date = new Date()
): boolean {
  if (updatedAt == null || !Number.isFinite(updatedAt)) return false;
  const age = Date.now() - updatedAt;
  return age >= 0 && age < quoteViewMaxAgeMs(at);
}

/**
 * Stable /api/quotes URL for a ticker set. Sorted and deduped so two tabs
 * asking for the same names in a different order share one cache entry
 * instead of each paying for its own upstream fetch.
 */
export function quotesUrl(tickers: readonly string[]): string {
  const list = [...new Set(tickers.map((t) => t.trim().toUpperCase()))]
    .filter(Boolean)
    .sort();
  return `/api/quotes?tickers=${encodeURIComponent(list.join(","))}`;
}

function addDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

function isWeekendKey(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  return dow === 0 || dow === 6;
}

/** Monday YYYY-MM-DD of the US week that contains `sessionDate`. */
export function usWeekMondayKey(sessionDate: string): string {
  const [y, m, d] = sessionDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  const sinceMon = (dow + 6) % 7;
  return addDayKey(sessionDate, -sinceMon);
}

/**
 * US cash-session date the fund should write. After 16:00 ET on a weekday
 * that is today. Before the close, weekends, or Monday morning, that is
 * the previous weekday. 23:30 UTC is 19:30 ET in summer / 18:30 ET in
 * winter, so the evening cron lands well after the session that just
 * ended, not right on top of the close.
 */
export function lastCompletedUsSessionKey(now: Date = new Date()): string {
  const { minutes, weekday } = nyClock(now);
  let key = dateKeyInTz(now, US_TZ);
  const closedToday =
    weekday !== 0 && weekday !== 6 && minutes >= 16 * 60;
  if (closedToday) return key;
  key = addDayKey(key, -1);
  for (let i = 0; i < 6; i++) {
    if (!isWeekendKey(key)) return key;
    key = addDayKey(key, -1);
  }
  return key;
}

/**
 * Weekday session keys strictly after `fromExclusiveKey` up to and
 * including `toInclusiveKey`, ascending. Not holiday-aware -- same
 * documented tradeoff as `marketSession` above, a holiday just costs one
 * wasted backfill run, which is cheap. Used to find which trading days a
 * cron run needs to catch up on, not just retry a single date. Capped so
 * a long-stale row can't spin the loop.
 */
export function tradingDaysBetween(
  fromExclusiveKey: string,
  toInclusiveKey: string,
  maxDays = 400
): string[] {
  const out: string[] = [];
  let key = addDayKey(fromExclusiveKey, 1);
  while (key <= toInclusiveKey && out.length < maxDays) {
    if (!isWeekendKey(key)) out.push(key);
    key = addDayKey(key, 1);
  }
  return out;
}

/**
 * A morning catch-up is writing yesterday. Live prints are today's
 * session, so pin each name to previousClose (yesterday's regular close).
 */
export function pinQuotesToSessionClose(
  quotes: Record<string, Quote>,
  sessionDate: string,
  now: Date = new Date()
): Record<string, Quote> {
  if (sessionDate >= dateKeyInTz(now, US_TZ)) return quotes;
  const next: Record<string, Quote> = {};
  for (const [ticker, q] of Object.entries(quotes)) {
    const close = q.previousClose;
    if (!(close > 0)) {
      next[ticker] = q;
      continue;
    }
    next[ticker] = { ...q, price: close, change: 0, changePercent: 0 };
  }
  return next;
}
