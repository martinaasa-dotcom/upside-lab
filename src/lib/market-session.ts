
import { NO_VALUE } from "@/lib/format";
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

export function isNyWeekday(now = new Date()): boolean {
  const { weekday } = nyClock(now);
  return weekday !== "Sat" && weekday !== "Sun";
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
  if (isUsWeekend(now)) return true;
  if (session === "open" || session === "pre") return false;
  if (session === "ah") return true;
  return nyClock(now).hour >= 16;
}

/** How leftover daily % should be named in a sentence a person reads. */
export function insightWhen(
  session: SessionKind = "unknown",
  now = new Date()
): "today" | "friday" {
  void session;
  return isUsWeekend(now) ? "friday" : "today";
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

export function sessionShort(state: string | null | undefined): string {
  switch (sessionKind(state)) {
    case "open":
      return "Open";
    case "pre":
      return "Pre";
    case "ah":
      return "AH";
    case "closed":
      return "Closed";
    default:
      return NO_VALUE;
  }
}
