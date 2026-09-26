/**
 * The Fund's latest real trade, for the card on Home.
 *
 * "Real" means a company. Moving waiting money into or out of the Nasdaq
 * 100 is bookkeeping, and a card announcing it would teach a reader to
 * skip the card. Holds are not trades either.
 */

import { FUND_BENCHMARK } from "@/lib/fund-strategy";
import type { FundAction } from "@/lib/margus-fund";

export type FundTrade = {
  date: string;
  side: "buy" | "sell";
  /** "Bought", "Sold half of", "Sold all of", in the Fund room's own words. */
  verb: string;
  ticker: string;
  price: number | null;
  rule: string | null;
  why: string;
};

/** How far back a trade still counts as news on Home. */
export const FUND_TRADE_FRESH_DAYS = 10;

export function latestFundTrade(
  reports: { report_date: string; actions: FundAction[] | null }[]
): FundTrade | null {
  const newestFirst = [...reports].sort((a, b) =>
    b.report_date.localeCompare(a.report_date)
  );
  for (const r of newestFirst) {
    const trades = (r.actions ?? []).filter(
      (a) => a.type !== "hold" && a.ticker && a.ticker.toUpperCase() !== FUND_BENCHMARK
    );
    if (trades.length === 0) continue;
    // A buy is the most useful thing to show a reader deciding whether to
    // follow, so it leads when a day had both.
    const pick = trades.find((a) => a.type === "buy") ?? trades[0]!;
    const side = pick.type === "buy" || pick.type === "add" ? "buy" : "sell";
    const verb =
      pick.type === "buy"
        ? "Bought"
        : pick.type === "add"
          ? "Added to"
          : pick.type === "exit"
            ? "Sold all of"
            : pick.rule === "take-half"
              ? "Sold half of"
              : "Sold some";
    return {
      date: r.report_date,
      side,
      verb,
      ticker: pick.ticker.toUpperCase(),
      price: typeof pick.price === "number" ? pick.price : null,
      rule: pick.rule ?? null,
      why: pick.reasoning,
    };
  }
  return null;
}

/** Whether a trade on `date` is still recent enough to lead with. */
export function tradeIsFresh(date: string, now: Date = new Date()): boolean {
  const then = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(then)) return false;
  return (now.getTime() - then) / 86_400_000 <= FUND_TRADE_FRESH_DAYS;
}
