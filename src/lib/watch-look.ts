import type { Quote } from "@/lib/types";

export type WatchLookKind = "look" | "wait" | "quiet" | "report";

export type WatchLook = {
  kind: WatchLookKind;
  headline: string;
  detail: string;
  low: number | null;
  high: number | null;
};

const RECENT_DAYS = 20;
const HARD_DAY = 0.04;
const RANGE_FLOOR = 0.015;
const LOW_BAND = 0.22;
const HIGH_BAND = 0.82;
const REPORT_WINDOW = 7;

function recentPrices(quote: Pick<Quote, "price" | "sparkline">): number[] {
  const series = (quote.sparkline ?? []).filter(
    (n) => Number.isFinite(n) && n > 0
  );
  const price = Number.isFinite(quote.price) && quote.price > 0 ? quote.price : null;
  const all = price ? [...series, price] : series;
  return all.slice(-RECENT_DAYS);
}

function rangeOf(prices: number[]): { low: number; high: number } | null {
  if (prices.length < 5) return null;
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  if (!(low > 0) || high <= low) return null;
  return { low, high };
}

function reportLook(
  days: number,
  low: number | null,
  high: number | null
): WatchLook {
  const when =
    days <= 0
      ? "Results today"
      : days === 1
        ? "Results tomorrow"
        : `Results in ${days} days`;
  return {
    kind: "report",
    headline: when,
    detail: "Results days often move a price more than a typical session.",
    low,
    high,
  };
}

/**
 * A plain read of recent prices. Not a target and not a buy order.
 * Uses this name's own last few weeks, plus an upcoming results date
 * when we have one.
 */
export function watchLook(
  quote: Pick<Quote, "price" | "changePercent" | "sparkline">,
  daysUntilReport: number | null = null
): WatchLook {
  const prices = recentPrices(quote);
  const band = rangeOf(prices);
  const low = band?.low ?? null;
  const high = band?.high ?? null;
  const price = quote.price;
  const dayPct = Number.isFinite(quote.changePercent) ? quote.changePercent : 0;

  if (
    daysUntilReport != null &&
    Number.isFinite(daysUntilReport) &&
    daysUntilReport >= 0 &&
    daysUntilReport <= REPORT_WINDOW
  ) {
    return reportLook(Math.round(daysUntilReport), low, high);
  }

  if (band && price > 0) {
    const spanPct = (band.high - band.low) / price;
    const pos = (price - band.low) / (band.high - band.low);
    if (spanPct >= RANGE_FLOOR && pos <= LOW_BAND) {
      return {
        kind: "look",
        headline: "Near its recent low",
        detail:
          "The price is near the low of its recent range.",
        low,
        high,
      };
    }
    if (spanPct >= RANGE_FLOOR && pos >= HIGH_BAND) {
      return {
        kind: "wait",
        headline: "Near its recent high",
        detail:
          "The price is near the high of its recent range.",
        low,
        high,
      };
    }
  }

  if (dayPct <= -HARD_DAY) {
    return {
      kind: "look",
      headline: "Down a lot today",
      detail:
        "The session is down vs a typical day. The stated reason for watching it is a separate fact.",
      low,
      high,
    };
  }
  if (dayPct >= HARD_DAY) {
    return {
      kind: "wait",
      headline: "Up a lot today",
      detail:
        "The session is up vs a typical day. The price is away from the quieter part of its recent range.",
      low,
      high,
    };
  }

  if (!band) {
    return {
      kind: "quiet",
      headline: "Not enough recent history",
      detail: "A few more sessions fill in a range. Until then the picture is thin.",
      low,
      high,
    };
  }

  return {
    kind: "quiet",
    headline: "In the middle of where it's been lately",
    detail: "The price is in the middle of its recent range.",
    low,
    high,
  };
}
