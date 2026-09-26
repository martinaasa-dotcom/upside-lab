
/** Human labels for Yahoo marketState + book day P&L strip. */

export type SessionKind = "open" | "pre" | "ah" | "closed" | "unknown";

/**
 * Live mark and "yesterday's close" for today's P&L.
 *
 * Price is the newest print we have: pre-market, leftover after-hours, or
 * the regular close. Today's change is that mark vs the last regular
 * close that applies to this session. Never flatten the baseline to the
 * live price: that zeros Today overnight once after-hours ends.
 *
 * Pre-market is the one special case. Yahoo's regularMarketPrice is
 * still yesterday's close until the open, so that is the baseline, not
 * regularMarketPreviousClose (one session further back).
 */
export function sessionMark(input: {
  marketState: string;
  regularPrice: number | null;
  postPrice: number | null;
  prePrice: number | null;
  previousClose: number | null;
}): { price: number; previousClose: number } {
  const state = (input.marketState ?? "").toUpperCase();
  const { regularPrice, postPrice, prePrice, previousClose } = input;
  const inPre = state === "PRE" || state === "PREPRE";
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));

  // Newest print: pre-market, leftover after-hours, then the regular close.
  // Closed overnight prefers leftover AH over a morning pre print, which is
  // older than the regular session that already happened.
  const price = inPre
    ? (prePrice ?? postPrice ?? regularPrice ?? 0)
    : (postPrice ?? regularPrice ?? prePrice ?? 0);

  let baseline = inPre
    ? (regularPrice ?? previousClose ?? price)
    : (previousClose ?? regularPrice ?? price);

  // Yahoo sometimes copies the live mark into previousClose overnight,
  // which zeros Today. Fall back to the other close we still have.
  if (price > 0 && near(baseline, price)) {
    if (
      inPre &&
      previousClose != null &&
      previousClose > 0 &&
      !near(previousClose, price)
    ) {
      baseline = previousClose;
    } else if (
      !inPre &&
      regularPrice != null &&
      regularPrice > 0 &&
      !near(regularPrice, price)
    ) {
      baseline = regularPrice;
    }
  }

  return { price, previousClose: baseline };
}

export function nyClock(now = new Date()): { weekday: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday, hour };
}

export function isUsWeekend(now = new Date()): boolean {
  const { weekday } = nyClock(now);
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * After the US cash session, including the weekend leftover of Friday.
 * Sunday used to return false, so Home talked about Friday's leftover
 * change as if the market was still open.
 */
export function isUsAfterCashClose(
  session: SessionKind,
  now = new Date()
): boolean {
  if (isUsMarketDayOff(now)) return true;
  if (session === "open" || session === "pre") return false;
  if (session === "ah") return true;
  return nyClock(now).hour >= 16;
}

/**
 * Days the New York Stock Exchange is shut all day, beyond the weekend.
 *
 * Published by the exchange a year or more ahead. Without these, a Monday
 * holiday described Friday's close as "today", and the weekend after Good
 * Friday or Christmas described Thursday's close as Friday's. Extend this
 * list each year; a missing day only brings those two faults back for it.
 */
const NYSE_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** The New York calendar date, as YYYY-MM-DD. */
function nyDateKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** No regular session at all on this New York day: a weekend or a holiday. */
export function isUsMarketDayOff(now = new Date()): boolean {
  return isUsWeekend(now) || NYSE_HOLIDAYS.has(nyDateKey(now));
}

/**
 * The weekday of the last session before a day off, as a person says it:
 * "Friday" after an ordinary weekend, "Thursday" after Good Friday.
 */
export function lastSessionName(now = new Date()): string {
  let at = new Date(now.getTime());
  for (let i = 0; i < 10; i++) {
    at = new Date(at.getTime() - 24 * 60 * 60 * 1000);
    if (!isUsMarketDayOff(at)) {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        weekday: "long",
      }).format(at);
    }
  }
  return "Friday";
}

const SESSION_DAY_NAMES = new Set([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
]);

/** A move label naming a past session ("Friday"), rather than "Today" or an extended session. */
export function isPastSessionLabel(label: string | null | undefined): boolean {
  return SESSION_DAY_NAMES.has(String(label ?? ""));
}

/**
 * How leftover daily % should be named in a sentence a person reads.
 *
 * "friday" means the last session rather than literally Friday; the name
 * to print is `lastSessionName()`. Kept as one word so the many callers
 * that branch on it did not all have to change.
 */
export function insightWhen(
  session: SessionKind = "unknown",
  now = new Date()
): "today" | "friday" {
  void session;
  return isUsMarketDayOff(now) ? "friday" : "today";
}

export function sessionKind(state: string | null | undefined): SessionKind {
  const s = (state ?? "").toUpperCase();
  if (s === "REGULAR") return "open";
  if (s === "PRE" || s === "PREPRE") return "pre";
  if (s === "POST" || s === "POSTPOST") return "ah";
  if (s === "CLOSED" || s === "") return s === "CLOSED" ? "closed" : "unknown";
  return "closed";
}

export function sessionLabel(state: string | null | undefined): string {
  switch (sessionKind(state)) {
    case "open":
      return "Market open";
    case "pre":
      return "Pre-market";
    case "ah":
      return "After hours";
    case "closed":
      return "Market closed";
    default:
      return "Session unknown";
  }
}
