import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { z } from "zod";

export const MARGUS_FUND_START_CAPITAL = 100_000;

export type FundHoldingStatus = "open" | "closed";

export type FundHolding = {
  id: string;
  ticker: string;
  shares: number;
  cost_basis: number;
  entry_date: string;
  thesis: string;
  target_timeframe: string | null;
  exit_plan: string | null;
  status: FundHoldingStatus;
  closed_at: string | null;
  exit_reasoning: string | null;
  realized_pnl: number | null;
};

export type FundReport = {
  id: string;
  report_date: string;
  headline: string;
  body: string;
  actions: FundAction[];
  portfolio_value: number;
  cash: number;
  day_change_dollar: number | null;
  day_change_pct: number | null;
  total_return_pct: number | null;
  created_at: string;
};

export type FundAction = {
  type: "hold" | "trim" | "add" | "exit" | "buy";
  ticker: string;
  reasoning: string;
  /**
   * Which of the Fund's rules made the trade (`fund-strategy.ts`), so a
   * later day can tell a sale into strength from a stop. Absent on the
   * first version's trades and on holds.
   */
  rule?: string;
  shares?: number;
  price?: number;
  dollarAmount?: number;
};

/** Live-priced view of a holding, built right before asking Margus to decide. */
export type PricedHolding = FundHolding & {
  price: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  daysHeld: number;
};

/**
 * What the model is asked for now: words about trades that already
 * happened. The trades themselves come from `fund-strategy.ts`, which is
 * arithmetic on prices a reader can check, and nothing the model writes
 * can add, remove or resize one. A run with no model available writes
 * `fallbackNarrative` instead and trades exactly the same.
 */
const fundNarrativeSchema = z.object({
  headline: z
    .string()
    .describe(
      "One short, specific sentence for today's report title, naming what the rules did. Never start with Day or a spelled-out day."
    ),
  marketNote: z
    .string()
    .describe(
      "One short sentence on what the Nasdaq 100 did today and what that meant for this fund. Never say tape."
    ),
  closingNote: z
    .string()
    .describe("One short sentence: what the rules are waiting for next."),
});

export type FundNarrative = z.infer<typeof fundNarrativeSchema>;

export { fundNarrativeSchema };

export type { FundWatchItem } from "@/lib/fund-watchlist";
export { sanitizeFundWatchlist } from "@/lib/fund-watchlist";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function buildFundNarrativeSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: writing up Upside Fund's day
Upside Fund is a paper portfolio that started at ${money(
    MARGUS_FUND_START_CAPITAL
  )}. Its trades are made by written rules, not by you: it buys companies that are leading the Nasdaq 100 when they pull back to a short-term low and turn up, sells half into overbought strength and the rest on the next push, and cuts anything that breaks its stop, loses its long-term trend or goes nowhere for three months. Money waiting for the next setup sits in the Nasdaq 100 itself.

You are writing the day's report about trades that have ALREADY been made. Do not suggest other trades, do not second-guess the rules, and do not invent a reason: every trade below comes with the figures that triggered it, and those figures are the reason. Keep every field to one short sentence. Plain English, no market slang.`;
}

export function buildFundNarrativeUserPrompt(input: {
  today: string;
  benchMovePct: number | null;
  riskOn: boolean;
  trades: { side: string; ticker: string; why: string }[];
  holdingCount: number;
}): string {
  const trades = input.trades.length
    ? input.trades.map((t) => `- ${t.side.toUpperCase()} ${t.ticker}: ${t.why}`).join("\n")
    : "No trades today.";
  const move = input.benchMovePct;
  return `Today: ${input.today}
Nasdaq 100 today: ${move == null ? "n/a" : `${move >= 0 ? "+" : ""}${(move * 100).toFixed(2)}%`}
Nasdaq 100 long-term trend: ${input.riskOn ? "up (above its 200-day average)" : "down (under its 200-day average), so the fund holds fewer companies"}
Companies held after today: ${input.holdingCount}

## What the rules did today
${trades}

Write the headline, the market note and the closing note.`;
}

/** The words a run writes when no model answered. Plain and specific. */
export function fallbackNarrative(input: {
  benchMovePct: number | null;
  trades: { side: string; ticker: string }[];
  holdingCount: number;
}): FundNarrative {
  const bought = input.trades.filter((t) => t.side === "buy").map((t) => t.ticker);
  const sold = input.trades.filter((t) => t.side === "sell").map((t) => t.ticker);
  const parts = [
    bought.length ? `Bought ${bought.join(", ")}` : null,
    sold.length ? `sold ${sold.join(", ")}` : null,
  ].filter(Boolean) as string[];
  const joined = parts.join(" and ");
  const headline = parts.length
    ? `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
    : `No setups today, ${input.holdingCount} ${input.holdingCount === 1 ? "company" : "companies"} on plan.`;
  const move = input.benchMovePct;
  return {
    headline,
    marketNote:
      move == null
        ? "The Nasdaq 100's move today was not available."
        : `The Nasdaq 100 ${move >= 0 ? "rose" : "fell"} ${Math.abs(move * 100).toFixed(1)}% today.`,
    closingNote:
      "Waiting for the next leader to pull back to a short-term low and turn up.",
  };
}

const weeklyRecapSchema = z.object({
  headline: z
    .string()
    .describe(
      "One punchy sentence capturing the week: the story, not the stat line. Never start with Week, Week N, or a spelled-out week. The page already numbers weeks."
    ),
  body: z
    .string()
    .describe(
      "4-6 short bullets, each starting with '- '. First bullets: what you did and what moved. Last 1-2: what you are watching next week. No paragraphs. Each bullet under 16 words."
    ),
});

export type WeeklyRecapDecision = z.infer<typeof weeklyRecapSchema>;

export { weeklyRecapSchema };

/** Reuses the same persona for voice consistency, with a distinct framing:
 * this is the reflective step-back, not another daily decision. */
export function buildWeeklyRecapSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: your weekly step-back
Once a week (Friday's close) you write a short recap of your paper portfolio. Bullets only. What you did, what moved, what you are watching next week. No paragraphs, no warm-up sentences. The numbers below are already computed and correct; don't recompute or contradict them.`;
}

export function buildWeeklyRecapUserPrompt(input: {
  weekEnding: string;
  portfolioValueStart: number;
  portfolioValueEnd: number;
  weekReturnPct: number;
  spyWeekReturnPct: number | null;
  currentHoldings: PricedHolding[];
  weekActions: { date: string; type: string; ticker: string; reasoning: string }[];
}): string {
  const {
    weekEnding,
    portfolioValueStart,
    portfolioValueEnd,
    weekReturnPct,
    spyWeekReturnPct,
    currentHoldings,
    weekActions,
  } = input;

  const actionsBlock = weekActions.length
    ? weekActions
        .map((a) => `- ${a.date}: ${a.type.toUpperCase()} ${a.ticker}: ${a.reasoning}`)
        .join("\n")
    : "No trades this week, held the portfolio as-is.";

  const holdingsBlock = currentHoldings
    .map(
      (h) =>
        `- ${h.ticker}: ${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}% since entry`
    )
    .join("\n");

  return `Week ending: ${weekEnding}

Portfolio value: ${money(portfolioValueStart)} -> ${money(portfolioValueEnd)} (${weekReturnPct >= 0 ? "+" : ""}${(weekReturnPct * 100).toFixed(1)}%)
${spyWeekReturnPct != null ? `The Nasdaq 100 (QQQ) this week: ${spyWeekReturnPct >= 0 ? "+" : ""}${(spyWeekReturnPct * 100).toFixed(1)}%` : "Nasdaq 100 comparison not available yet"}

## This week's actions
${actionsBlock}

## Current holdings, unrealized
${holdingsBlock}

Write this week's recap.`;
}
