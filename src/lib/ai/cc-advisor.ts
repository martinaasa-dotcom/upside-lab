import { STRATEGY } from "@/lib/calculations";
import { FORECAST_YEARS } from "@/lib/forecast";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { pulseSuggestion } from "@/lib/ai/humanize-copy";
import { insightsPromptBlock } from "@/lib/book-insights";
import {
  isFallbackForecastPlan,
  type ForecastPlan,
} from "@/lib/forecast-plan";
import {
  actionLabel,
  isEmptyPulseCheck,
  statusLabel,
  type PulseCheck,
} from "@/lib/thesis-pulse";
import {
  formatEarningsCalendarBlock,
  type EarningsCalendarRow,
} from "@/lib/market/earnings-dates";
import {
  SCREENSHOT_ISSUE_REASONS,
  screenshotIssueCopy,
} from "@/lib/screenshot-import-copy";
import { resolveImportTicker } from "@/lib/ticker";
import { tool } from "ai";
import { z } from "zod";
import { NO_VALUE } from "@/lib/format";

/** Client context snapshot sent with each chat request */
export type CcChatContext = {
  portfolioName: string;
  cashBalance: number;
  holdings: Array<{
    ticker: string;
    shares: number;
    buyPrice: number;
    price: number;
    cost: number;
    value: number;
    roiPct: number;
    roiDollar: number;
    pctOfTotal: number;
    todayPct: number | null;
    /** Unused. Older clients still send this; do not mention it to the model. */
    portfolios?: string[];
    marketState?: string | null;
    preMarketPrice?: number | null;
    preMarketChange?: number | null;
    preMarketChangePercent?: number | null;
    postMarketPrice?: number | null;
    postMarketChange?: number | null;
    postMarketChangePercent?: number | null;
  }>;
  rows: Array<{
    ticker: string;
    spot: number;
    callPct: number;
    stockTarget: number | null;
    distance: number | null;
    nextStrike: number | null;
    contracts: number;
    yield2w: number | null;
    premium: number | null;
    expiration: string | null;
  }>;
  totals: {
    cost: number;
    value: number;
    roiPct: number;
    roiDollar: number;
    yield2wAvg: number;
    premiumTotal: number;
  };
  /** Unused. Older clients still send this; the prompt ignores it. */
  otherPortfolios?: Array<{
    name: string;
    cashBalance: number;
    holdings: Array<{
      ticker: string;
      shares: number;
      buyPrice: number;
      callPct?: number;
      stockTarget?: number | null;
    }>;
  }>;
  /** Overview chat: advise only: no mutating tools */
  adviseOnly?: boolean;
  /** Viewer has not opted into options: Margus should never bring up
   * covered calls, Call %, strikes, or targets unprompted. Callers already
   * omit `rows` in this case; this also softens the system prompt itself. */
  hideOptions?: boolean;
  /** Yahoo marketState snapshot (PRE / REGULAR / POST / …) */
  marketState?: string | null;
  /** USD per 1 EUR (Yahoo EURUSD=X): for broker EUR→USD imports */
  eurUsd?: number | null;
  /** USD per 1 GBP */
  gbpUsd?: number | null;
  /** Not-owned-yet names Margus may discuss without polluting the portfolio */
  watchlist?: string[];
  /** Paper class portfolio. Margus is the lab assistant, not a stock picker. */
  classroom?: boolean;
  /** Live Yahoo calendar for the portfolio and watchlist. Do not invent dates. */
  earnings?: EarningsCalendarRow[];
  /** Per-ticker Lab notes + Pulse stamps already on this portfolio. */
  convictions?: Record<
    string,
    {
      level?: number;
      thesis?: string;
      stamps?: Array<{ at?: string; line?: string; verdict?: string }>;
    }
  >;
  /** Latest saved Pulse read per ticker (local + server cache). */
  pulseByTicker?: Record<string, PulseCheck>;
  /** Saved Forecast plan for this portfolio, when on a portfolio tab. */
  forecastPlan?: ForecastPlan | null;
  /**
   * How much investing the reader told onboarding they have done. It sets
   * how much explaining each answer carries, and nothing else: it is not
   * the options answer, which is its own flag (`hideOptions`), and a very
   * experienced investor can still have never touched an option.
   *
   * Read defensively. Older clients do not send it, and the chat route
   * passes the context through as it arrives, so anything that is not one
   * of the three words means nobody has answered and the voice sits in
   * the middle.
   */
  experienceTier?: string | null;
};

type AdvisorFx = { eurUsd: number | null; gbpUsd: number | null };

function toUsd(
  amount: number,
  currency: "USD" | "EUR" | "GBP",
  fx: AdvisorFx
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EUR") {
    return fx.eurUsd && fx.eurUsd > 0 ? amount * fx.eurUsd : amount;
  }
  if (currency === "GBP") {
    return fx.gbpUsd && fx.gbpUsd > 0 ? amount * fx.gbpUsd : amount;
  }
  return amount;
}

/** Tool names that only exist to plan/adjust covered calls: omitted
 * entirely (not just discouraged in the prompt) when the viewer told
 * onboarding they have no options experience. */
const OPTIONS_ONLY_TOOLS = [
  "setCallPct",
  "setCallPctBulk",
  "setUniformCallPct",
  "setStockTarget",
  "setStockTargetBulk",
  "clearStockTarget",
  "proposeWritePlan",
  "applyWritePlan",
] as const;

export function buildCcAdvisorTools(
  fx: AdvisorFx = { eurUsd: null, gbpUsd: null },
  opts: { hideOptions?: boolean } = {}
) {
  const allTools = {
  setCallPct: tool({
    description:
      "Set the Call % for one ticker. Call % is how far the Next Strike sits above the Stock Target. Example: stock target $100 and callPct 15 → next strike ~$115.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker symbol, e.g. NBIS"),
      callPct: z
        .number()
        .min(1)
        .max(40)
        .describe("Call percent as a whole number, e.g. 15 for 15%"),
    }),
    execute: async ({ ticker, callPct }) => ({
      action: "set_call_pct" as const,
      ticker: ticker.toUpperCase(),
      callPct: callPct / 100,
      callPctLabel: `${callPct}%`,
      message: `Updated ${ticker.toUpperCase()} Call % to ${callPct}%`,
    }),
  }),

  setCallPctBulk: tool({
    description:
      "Set Call % for several tickers in one step with DIFFERENT percentages per name. Preferred when the user wants safety, a wider gap, or a Call % that follows how much each company moves. Never flatten everything to one number.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            callPct: z.number().min(1).max(40),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "set_call_pct_bulk" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        callPct: u.callPct / 100,
        callPctLabel: `${u.callPct}%`,
      })),
      message: `Updated Call % for ${updates.length} ticker(s)`,
    }),
  }),

  setUniformCallPct: tool({
    description:
      "Set the SAME Call % for every ticker. ONLY use when the user explicitly asks for one identical number on all names. NEVER use this for safety, risk, buffer, or volatility requests: those must be per-ticker via setCallPctBulk or proposeWritePlan/applyWritePlan.",
    inputSchema: z.object({
      callPct: z
        .number()
        .min(1)
        .max(40)
        .describe("Call percent as a whole number, e.g. 12 for 12%"),
    }),
    execute: async ({ callPct }) => ({
      action: "set_uniform_call_pct" as const,
      callPct: callPct / 100,
      callPctLabel: `${callPct}%`,
      message: `Set all tickers to Call % ${callPct}%`,
    }),
  }),

  updateHolding: tool({
    description:
      "Update shares and/or buy price for an existing holding. Use when the share count or what they paid per share needs correcting.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker symbol, e.g. CRWV"),
      shares: z
        .number()
        .positive()
        .optional()
        .describe("New share count (omit to leave unchanged)"),
      buyPrice: z
        .number()
        .positive()
        .optional()
        .describe("New average buy price in USD (omit to leave unchanged)"),
    }),
    execute: async ({ ticker, shares, buyPrice }) => {
      const parts: string[] = [];
      if (shares != null) parts.push(`${shares} shares`);
      if (buyPrice != null) parts.push(`buy $${buyPrice}`);
      return {
        action: "update_holding" as const,
        ticker: ticker.toUpperCase(),
        shares: shares ?? null,
        buyPrice: buyPrice ?? null,
        message: `Updated ${ticker.toUpperCase()}${parts.length ? `: ${parts.join(", ")}` : ""}`,
      };
    },
  }),

  setCash: tool({
    description:
      "Set the portfolio cash balance in USD. It may be negative on any portfolio: money the broker lent the reader is carried as cash below zero.",
    inputSchema: z.object({
      cash: z
        .number()
        .describe("Cash balance in USD, e.g. 0, 2500, or -7000 when borrowed"),
    }),
    execute: async ({ cash }) => ({
      action: "set_cash" as const,
      cash,
      message: `Set cash balance to $${cash.toLocaleString()}`,
    }),
  }),

  addHolding: tool({
    description:
      "Add or overwrite ONE holding. Use for single-ticker broker screens (Lightyear detail: Shares + Avg buy). For multi-row portfolio tables use importPortfolio instead.",
    inputSchema: z.object({
      ticker: z
        .string()
        .describe(
          "Symbol as shown (€RHM → RHM). EU names become Yahoo e.g. RHM.DE when possible."
        ),
      isin: z.string().optional().describe("ISIN if visible"),
      shares: z.number().positive().describe("Share count: keep full decimals"),
      buyPrice: z
        .number()
        .positive()
        .describe("Average buy / cost per share in `currency`"),
      currency: z
        .enum(["USD", "EUR", "GBP"])
        .optional()
        .describe("€ → EUR, $ → USD. Default USD"),
      callPct: z
        .number()
        .min(1)
        .max(40)
        .optional()
        .describe("Optional Call %, default ~15"),
    }),
    execute: async ({ ticker, isin, shares, buyPrice, currency, callPct }) => {
      const resolved = resolveImportTicker(ticker, isin);
      const cur = currency ?? "USD";
      const buyUsd = toUsd(buyPrice, cur, fx);
      return {
        action: "add_holding" as const,
        ticker: resolved,
        shares,
        buyPrice: buyUsd,
        callPct: callPct != null ? callPct / 100 : STRATEGY.defaultCallPct,
        message: `Added ${resolved}: ${shares} @ $${buyUsd.toFixed(2)} (from ${cur} ${buyPrice})`,
      };
    },
  }),

  importPortfolio: tool({
    description:
      "Import an entire portfolio in ONE call from a spreadsheet OR broker portfolio screenshot (Lightyear, etc.). Include every investment row. Prefer markValue (what the holding is worth) when the average buy price is missing: never stall asking what they paid. Fold multi-currency cash + tiny MMFs into cashUsd. Call once with the full list.",
    inputSchema: z.object({
      cash: z
        .number()
        .optional()
        .describe(
          "Legacy: cash already in USD. Prefer cashUsd / cashNative."
        ),
      cashUsd: z
        .number()
        .optional()
        .describe(
          "Total cash in USD after converting EUR/GBP cash rows + optional tiny MMF residual."
        ),
      cashNative: z
        .number()
        .optional()
        .describe("Cash amount in cashCurrency before FX (e.g. EUR cash total)"),
      cashCurrency: z
        .enum(["USD", "EUR", "GBP"])
        .optional()
        .describe("Currency for cashNative; default USD"),
      replace: z
        .boolean()
        .optional()
        .describe(
          "True for full broker portfolio screenshots: remove tickers in this portfolio that are not in holdings. Default true for portfolio-breakdown imports."
        ),
      holdings: z
        .array(
          z.object({
            ticker: z
              .string()
              .describe(
                "Symbol column (RHM, VUAA, GOOGL…). Never CASH / PORTFOLIO / totals / MMF symbols you folded into cash."
              ),
            isin: z
              .string()
              .optional()
              .describe("ISIN if visible: used to pick Yahoo suffix (.DE / .L)"),
            shares: z.number().positive(),
            buyPrice: z
              .number()
              .positive()
              .optional()
              .describe(
                "Average buy/cost per share in `currency` if shown. Omit when the portfolio only has market Value."
              ),
            markValue: z
              .number()
              .positive()
              .optional()
              .describe(
                "What the holding is worth in `currency` (Value column). Required when buyPrice is missing: implied cost = markValue / shares."
              ),
            currency: z
              .enum(["USD", "EUR", "GBP"])
              .optional()
              .describe(
                "Native currency of buyPrice/markValue from the Value column (€ → EUR, $ → USD). Default USD."
              ),
            callPct: z
              .number()
              .min(1)
              .max(40)
              .optional()
              .describe("Optional Call % whole number; a volatility-scaled default is used if omitted"),
          })
        )
        .min(1)
        .describe("Every investment / equity / ETF / bond row (not cash lines)"),
    }),
    execute: async ({
      cash,
      cashUsd,
      cashNative,
      cashCurrency,
      replace,
      holdings,
    }) => {
      const SKIP = new Set([
        "CASH",
        "PORTFOLIO",
        "TOTAL",
        "TOTALS",
        "UNREALIZED",
        "UNREALIZED PROFITS",
        "UNREALIZEDPROFIT",
        "INVESTMENTS",
        "MMFS",
        "MONEYMARKET",
      ]);
      const notes: string[] = [];
      const cleaned: Array<{
        ticker: string;
        shares: number;
        buyPrice: number;
        callPct: number;
      }> = [];

      for (const h of holdings) {
        const ticker = resolveImportTicker(h.ticker, h.isin);
        if (
          !ticker ||
          SKIP.has(ticker) ||
          SKIP.has(h.ticker.trim().toUpperCase()) ||
          ticker.startsWith("UNREALIZED") ||
          ticker.startsWith("CASH")
        ) {
          continue;
        }
        if (!Number.isFinite(h.shares) || h.shares <= 0) continue;

        const currency = h.currency ?? "USD";
        let buyNative: number | null = null;
        if (h.buyPrice != null && h.buyPrice > 0) buyNative = h.buyPrice;
        else if (h.markValue != null && h.markValue > 0) {
          buyNative = h.markValue / h.shares;
          notes.push(`${ticker} cost←mark`);
        }
        if (buyNative == null || !(buyNative > 0)) {
          notes.push(`skipped ${ticker} (no buy/mark)`);
          continue;
        }

        const buyPrice = toUsd(buyNative, currency, fx);
        if (
          currency !== "USD" &&
          ((currency === "EUR" && !(fx.eurUsd && fx.eurUsd > 0)) ||
            (currency === "GBP" && !(fx.gbpUsd && fx.gbpUsd > 0)))
        ) {
          notes.push(`${ticker} FX missing, stored 1:1 as USD`);
        }

        cleaned.push({
          ticker,
          shares: h.shares,
          buyPrice,
          callPct: h.callPct != null ? h.callPct / 100 : STRATEGY.defaultCallPct,
        });
      }

      const byTicker = new Map<string, (typeof cleaned)[number]>();
      for (const row of cleaned) byTicker.set(row.ticker, row);
      const rows = [...byTicker.values()];
      const tickers = rows.map((h) => h.ticker);

      let resolvedCash: number | null = null;
      if (cashUsd != null && Number.isFinite(cashUsd)) resolvedCash = cashUsd;
      else if (cashNative != null && Number.isFinite(cashNative)) {
        resolvedCash = toUsd(cashNative, cashCurrency ?? "USD", fx);
      } else if (cash != null && Number.isFinite(cash)) resolvedCash = cash;

      const replaceBook = replace !== false;

      return {
        action: "import_portfolio" as const,
        cash: resolvedCash,
        replace: replaceBook,
        holdings: rows,
        message: `Imported ${rows.length} holding${rows.length === 1 ? "" : "s"}${
          resolvedCash != null
            ? ` + cash $${resolvedCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : ""
        }${replaceBook ? " (replace portfolio)" : ""}: ${tickers.join(", ")}${
          notes.length ? ` · ${notes.slice(0, 6).join("; ")}` : ""
        }`,
      };
    },
  }),

  reportScreenshotIssue: tool({
    description:
      "Call this instead of addHolding/importPortfolio when the attached image is not a holdings screenshot you can import. Apple Stocks, a watchlist, prices + daily change only, news, a chart, a cropped/blurry shot, tickers with no share counts, or shares with no cost/value. Do not guess numbers. The tool writes the explanation the user will see.",
    inputSchema: z.object({
      reason: z
        .enum(SCREENSHOT_ISSUE_REASONS)
        .describe(
          "not_holdings = Stocks app / watchlist / prices only. unreadable = cropped, dark, or blurry. missing_shares = tickers but no share counts. missing_cost = shares but no average buy price and no value."
        ),
    }),
    execute: async ({ reason }) => {
      const copy = screenshotIssueCopy(reason);
      return {
        action: "report_screenshot_issue" as const,
        reason,
        title: copy.title,
        lines: copy.lines,
        message: copy.lines.join("\n"),
      };
    },
  }),

  removeHolding: tool({
    description: "Remove a ticker from the portfolio holdings.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker to remove"),
    }),
    execute: async ({ ticker }) => ({
      action: "remove_holding" as const,
      ticker: ticker.toUpperCase(),
      message: `Removed ${ticker.toUpperCase()} from holdings`,
    }),
  }),

  setStockTarget: tool({
    description:
      "Set the Stock Target price for one ticker: the price level you want to write covered calls toward. Overrides the level the app picks on its own. Next Strike = Stock Target × (1 + Call %).",
    inputSchema: z.object({
      ticker: z.string(),
      stockTarget: z
        .number()
        .positive()
        .describe("Stock target price in USD, e.g. 110"),
    }),
    execute: async ({ ticker, stockTarget }) => ({
      action: "set_stock_target" as const,
      ticker: ticker.toUpperCase(),
      stockTarget,
      message: `Set ${ticker.toUpperCase()} Stock Target to $${stockTarget}`,
    }),
  }),

  setStockTargetBulk: tool({
    description:
      "Set Stock Target prices for several tickers at once. Use when picking write levels across the portfolio.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            stockTarget: z.number().positive(),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "set_stock_target_bulk" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        stockTarget: u.stockTarget,
      })),
      message: `Updated Stock Target for ${updates.length} ticker(s)`,
    }),
  }),

  clearStockTarget: tool({
    description:
      "Clear a manual Stock Target so the ticker goes back to the level the app picks on its own.",
    inputSchema: z.object({
      ticker: z.string(),
    }),
    execute: async ({ ticker }) => ({
      action: "clear_stock_target" as const,
      ticker: ticker.toUpperCase(),
      message: `Cleared ${ticker.toUpperCase()} Stock Target override (back to auto)`,
    }),
  }),

  proposeWritePlan: tool({
    description:
      "Work out covered-call expiries, what an option would pay, and strikes. When looking over the CURRENT table plan, ALWAYS pass each holding's stockTarget + callPct from the covered-call rows so you do not overwrite a level the reader set by hand. Only omit stockTarget/callPct when the user asks for the targets to be picked again from the prices the stock has bounced off before.",
    inputSchema: z.object({
      holdings: z
        .array(
          z.object({
            ticker: z.string(),
            shares: z.number().positive(),
            price: z.number().positive().optional(),
            stockTarget: z
              .number()
              .positive()
              .optional()
              .describe(
                "The Stock Target already in the table: pass this when looking over the existing plan"
              ),
            callPct: z
              .number()
              .min(1)
              .max(40)
              .optional()
              .describe(
                "The Call % already in the table, as a whole number e.g. 18 for 18%: pass when looking over the existing plan"
              ),
          })
        )
        .min(1),
    }),
    execute: async ({ holdings }) => {
      const { buildWritePlans } = await import("@/lib/market/write-plan");
      const plans = await buildWritePlans(
        holdings.map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          // `spot` is what the planner calls it internally. The word never
          // reaches the model or the reader, so the tool asks for `price`.
          spot: p.price,
          stockTarget: p.stockTarget,
          callPct: p.callPct,
        }))
      );
      return {
        action: "propose_write_plan" as const,
        plans,
        message: plans.map((p) => p.summary).join("\n"),
      };
    },
  }),

  applyWritePlan: tool({
    description:
      "Apply Stock Target + Call % from a write plan (after proposeWritePlan). Does not change shares. Pass callPct as whole number e.g. 15 for 15%.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            stockTarget: z.number().positive(),
            callPct: z.number().min(1).max(40),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "apply_write_plan" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        stockTarget: u.stockTarget,
        callPct: u.callPct / 100,
      })),
      message: `Applied write plan to ${updates.length} ticker(s)`,
    }),
  }),
  };

  if (!opts.hideOptions) return allTools;

  const filtered = { ...allTools };
  for (const key of OPTIONS_ONLY_TOOLS) delete filtered[key];
  return filtered;
}

export type CcAdvisorTools = ReturnType<typeof buildCcAdvisorTools>;

function fmtPctLabel(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return NO_VALUE;
  return `${(pct * 100).toFixed(2)}%`;
}

function fmtPriceLabel(price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return NO_VALUE;
  return String(price);
}

function holdingExtendedHoursLine(h: CcChatContext["holdings"][number]): string {
  const bits: string[] = [];
  if (h.marketState) bits.push(`session=${h.marketState}`);
  if (h.preMarketPrice != null || h.preMarketChangePercent != null) {
    bits.push(
      `preMarket=${fmtPriceLabel(h.preMarketPrice)} (${fmtPctLabel(h.preMarketChangePercent)})`
    );
  }
  if (h.postMarketPrice != null || h.postMarketChangePercent != null) {
    bits.push(
      `afterHours=${fmtPriceLabel(h.postMarketPrice)} (${fmtPctLabel(h.postMarketChangePercent)})`
    );
  }
  return bits.length ? `, ${bits.join(", ")}` : "";
}

function margusMemoryBlock(ctx: CcChatContext): string {
  const conv = ctx.convictions ?? {};
  const pulse = ctx.pulseByTicker ?? {};
  const plan = ctx.forecastPlan;
  const tickers = new Set<string>([
    ...Object.keys(conv),
    ...Object.keys(pulse),
    ...(plan?.eoyTargets ?? []).map((t) => t.ticker.toUpperCase()),
  ]);
  if (tickers.size === 0 && !plan) return "";

  const lines: string[] = [
    "### Margus memory on this portfolio (already saved in Upside Lab: answer from here; never say you have no take when this block has content)",
  ];

  for (const key of [...tickers].sort()) {
    const entry = conv[key];
    const check = pulse[key];
    const bits: string[] = [`**$${key}**`];
    if (entry?.thesis?.trim()) {
      bits.push(`why they own it: "${entry.thesis.trim().slice(0, 400)}"`);
    }
    if (entry?.level != null) bits.push(`how sure: ${entry.level}/5`);
    const stamp = entry?.stamps?.at(-1);
    if (stamp?.line?.trim()) {
      bits.push(
        `last Pulse (${stamp.at?.slice(0, 10) ?? "?"}): ${stamp.line.trim()}`
      );
    }
    if (check && !isEmptyPulseCheck(check)) {
      const note =
        pulseSuggestion(check) ||
        check.verdict?.trim() ||
        check.moveReason?.trim() ||
        "";
      bits.push(
        `Pulse now: ${statusLabel(check.thesisStatus)}, ${actionLabel(check.action)}${note ? `: ${note}` : ""}`
      );
    }
    lines.push(`- ${bits.join(" · ")}`);
  }

  if (plan && !isFallbackForecastPlan(plan)) {
    lines.push("");
    lines.push(
      `Forecast (${plan.portfolioName}, worked out ${plan.generatedAt.slice(0, 10)}):`
    );
    if (plan.generalAdvice?.trim()) lines.push(plan.generalAdvice.trim());
    if (plan.sectorRotation?.trim()) lines.push(plan.sectorRotation.trim());
    /*
      The last year the forecast covers, never the literal 2030. Read as a
      literal, this went quiet on the first of January: a path running to
      2031 has no 2030 key, so `end` is undefined for every holding and
      Margus loses the whole forecast from the context with nothing saying
      so. The reader would have asked about a company and been answered by
      somebody who could no longer see its price path.
    */
    const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
    for (const row of plan.eoyTargets ?? []) {
      const end = row.prices?.[lastYear];
      const why = row.rationale?.trim();
      if (end != null && why) {
        lines.push(
          `- $${row.ticker.toUpperCase()} end ${lastYear} ~$${end.toFixed(0)}: ${why.slice(0, 220)}`
        );
      }
    }
  }

  lines.push("");
  lines.push(
    "If they ask about Pulse or Forecast, use this block first. Never say you have not given thoughts when data is here. If a ticker is missing, say Upside Lab has not run it yet and they can open Pulse or Forecast (or tap refresh there) to run it."
  );

  return lines.join("\n");
}

/**
 * How much explaining every answer carries, from the one question
 * onboarding asked about how much investing they have done.
 *
 * The words are short on purpose. A long block here competes with the
 * persona's own voice section, and the thing that actually changes between
 * these three readers is how much a sentence has to stop and explain
 * itself, not what is true. Somebody who has never done this needs one
 * idea at a time and the dollar figure before the percent, because a
 * percent of a number you have not been told is not a fact you can feel.
 * Somebody who trades every week is slowed down by both.
 *
 * An unanswered tier gets nothing, which leaves the persona's own rule
 * standing: explain the one word they would have had to look up.
 */
function experienceVoiceBlock(tier: string | null | undefined): string {
  const answer = String(tier ?? "").trim().toLowerCase();
  if (answer === "novice") {
    return `
### Who is reading, and how much to explain
This reader told us they are new to investing. One idea per paragraph, and keep the paragraphs to two or three sentences. The first time any word from investing appears, say what it means in the same sentence, in about six words, then carry on. Lead with the dollar figure and put the percent after it, because a percent on its own is hard to feel. No cashtag arithmetic stacked into one line. Never suggest they should already have known something.
`;
  }
  if (answer === "investor") {
    return `
### Who is reading, and how much to explain
This reader has bought and sold shares before and is comfortable with the ordinary words. Give them the figures without stopping to define percent, dividend or market value. Explain only the genuinely specialist words, once. Still whole sentences, still no jargon from a trading desk.
`;
  }
  if (answer === "advanced") {
    return `
### Who is reading, and how much to explain
This reader trades actively and wants the short form. Answer in as few sentences as the question honestly takes, figures first, no glosses, no warm-up. The plain-words rule still holds, because plain is not the same as slow.
`;
  }
  return "";
}

export function buildCcSystemPrompt(ctx: CcChatContext): string {
  const holdingsTable =
    ctx.holdings.length === 0
      ? "(no holdings)"
      : ctx.holdings
          .map((h) => {
            return `${h.ticker}: shares=${h.shares}, paidEach=${h.buyPrice}, price=${h.price}, cost=${h.cost.toFixed(0)}, value=${h.value.toFixed(0)}, gain%=${(h.roiPct * 100).toFixed(1)}%, gain$=${h.roiDollar.toFixed(0)}, shareOfPortfolio%=${(h.pctOfTotal * 100).toFixed(1)}%, today=${h.todayPct != null ? (h.todayPct * 100).toFixed(1) + "%" : NO_VALUE}${holdingExtendedHoursLine(h)}`;
          })
          .join("\n");

  const hideOptions = Boolean(ctx.hideOptions);

  const ccTable = hideOptions
    ? "(not applicable: viewer has no options experience, covered calls are hidden for them)"
    : ctx.rows.length === 0
      ? "(no CC rows)"
      : ctx.rows
          .map((r) => {
            const strikeAboveToday =
              r.nextStrike != null && r.spot > 0
                ? (r.nextStrike - r.spot) / r.spot
                : null;
            return `${r.ticker}: price=${r.spot}, call%=${(r.callPct * 100).toFixed(0)}%, stockTarget=${r.stockTarget ?? NO_VALUE}, distanceToTarget=${r.distance != null ? (r.distance * 100).toFixed(1) + "%" : NO_VALUE}, nextStrike=${r.nextStrike ?? NO_VALUE}, strikeAboveTodayPct=${strikeAboveToday != null ? (strikeAboveToday * 100).toFixed(1) + "%" : NO_VALUE}, contracts=${r.contracts}, ccYield=${r.yield2w != null ? (r.yield2w * 100).toFixed(2) + "%" : NO_VALUE}, premium=${r.premium ?? NO_VALUE}, exp=${r.expiration ?? NO_VALUE}`;
          })
          .join("\n");

  const adviseOnly = Boolean(ctx.adviseOnly);

  const optionsGuard = hideOptions
    ? `\n\nThis viewer has not opted into options. Covered calls are hidden everywhere in their UI. NEVER mention covered calls, Call %, strikes, premiums, "stock target", or options strategies, not even to suggest learning about them. Talk about size and why they own a name. Never write orders to buy or sell. If they explicitly ask about options, briefly answer their question but note this isn't your focus for their account and don't proactively bring it up again.`
    : "";

  const writeBlock = adviseOnly
    ? `This look is read-only. There is no portfolio to write to yet, and there are NO write tools.
If they ask to add or edit holdings, tell them to add a holding on Home. Never ask them to pick a portfolio.`
    : `You can READ holdings${hideOptions ? "" : " + covered-call data"} below, and WRITE via tools:
- Holdings: importPortfolio (preferred for screenshots / multi-ticker imports), updateHolding, addHolding, removeHolding, reportScreenshotIssue, setCash${
        hideOptions
          ? ""
          : `
- Covered calls: setCallPct, setCallPctBulk, setUniformCallPct
- Stock targets: setStockTarget, setStockTargetBulk, clearStockTarget
- Write planning: proposeWritePlan (analyze), applyWritePlan (commit targets + Call %)`
      }

Tools ALWAYS apply to this portfolio (${ctx.portfolioName}). Never ask the reader to pick a portfolio. Never mention other portfolios. Never offer to copy from another portfolio.

When the user pastes or attaches a screenshot (spreadsheet, broker app, portfolio table, OR single-ticker detail) or asks to import holdings:

**A) Single-ticker broker detail screen** (Lightyear etc.: big symbol like €RHM, fields Shares / Avg buy / Invested / chart):
1. Read ticker (strip €/$ prefix), Shares (full decimals), Avg buy (what they paid per share on average, NOT the live price at the top).
2. Currency from € → EUR, $ → USD.
3. Call addHolding ONCE with ticker, shares, buyPrice=Avg buy, currency. Example: RHM, 2.889580565, buyPrice 1239.69, currency EUR → Yahoo RHM.DE.
4. Do NOT use the live price as buyPrice. Do NOT refuse. Do NOT ask clarifying questions first. Tool first, then confirm.
5. replace is NOT needed; upsert this one name only.

**B) Multi-row portfolio / breakdown table**:
1. Call importPortfolio ONCE with EVERY investment row: never stop after the first ticker, never chain addHolding instead.
2. If Quantity + Value but NO Avg buy: set markValue = Value and currency from €/$. buyPrice optional.
3. Pass isin when visible (RHM + DE ISIN → RHM.DE). US ISINs stay bare.
4. Cash: sum Cash-EUR/USD/GBP (cashNative+cashCurrency or cashUsd). Tiny MMFs → fold into cash.
5. Skip headers and totals. replace=true when the screenshot is a whole portfolio.
6. Prefer importPortfolio over a chain of addHolding / setCash.

**C) Not a holdings screenshot** (Apple Stocks, a watchlist, prices + daily % only, news, a chart, cropped/blurry, tickers with no share counts):
1. Do NOT guess shares or invent a buy price. Do NOT call addHolding or importPortfolio.
2. Call reportScreenshotIssue once with the closest reason: not_holdings, unreadable, missing_shares, or missing_cost.
3. Stop. The tool already wrote what is missing and what to send instead. Do not add a second explanation.

After addHolding / importPortfolio: reply in 2 to 4 sentences confirming ticker, shares, USD cost, and never go silent.

FX for imports (USD per 1 unit): EURUSD=${ctx.eurUsd != null ? ctx.eurUsd.toFixed(4) : "unknown"} · GBPUSD=${ctx.gbpUsd != null ? ctx.gbpUsd.toFixed(4) : "unknown"}.`;

  const ccGuidanceBlock = hideOptions
    ? ""
    : `
When the user asks you to look over the CURRENT plan (or “current targets”):
1. Use the Covered-call rows snapshot as ground truth (and/or proposeWritePlan WITH stockTarget+callPct passed through).
2. Talk about those exact levels: do NOT invent new Stock Targets or Call %.
3. Do NOT call applyWritePlan / setStockTarget unless they ask to change something.
4. Use the column names as the app uses them (see glossary). Distance is never the gap between today's price and the strike.

When the user asks to pick NEW stock targets, re-find the prices a stock has bounced off before, or rebuild the plan from scratch:
1. Call proposeWritePlan with ticker + shares + price only (omit stockTarget/callPct so the plan can pick them again).
2. Say what it came back with; apply only if they ask.

### Covered Call Targets: column glossary (memorize this)
This table is the WRITE PLAN, not a listing of every option available.

1. **price**: the last regular-session price, or the best one available. For overnight talk use the preMarket and afterHours fields.
2. **Stock Target**: the price level you are writing *toward*. Usually a price the stock has bounced off before, or one the reader set by hand. It is NOT the option strike.
3. **Call %**: the safety gap ABOVE Stock Target. It scales with how much the stock moves. Example: target $100 and Call 15% gives a Next Strike of $115.
4. **Distance**: how far today's price is from Stock Target = (Stock Target − price) / price.
   - Positive = the price is still below the target, so there is room before the write level.
   - Negative = the price has already gone past the target, so the plan is out of date or ambitious.
   - Distance is not the gap up to the strike, and it is not Call %.
5. **Next Strike**: the call strike you aim to sell = Stock Target × (1 + Call %).
6. **strikeAboveTodayPct**: how far Next Strike sits above today's price = (Next Strike − price) / price. This is the figure that goes with what the option pays.
7. **Contracts**: floor(shares / 100).
8. **CC yield / Premium**: the live middle price for that Next Strike and expiry, divided by today's price (and the total dollars for all contracts).
9. **Expiration**: an expiry roughly 2 to 3 weeks out, chosen around the results date.
10. **preMarket / afterHours**: the last price outside normal hours and its percent against the previous close, when Yahoo has them. Use these when the user asks about before the open, after the close, an overnight jump, or “what’s moving before the open”. Format as a real Markdown table (one row per line) or tight bullets: never a single jammed pipe paragraph.
11. **session / marketState**: Yahoo's session flag (PREPRE, PRE, REGULAR, POST, POSTPOST, CLOSED, …). When PRE/PREPRE lean on preMarket; when POST/POSTPOST lean on afterHours.

Example (do not confuse these):
- price $188, Stock Target $205, Call 22% gives Distance about +9% to the target, a Next Strike near $250, and strikeAboveTodayPct about +33%.
- Calling that a "9% gap to the strike" is wrong: 9% is the distance to the target, and the strike is about 33% above today's price.

When you look a plan over, the things worth saying are:
- Whether Stock Target is still a sensible level to write toward, next to today's price and the prices this stock has bounced off before.
- Whether Call % matches how much this particular stock actually moves.
- How far above today's price the strike sits. A strike far above it is one the option pays very little for, and a smaller Call % or a nearer target is what would change that.
- Where the results date falls against the expiry.
- Distance and the gap up to the strike are two different numbers. Do not use one for the other.

How the write plan is built:
- Expiry: ${STRATEGY.minDaysPreferred} to ${STRATEGY.maxDaysPreferred} days out, about 2 to 3 weeks. Up to about ${STRATEGY.maxDaysExtended} days when the results date forces a longer one.
- An expiry that ends before the results date is preferred. When there is none, the expiry runs past results and the Call % is wider.
- Call % always follows how much that one stock has actually moved. There is no single number for the whole portfolio.
  · Calmer, steadier companies: about ${(STRATEGY.callPctSafeMin * 100).toFixed(0)} to ${(STRATEGY.callPctSafeMax * 100).toFixed(0)}%.
  · Ordinary growing companies: around ${(STRATEGY.callPctSafeMax * 100).toFixed(0)} to ${(STRATEGY.callPctMid * 100).toFixed(0)}%.
  · Jumpy, speculative ones: around ${(STRATEGY.callPctMid * 100).toFixed(0)} to ${(STRATEGY.callPctHighBeta * 100).toFixed(0)}%.
  · "I want safety" means the jumpy ones get a wider gap and the calm ones stay near their own level. NOT setUniformCallPct to one number for everything.
  · Prefer proposeWritePlan or setCallPctBulk with a value per ticker, each read off how much that company's own share price moves: the more it moves, the wider the gap. Say in one plain clause how much it moves and why that gave the number.
  · After that, the results date and the distance to the stock target each move the number a little.
- The plan aims for about ${(STRATEGY.targetYield * 100).toFixed(0)}% of the share price over the period, and treats anything under about ${(STRATEGY.minYield * 100).toFixed(0)}% as too little to be worth it. That is what the app aims for, not a level to tell the reader to hit.
- The app's own window for placing one of these is ${STRATEGY.executionWindow}.
`;

  const totalsLine = hideOptions
    ? `Portfolio totals: cost=${ctx.totals.cost.toFixed(0)}, value=${ctx.totals.value.toFixed(0)}, gain%=${(ctx.totals.roiPct * 100).toFixed(1)}%, gain$=${ctx.totals.roiDollar.toFixed(0)}`
    : `Portfolio totals: cost=${ctx.totals.cost.toFixed(0)}, value=${ctx.totals.value.toFixed(0)}, gain%=${(ctx.totals.roiPct * 100).toFixed(1)}%, gain$=${ctx.totals.roiDollar.toFixed(0)}, ccYieldAvg=${(ctx.totals.yield2wAvg * 100).toFixed(2)}%, premiumTotal=${ctx.totals.premiumTotal.toFixed(2)}`;

  const ccRowsSection = hideOptions
    ? ""
    : `

Covered-call rows:
${ccTable}`;

  const tierVoiceBlock = experienceVoiceBlock(ctx.experienceTier);

  const classroomBlock = ctx.classroom
    ? `
### Classroom portfolio
This is a paper class portfolio, not a real brokerage account. You are the lab assistant.
Explain what a move means for their written why. Never tell them what to buy, sell, add, or skip.
If they ask what they should buy, turn it back: what do they believe, over what time, and what would prove them wrong.
Keep the educational disclaimer.
`
    : "";

  return `${MARGUS_PERSONA}
${classroomBlock}
This chat is for your portfolio ("${ctx.portfolioName}"). Never ask the reader to pick a portfolio. Never say "your portfolios" or "your other portfolios".

${writeBlock}
${ccGuidanceBlock}${tierVoiceBlock}
### How you talk in this chat
Same voice as the Sunday letter. You, your. Connected paragraphs. The question first, then the mix if it matters, then the facts. Never a telegram. Never "this person".

Answer the question they asked, at the level they asked it. A short question gets a short answer. Do not turn "how is my portfolio doing" into a five-part review.

Assume no background unless they show one. If you have to use a term from investing, define it in the same breath, in about six words, and then move on. Never stop to lecture, and never make them feel behind for asking.

If a question is common and reasonable but rests on a wrong idea (that a stock going up means it is now safer, that a fall must be recovered by the same stock, that a fund and its biggest holding are different bets), say the true thing plainly and kindly, then answer what they meant.

If they ask what a company is or how it makes money, then short bullets, one line each:

- **What it is**: one plain line a grandma would understand. The persona's word bans apply here in full. Thesis is fine.
- **What moves it**: the one or two things that actually set the price.
- **What has to go right**: the specific thing, not a vibe.
- **The risk**: the specific thing that breaks it. Name it.
- **What you hold**: only if they hold it. How big a share of their portfolio it is, what they paid against today's price, and what that means for them.

No opening preamble ("Great question", "Let's break this down") and no
closing summary paragraph.

Prefer tools over invented numbers. After tools, briefly confirm.
None of this is personalized investment advice or a recommendation to buy, sell, or hold. You are describing prices and why they own the company. Never write orders: do not add, sell some, look to add, buy this, trim 10%, sit tight, start small. Never confirm that a move fits the reader.${optionsGuard}

Market session: ${ctx.marketState ?? "unknown"}
Watchlist (not owned, discuss freely, never invent a holding in the portfolio): ${(ctx.watchlist ?? []).join(", ") || "(none)"}
${formatEarningsCalendarBlock(ctx.earnings ?? [])}
${margusMemoryBlock(ctx)}
${insightsPromptBlock(
  ctx.holdings.map((h) => ({
    ticker: h.ticker,
    value: h.value,
    todayPct: h.todayPct,
  }))
)}
Cash: ${ctx.cashBalance}
${totalsLine}

Holdings (includes preMarket / afterHours when available):
${holdingsTable}${ccRowsSection}`;
}
