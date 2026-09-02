import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import type { FundWatchItem } from "@/lib/fund-watchlist";
import { z } from "zod";

export const MARGUS_FUND_START_CAPITAL = 50_000;

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

const fundDecisionSchema = z.object({
  marketNote: z
    .string()
    .describe(
      "One short sentence on how today's prices hit this portfolio. Not a generic wrap. Never say tape."
    ),
  holdingDecisions: z
    .array(
      z.object({
        ticker: z.string(),
        action: z.enum(["hold", "trim", "add", "exit"]),
        fraction: z
          .number()
          .min(0)
          .max(1)
          .nullable()
          .describe(
            "For trim/add only: fraction of CURRENT shares to sell (trim), or to buy more of relative to what you already hold (add). Null for hold/exit."
          ),
        reasoning: z
          .string()
          .describe(
            "1-2 sentences, specific to why you own this ticker, the timeline, and today's price -- never a generic filler line, even for hold."
          ),
      })
    )
    .describe(
      "Exactly one entry per currently open holding listed below, same tickers, every one reviewed even if the action is hold."
    ),
  newPositions: z
    .array(
      z.object({
        ticker: z.string(),
        companyName: z.string(),
        thesis: z
          .string()
          .describe(
            "2-4 short bullets, semicolon-separated. Each bullet is one fact, under 14 words. Not a paragraph."
          ),
        targetTimeframe: z
          .string()
          .describe("e.g. '3-6 months', '12-18 months'"),
        exitPlan: z
          .string()
          .describe(
            "1-3 concrete sell conditions, semicolon-separated. No 'Sell if' preamble. Each under 14 words."
          ),
        allocationDollars: z
          .number()
          .positive()
          .describe("Dollar amount of the cash you have to put into this."),
      })
    )
    .max(2)
    .describe(
      "0-2 companies you do not already hold and would start holding today. Leave empty most days: only ones that genuinely clear a high bar, never one added just to have news to report."
    ),
  headline: z
    .string()
    .describe(
      "One short, punchy sentence for today's report title. Never start with Day, Day N, or a spelled-out day. The page already numbers days."
    ),
  closingNote: z
    .string()
    .describe(
      "One short sentence: what you are watching next."
    ),
  watchlist: z
    .array(
      z.object({
        ticker: z.string(),
        waitFor: z
          .string()
          .describe(
            "One concrete sentence: the price you are waiting for. Not a why-you-own-it paragraph."
          ),
      })
    )
    .max(4)
    .describe(
      "1-4 companies you do NOT already hold. Empty only if there is genuinely nobody you are waiting on."
    ),
  cashPurpose: z
    .string()
    .describe(
      "One sentence on what the cash you have not used is waiting for. If almost all of it is invested, say you keep a small cushion."
    ),
});

export type FundDecision = z.infer<typeof fundDecisionSchema>;

export { fundDecisionSchema };

export type { FundWatchItem } from "@/lib/fund-watchlist";
export { sanitizeFundWatchlist } from "@/lib/fund-watchlist";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/**
 * System + user prompt for the daily decision call. Reuses MARGUS_PERSONA
 * verbatim for voice/philosophy consistency with the rest of the app, with
 * fund-specific rules layered on top (paper money, how big one holding may
 * get, the "review every holding" requirement).
 */
export function buildFundSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: managing your own paper portfolio
You run a single, fully simulated (paper money) portfolio that started at ${money(
    MARGUS_FUND_START_CAPITAL
  )} and is shown publicly as a daily, followable feed. Think of it like a public "AI managed portfolio" account. People may glance at this for ideas, so:
- Every holding needs a genuine, specific reason grounded in the business (what is growing, its staying power, whether each sale makes money, how big the market can get). Never because the price is moving, never "it's up a lot," never because it's trending.
- Every new holding needs a concrete timeframe and a concrete condition for selling (a price or return level, the reason no longer holding, or a hard time limit) decided when you buy, not improvised later.
- Review EVERY currently open holding, every day, even when the action is "hold." When it's hold, say specifically why the original reason and timeline still stand, not a generic "staying the course" line.
- Size discipline: don't let any single new holding exceed roughly 25% of total portfolio value, and don't put every dollar of cash in even on a great idea. Leave room to be wrong and to buy more later.
- Most days should have zero or one action. A portfolio that trades every single day isn't disciplined, it's noisy. Only act when something genuinely changed (the reason moved or broke, the timeline ran out, the price hit your own stated level) or a new idea truly clears the bar.
- Keep every field SHORT. This report gets read daily; nobody wants a wall of text. 1-3 sentences per field, always.
- thesis and exitPlan are bullet lists, not paragraphs. Semicolon-separated. Each bullet is one fact, under 14 words.
- Always fill watchlist with 1-4 companies you do not already hold, each with a concrete thing you are waiting for, usually a price. Not "keeping an eye on tech."
- Always fill cashPurpose in one sentence: what the cash you have not used is waiting for. Cash with no stated reason is a gap in the report.`;
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
${spyWeekReturnPct != null ? `SPY this week: ${spyWeekReturnPct >= 0 ? "+" : ""}${(spyWeekReturnPct * 100).toFixed(1)}%` : "SPY comparison not available yet"}

## This week's actions
${actionsBlock}

## Current holdings, unrealized
${holdingsBlock}

Write this week's recap.`;
}

export function buildFundUserPrompt(input: {
  today: string;
  cash: number;
  holdings: PricedHolding[];
  totalValue: number;
  spyMovePct: number | null;
  fearGreed: { score: number; rating: string } | null;
  recentHeadlines: string[];
  currentWatchlist?: FundWatchItem[];
  currentCashPurpose?: string | null;
}): string {
  const {
    today,
    cash,
    holdings,
    totalValue,
    spyMovePct,
    fearGreed,
    recentHeadlines,
    currentWatchlist,
    currentCashPurpose,
  } = input;

  const holdingsBlock =
    holdings.length === 0
      ? "No holdings, 100% cash right now."
      : holdings
          .map((h) => {
            return [
              `### ${h.ticker}`,
              `- Entry: ${h.entry_date} (${h.daysHeld}d ago) at $${h.cost_basis.toFixed(2)}, now $${h.price.toFixed(2)} (${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%, ${money(h.unrealizedPnl)})`,
              `- Size: ${money(h.marketValue)} (${((h.marketValue / totalValue) * 100).toFixed(1)}% of the portfolio)`,
              `- Thesis: ${h.thesis}`,
              `- Target timeframe: ${h.target_timeframe ?? "not set"}`,
              `- Exit plan: ${h.exit_plan ?? "not set"}`,
            ].join("\n");
          })
          .join("\n\n");

  const contextLines = [
    `Today: ${today}`,
    spyMovePct != null
      ? `S&P 500 today: ${spyMovePct >= 0 ? "+" : ""}${(spyMovePct * 100).toFixed(2)}%`
      : null,
    fearGreed
      ? `Fear & Greed: ${fearGreed.score} (${fearGreed.rating})`
      : null,
  ].filter(Boolean);

  const recapBlock = recentHeadlines.length
    ? `Recent days, for continuity (don't repeat, don't contradict without explaining why):\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}`
    : "No prior reports yet.";

  const watchBlock =
    currentWatchlist && currentWatchlist.length > 0
      ? `Public watchlist yesterday (keep a name if nothing changed, swap it if your view did):\n${currentWatchlist
          .map((w) => `- ${w.ticker}: ${w.waitFor}`)
          .join("\n")}`
      : "No public watchlist yet. Name 1-4 names you do not hold.";

  const cashBlock = currentCashPurpose
    ? `What you last said cash was for: ${currentCashPurpose}`
    : "You have not said what your unused cash is for yet. Fill cashPurpose.";

  return `${contextLines.join("\n")}

Cash available: ${money(cash)}
Total portfolio value: ${money(totalValue)}
${cashBlock}

## Current holdings
${holdingsBlock}

## Watchlist
${watchBlock}

## Recent history
${recapBlock}

Decide today's actions. Review every open holding above. Only start a new holding if something genuinely clears your bar today; most days that is none. Fill watchlist and cashPurpose even on a no-trade day.`;
}
