import { cashtag, currency, percent } from "@/lib/format";
import {
  marginCopy,
  marginHealth,
  marginTone,
  type MarginToneName,
} from "@/lib/margin-health";
import { safeDiv } from "@/lib/money";
/** Client alerts: earnings, strike breach, goal, decision cards. */

export type UpsideAlert = {
  id: string;
  kind: "earnings" | "strike" | "goal" | "info";
  title: string;
  detail: string;
  ticker?: string;
  at: number;
  /**
   * How loud the surface showing this should be. Most things worth saying
   * are not emergencies, and a card that is red whatever the number says
   * teaches the reader to stop reading it. Defaults to neutral; only the
   * borrowed-money alert raises it, and only on its own arithmetic.
   */
  tone?: MarginToneName;
  /** One short line a card can show under the title without the full detail. */
  cushion?: string | null;
};

export function buildStrikeAlerts(
  rows: Array<{
    ticker: string;
    spot: number;
    stockTarget: number | null;
    nextStrike: number | null;
  }>
): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  for (const r of rows) {
    if (r.stockTarget != null && r.spot > 0 && r.spot >= r.stockTarget) {
      out.push({
        id: `strike-target-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} passed the price you were aiming for`,
        detail: `The price is now ${currency(r.spot, 2)}, above the ${currency(r.stockTarget, 2)} you set.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
    if (r.nextStrike != null && r.spot > 0 && r.spot >= r.nextStrike * 0.98) {
      out.push({
        id: `strike-near-${cashtag(r.ticker)}`,
        kind: "strike",
        title: `${cashtag(r.ticker)} is closing in on your strike`,
        detail: `The price is within about 2% of ${currency(r.nextStrike, 2)}. That is the level you planned, not a call you have already sold.`,
        ticker: r.ticker,
        at: Date.now(),
      });
    }
  }
  return out;
}

/**
 * The options half of this used to be unconditional, so somebody who told
 * onboarding they've never traded an option still got told about writing
 * calls into a print. `hideOptions` is the same flag that strips the CC
 * panel and Margus's options tools.
 */
export function buildEarningsAlerts(
  events: Array<{ ticker: string; date: string; days: number }>,
  hideOptions = true
): UpsideAlert[] {
  return events
    .filter((e) => e.days >= 0 && e.days <= 7)
    .map((e) => ({
      id: `earn-${cashtag(e.ticker)}-${e.date}`,
      kind: "earnings" as const,
      title:
        e.days === 0
          ? `${cashtag(e.ticker)} reports today`
          : `${cashtag(e.ticker)} reports in ${e.days} ${e.days === 1 ? "day" : "days"}`,
      detail: hideOptions
        ? `The date is set for ${e.date}. A stock usually moves more than usual on the day it reports, in either direction.`
        : `The date is set for ${e.date}. Prices swing further around results, which makes options more expensive and widens the range compared with an ordinary day.`,
      ticker: e.ticker,
      at: Date.now(),
    }));
}

/** Extra decision cards: margin, concentration. */
export function buildDecisionAlerts(input: {
  cash: number;
  equityValue: number;
  topTicker?: { ticker: string; value: number } | null;
}): UpsideAlert[] {
  const out: UpsideAlert[] = [];
  // Borrowed money is a size question, not a yes/no one. See
  // `margin-health.ts`: the tone and every number in the sentence come
  // from the loan measured against what the portfolio is actually worth,
  // and from how far the stocks can fall before a broker sells them.
  const margin = marginHealth({
    cash: input.cash,
    equityValue: input.equityValue,
  });
  const copy = marginCopy(margin);
  if (copy) {
    out.push({
      id: `decision-margin-${margin.tier}`,
      kind: "info",
      title: copy.title,
      detail: copy.detail,
      tone: marginTone(margin.tier),
      cushion: copy.cushion,
      at: Date.now(),
    });
  }
  if (
    input.topTicker &&
    input.equityValue > 0 &&
    safeDiv(input.topTicker.value, input.equityValue) >= 0.35
  ) {
    const share = safeDiv(input.topTicker.value, input.equityValue);
    out.push({
      id: `decision-conc-${cashtag(input.topTicker.ticker)}`,
      kind: "info",
      title: `${cashtag(input.topTicker.ticker)} is ${percent(share, 0)} of your stocks`,
      detail:
        "When one holding is this large, most of how your year goes depends on this single company.",
      ticker: input.topTicker.ticker,
      at: Date.now(),
    });
  }
  return out;
}

export function buildGoalAlert(
  hit: boolean,
  label: string
): UpsideAlert | null {
  if (!hit) return null;
  return {
    id: `goal-${label}`,
    kind: "goal",
    title: "Milestone hit",
    detail: label,
    at: Date.now(),
  };
}
