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
            "For trim/add only: fraction of CURRENT shares to sell (trim) or buy more of relative to current position size (add). Null for hold/exit."
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
          .describe("Dollar amount of available cash to deploy into this."),
      })
    )
    .max(2)
    .describe(
      "0-2 brand-new positions to open today. Leave empty most days -- only names that genuinely clear a high bar today, never a position just to have news to report."
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
            "One concrete sentence: the price or dip you are waiting for. Not a why-you-own-it paragraph."
          ),
      })
    )
    .max(4)
    .describe(
      "1-4 names you do NOT already hold. Empty only if you genuinely have nobody on deck."
    ),
  cashPurpose: z
    .string()
    .describe(
      "One sentence on why undeployed cash is sitting. If you are nearly fully invested, say you are keeping a small buffer."
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
 * fund-specific rules layered on top (paper money, position sizing,
 * "review every holding" requirement).
 */
export function buildFundSystemPrompt(): string {
  return `${MARGUS_PERSONA}

## This specific job: managing your own paper portfolio
You run a single, fully simulated (paper money) portfolio that started at ${money(
    MARGUS_FUND_START_CAPITAL
  )} and is shown publicly as a daily, followable feed. Think of it like a public "AI managed portfolio" account. People may glance at this for ideas, so:
- Every position needs a genuine, specific, fundamentals-based reason (growth drivers, staying power, unit economics, how big the market can get). Never momentum, never "it's up a lot," never because it's trending.
- Every new position needs a concrete timeframe and a concrete exit condition (a price/return level, a reason-broke condition, or a hard time stop) decided at entry, not improvised later.
- Review EVERY currently open holding, every day, even when the action is "hold." When it's hold, say specifically why the original reason and timeline still stand, not a generic "staying the course" line.
- Position sizing discipline: don't let any single new position exceed roughly 25% of total portfolio value, and don't deploy all available cash even on a great idea. Leave room to be wrong and to add later.
- Most days should have zero or one action. A portfolio that trades every single day isn't disciplined, it's noisy. Only act when something genuinely changed (the reason moved or broke, the timeline elapsed, price hit your own stated level) or a new idea truly clears the bar.
- Keep every field SHORT. This report gets read daily; nobody wants a wall of text. 1-3 sentences per field, always.
- thesis and exitPlan are bullet lists, not paragraphs. Semicolon-separated. Each bullet is one fact, under 14 words.
- Always fill watchlist with 1-4 names you do not already hold, each with a concrete wait (a price, a dip). Not "keeping an eye on tech."
- Always fill cashPurpose in one sentence: what the undeployed cash is waiting for. Sitting in cash without saying why is hiding the ball.`;
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
Once a week (Friday's close) you write a short recap of your paper portfolio. Bullets only. What you did, what moved, what you are watching next week. No paragraphs, no throat-clearing. The numbers below are already computed and correct; don't recompute or contradict them.`;
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
      ? "No open positions, 100% cash right now."
      : holdings
          .map((h) => {
            return [
              `### ${h.ticker}`,
              `- Entry: ${h.entry_date} (${h.daysHeld}d ago) at $${h.cost_basis.toFixed(2)}, now $${h.price.toFixed(2)} (${h.unrealizedPnlPct >= 0 ? "+" : ""}${(h.unrealizedPnlPct * 100).toFixed(1)}%, ${money(h.unrealizedPnl)})`,
              `- Position size: ${money(h.marketValue)} (${((h.marketValue / totalValue) * 100).toFixed(1)}% of the portfolio)`,
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
    : "You have not said what undeployed cash is for yet. Fill cashPurpose.";

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

Decide today's actions. Review every open holding above. Only add a new position if something genuinely clears your bar today; most days that's zero new positions. Fill watchlist and cashPurpose even on a no-trade day.`;
}
