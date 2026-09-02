import { requireCronAuth } from "@/lib/cron-auth";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { getAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import {
  MARGUS_FUND_COLUMNS,
  MARGUS_FUND_HOLDING_COLUMNS,
  PORTFELL_TABLES,
} from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import {
  lastCompletedUsSessionKey,
  pinQuotesToSessionClose,
  tradingDaysBetween,
  usWeekMondayKey,
} from "@/lib/market/session";
import { fetchFearGreedIndex } from "@/lib/market/fear-greed-fetch";
import { logEvent } from "@/lib/telemetry";
import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { humanizeMargusText, humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildFundSystemPrompt,
  buildFundUserPrompt,
  buildWeeklyRecapSystemPrompt,
  buildWeeklyRecapUserPrompt,
  fundDecisionSchema,
  weeklyRecapSchema,
  type FundAction,
  type FundHolding,
  type PricedHolding,
} from "@/lib/margus-fund";
import { sanitizeFundWatchlist } from "@/lib/fund-watchlist";
import { stripReportSerialPrefix } from "@/lib/fund-copy";
import {
  composeDailyFundPost,
  composeWeeklyFundPost,
  type FundXPostInput,
} from "@/lib/fund-x-copy";
import { postTweet, xPostingEnabled } from "@/lib/x-post";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-log";
import { generateObject } from "ai";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

const fundIntentSchema = fundDecisionSchema.pick({
  watchlist: true,
  cashPurpose: true,
});

/** When today's report already exists, still fill watchlist/cash purpose
 * once so the public page isn't blank until tomorrow's trade run. */
async function maybeFillFundIntent(
  supabase: SupabaseClient,
  fundRow: {
    cash: number;
    watchlist?: unknown;
    cash_purpose?: string | null;
  },
  holdings: FundHolding[]
): Promise<boolean> {
  const watchlistEmpty =
    !Array.isArray(fundRow.watchlist) || fundRow.watchlist.length === 0;
  const purposeEmpty = !String(fundRow.cash_purpose ?? "").trim();
  if (!watchlistEmpty && !purposeEmpty) return false;

  const chain = buildAdvisorProviderChain({ reasoning: true });
  if (chain.length === 0) return false;

  const held = holdings.map((h) => h.ticker);
    const { object: raw } = await withAdvisorFallback(
    chain,
    (model, _id, signal) =>
      generateObject({
        model,
        schema: fundIntentSchema,
        providerOptions: STRUCTURED_PROVIDER_OPTIONS,
        abortSignal: signal,
        system: buildFundSystemPrompt(),
        prompt: `Today's trades already happened. Do not open, add, trim, or exit anything. Fill watchlist (1-4 names you do not hold, each with a concrete wait) and cashPurpose (one sentence on why undeployed cash is sitting).

Cash: $${Math.round(Number(fundRow.cash)).toLocaleString("en-US")}
Open holdings: ${held.join(", ") || "none"}`,
      }),
    { deadlineAt: Date.now() + 60_000 }
  );
  const intent = humanizeMargusTree(raw);
  const watchlist = sanitizeFundWatchlist(intent.watchlist, held).map((w) => ({
    ticker: w.ticker,
    waitFor: humanizeMargusText(w.waitFor),
  }));
  const cashPurpose = humanizeMargusText(intent.cashPurpose ?? "").trim();
  await supabase
    .from(PORTFELL_TABLES.margusFund)
    .update({
      watchlist,
      cash_purpose: cashPurpose || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "main");
  return true;
}

function isFridayKey(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay() === 5;
}

/**
 * Best-effort weekly recap after a Friday US session. Uses the session
 * date, not UTC day-of-week, so a Saturday-morning catch-up of Friday
 * still writes the recap. Never throws -- a recap failure shouldn't
 * fail the whole cron run.
 */
async function maybeGenerateWeeklyRecap(
  supabase: SupabaseClient,
  weekEnding: string,
  fundStartingCapital: number,
  pricedHoldings: PricedHolding[],
  xCard: Omit<FundXPostInput, "serial">
): Promise<void> {
  if (!isFridayKey(weekEnding)) return;

  try {
    const { data: existing } = await supabase
      .from(PORTFELL_TABLES.margusFundWeeklyRecaps)
      .select("id")
      .eq("week_ending", weekEnding)
      .maybeSingle();
    if (existing) return;

    const { data: recentReports } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("report_date, portfolio_value, spy_price, actions")
      .order("report_date", { ascending: false })
      .limit(7);
    const reports = (recentReports ?? []) as {
      report_date: string;
      portfolio_value: number;
      spy_price: number | null;
      actions: FundAction[];
    }[];
    if (reports.length === 0) return;

    const chronological = [...reports].reverse();
    const latest = chronological[chronological.length - 1]!;
    const oldest = chronological[0]!;

    const portfolioValueStart =
      chronological.length > 1 ? oldest.portfolio_value : fundStartingCapital;
    const portfolioValueEnd = latest.portfolio_value;
    const weekReturnPct =
      portfolioValueStart > 0
        ? (portfolioValueEnd - portfolioValueStart) / portfolioValueStart
        : 0;
    const spyWeekReturnPct =
      oldest.spy_price && latest.spy_price
        ? (latest.spy_price - oldest.spy_price) / oldest.spy_price
        : null;

    const weekActions = chronological.flatMap((r) =>
      (r.actions ?? [])
        .filter((a) => a.type !== "hold")
        .map((a) => ({
          date: r.report_date,
          type: a.type,
          ticker: a.ticker,
          reasoning: a.reasoning,
        }))
    );

    const chain = buildAdvisorProviderChain({ reasoning: true });
    if (chain.length === 0) return;

    const { object: rawRecap } = await withAdvisorFallback(
      chain,
      (model, _id, signal) =>
        generateObject({
          model,
          schema: weeklyRecapSchema,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
          abortSignal: signal,
          system: buildWeeklyRecapSystemPrompt(),
          prompt: buildWeeklyRecapUserPrompt({
            weekEnding,
            portfolioValueStart,
            portfolioValueEnd,
            weekReturnPct,
            spyWeekReturnPct,
            currentHoldings: pricedHoldings,
            weekActions,
          }),
        }),
      { deadlineAt: Date.now() + 120_000 }
    );
    const recap = humanizeMargusTree(rawRecap);

    const { count: existingRecapCount } = await supabase
      .from(PORTFELL_TABLES.margusFundWeeklyRecaps)
      .select("id", { count: "exact", head: true });

    await supabase.from(PORTFELL_TABLES.margusFundWeeklyRecaps).insert({
      week_ending: weekEnding,
      headline: recap.headline,
      body: recap.body,
      week_return_pct: weekReturnPct,
      spy_week_return_pct: spyWeekReturnPct,
      portfolio_value_start: portfolioValueStart,
      portfolio_value_end: portfolioValueEnd,
    });

    await maybeTweetFundUpdate(
      composeWeeklyFundPost({
        serial: (existingRecapCount ?? 0) + 1,
        ...xCard,
      })
    );
  } catch (err) {
    await logError({
      source: "server",
      message: `Upside Portfolio weekly recap failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/margus-fund",
    });
  }
}

/**
 * Best-effort X post. Never fails the fund run.
 *
 * Returns false without touching the network unless auto-posting is
 * explicitly switched on — see `xPostingEnabled()`. The composed text is
 * saved on the report either way, so the update still exists to post by
 * hand.
 */
async function maybeTweetFundUpdate(text: string): Promise<boolean> {
  if (!xPostingEnabled()) return false;
  const result = await postTweet(text);
  if (!result.ok) {
    /*
     * A depleted quota is a billing state, not a bug. X answers 402
     * ("credits depleted") or 429 on every single call once the plan is
     * out, so logging it as an application error filled /admin with the
     * same red row after every run and buried anything that was
     * genuinely broken. The run still returns false and carries on.
     */
    if (!result.quotaExhausted) {
      await logError({
        source: "server",
        message: `Upside Fund X post failed: ${result.error}`,
        path: "/api/cron/margus-fund",
      });
    }
    return false;
  }
  return !result.skipped;
}

/** Vercel Cron (Bearer CRON_SECRET) OR a signed-in superadmin manually
 * re-triggering/backfilling from /admin. Either is accepted; neither a
 * regular user nor a co-owner can trigger this. */
async function requireCronOrSuperadmin(req: Request) {
  const cronDenied = requireCronAuth(req);
  if (!cronDenied) return null;
  const user = await getAuthUser().catch(() => null);
  if (user && isSuperadminEmail(user.email)) return null;
  return cronDenied;
}

/**
 * Has `portfell_claim_fund_run` not landed on this database yet?
 *
 * `42883` is Postgres for an undefined function; PostgREST answers a call
 * it cannot resolve from its own schema cache instead, so both spellings
 * are checked. Anything else is a real failure and is treated as one.
 */
function missingClaimFunction(err: { code?: string; message?: string }): boolean {
  if (err?.code === "42883" || err?.code === "PGRST202") return true;
  const message = String(err?.message ?? "");
  return (
    /portfell_claim_fund_run/.test(message) &&
    /(does not exist|could not find|schema cache)/i.test(message)
  );
}

async function handleGET(req: Request) {
  const denied = await requireCronOrSuperadmin(req);
  if (denied) return denied;

  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Upside Portfolio needs SUPABASE_SERVICE_ROLE_KEY -- this runs with no user session and writes a shared, global record.",
      },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const latestSession = lastCompletedUsSessionKey();

  // Catch up one missed trading day per run, oldest first, instead of only
  // ever retrying the latest session. A single bad run (a provider outage,
  // a transient quote failure) used to permanently skip that day once the
  // clock moved past it — this cron fires several times a day, so the
  // backlog drains itself within hours instead of needing a manual nudge.
  const { data: lastReportRow } = await supabase
    .from(PORTFELL_TABLES.margusFundReports)
    .select("report_date")
    .order("report_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastReportDate =
    (lastReportRow as { report_date?: string } | null)?.report_date ?? null;
  const missing = lastReportDate
    ? tradingDaysBetween(lastReportDate, latestSession)
    : [latestSession];
  const today = missing[0] ?? latestSession;

  logEvent("fund_cron_start", {
    session: today,
    backlog: missing.length,
  });

  /*
    The claim's stale window recovers a worker that died mid-run; nothing
    reported a backlog that keeps failing to drain. This cron fires several
    times a day, so one bad day is caught up within hours and a `missing`
    list of one is just "today has not run yet". Three or more trading days
    means the catch-up itself has been failing across runs -- a provider
    outage that outlasts the retries, or a bug in the run -- and that used
    to be visible only by reading the feed and noticing it had stopped.
    Through logError rather than a bare event on purpose: an event lands
    only in the platform's log stream, which is searchable and never read,
    while a row in portfell_error_log reaches /admin and the daily error
    digest, which mails the day this class of trouble starts.
  */
  if (missing.length >= 3) {
    await logError({
      source: "server",
      message: `Upside Portfolio backlog is ${missing.length} trading days deep; oldest missing day is ${missing[0]}.`,
      path: "/api/cron/margus-fund",
      event: "fund_cron_backlog_stale",
      context: {
        backlog: missing.length,
        oldestMissing: missing[0],
        latestSession,
      },
    });
  }

  try {
    // Idempotent — a manual re-trigger on a day the cron already ran just
    // reports what already happened instead of double-trading.
    const { data: existingReport } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("id")
      .eq("report_date", today)
      .maybeSingle();
    if (existingReport) {
      try {
        const { data: fundRow } = await supabase
          .from(PORTFELL_TABLES.margusFund)
          .select(MARGUS_FUND_COLUMNS)
          .eq("id", "main")
          .maybeSingle();
        const { data: holdingRows } = await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .select(MARGUS_FUND_HOLDING_COLUMNS)
          .eq("status", "open");
        const filled = fundRow
          ? await maybeFillFundIntent(
              supabase,
              fundRow,
              (holdingRows ?? []) as FundHolding[]
            )
          : false;
        return NextResponse.json({
          ok: true,
          skipped: "already ran today",
          filledIntent: filled,
        });
      } catch (err) {
        await logError({
          source: "server",
          message: `Upside Portfolio intent fill failed: ${err instanceof Error ? err.message : String(err)}`,
          stack: err instanceof Error ? err.stack : undefined,
          path: "/api/cron/margus-fund",
        });
        return NextResponse.json({
          ok: true,
          skipped: "already ran today",
          filledIntent: false,
        });
      }
    }

    /*
      The day is claimed before anything is traded.

      The report check above answers "has this day finished", which is the
      right question for a re-trigger and the wrong one for a second worker
      that is awake right now: both read no report, both trade, and both
      try to write one. The unique constraint on `report_date` then lets
      exactly one report through, so a double run looks from the outside
      like an ordinary day standing over a portfolio that bought twice.

      The window between those two reads is not an instant either, because
      the run holds an LLM call in the middle. The schedule fires several
      times a day and Vercel documents that a schedule can fire twice.

      `portfell_claim_fund_run` settles it on the primary key rather than on
      anything read first, and hands the day back after its stale window so
      a run that died half way is still retried by the backlog above.
    */
    const { data: claimedRun, error: claimErr } = await supabase.rpc(
      "portfell_claim_fund_run",
      { p_day: today }
    );

    /*
      A missing function is not a lost race, and telling them apart is the
      whole of this branch.

      Code reaches production before a migration does. If that gap is read
      as "somebody else has today" the Fund simply stops trading, and it
      stops quietly: the stand-down below answers `ok: true`, so nothing
      alerts and the only symptom is a feed that has not moved. That is a
      worse failure than the double run the claim exists to prevent, and it
      would last until somebody noticed by eye.

      So an absent function falls through to the old behaviour, which is the
      behaviour that shipped for months: trade, and rely on the report check
      above for a sequential re-trigger. `note-cron` does the same thing for
      the same reason when its marker column has not landed yet.
    */
    if (claimErr && !missingClaimFunction(claimErr)) {
      logEvent(
        "fund_cron_claim_failed",
        { session: today, message: claimErr.message },
        "warn"
      );
      return NextResponse.json({
        ok: true,
        skipped: "could not claim today",
        session: today,
      });
    }

    if (claimErr) {
      logEvent("fund_cron_claim_not_migrated", { session: today }, "warn");
    } else if (claimedRun !== true) {
      logEvent("fund_cron_claimed_elsewhere", { session: today });
      return NextResponse.json({
        ok: true,
        skipped: "another worker has today",
        session: today,
      });
    }

    const { data: fundRow, error: fundErr } = await supabase
      .from(PORTFELL_TABLES.margusFund)
      .select(MARGUS_FUND_COLUMNS)
      .eq("id", "main")
      .single();
    if (fundErr || !fundRow) throw new Error(fundErr?.message ?? "Fund row missing");

    const { data: holdingRows, error: holdingsErr } = await supabase
      .from(PORTFELL_TABLES.margusFundHoldings)
      .select(MARGUS_FUND_HOLDING_COLUMNS)
      .eq("status", "open")
      .order("entry_date", { ascending: true });
    if (holdingsErr) throw new Error(holdingsErr.message);
    const holdings = (holdingRows ?? []) as FundHolding[];

    const { data: recentReportRows, count: existingReportCount } =
      await supabase
        .from(PORTFELL_TABLES.margusFundReports)
        .select("headline, report_date, portfolio_value, spy_price", {
          count: "exact",
        })
        .order("report_date", { ascending: false })
        .limit(30);
    const reportHistory = (recentReportRows ?? []) as {
      headline: string;
      report_date: string;
      portfolio_value: number;
      spy_price: number | null;
    }[];
    const recentHeadlines = reportHistory
      .slice(0, 5)
      .map((r) => `${r.report_date}: ${stripReportSerialPrefix(r.headline)}`);
    const previousValue = reportHistory[0]?.portfolio_value ?? null;
    const previousSpy = reportHistory[0]?.spy_price ?? null;
    const { data: firstReportRow } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("spy_price")
      .order("report_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    const inceptionSpy =
      (firstReportRow as { spy_price?: number | null } | null)?.spy_price ??
      null;

    const heldTickers = holdings.map((h) => h.ticker);
    const { quotes: liveQuotes } = await fetchQuotesWithFallback([
      ...heldTickers,
      "SPY",
    ]);
    const quotes = pinQuotesToSessionClose(liveQuotes, today);
    const fearGreed = await fetchFearGreedIndex().catch(() => null);

    let cash = Number(fundRow.cash);
    const pricedHoldings: PricedHolding[] = holdings.map((h) => {
      const q = quotes[h.ticker];
      const price = q?.price ?? h.cost_basis;
      const marketValue = price * h.shares;
      const costValue = h.cost_basis * h.shares;
      return {
        ...h,
        price,
        marketValue,
        unrealizedPnl: marketValue - costValue,
        unrealizedPnlPct: costValue > 0 ? (marketValue - costValue) / costValue : 0,
        daysHeld: daysBetween(h.entry_date, today),
      };
    });
    const totalValueBefore =
      cash + pricedHoldings.reduce((s, h) => s + h.marketValue, 0);

    const spyQuote = quotes.SPY;
    const spyMovePct = spyQuote ? spyQuote.changePercent : null;
    const spyChangePct =
      spyQuote?.price && previousSpy && previousSpy > 0
        ? (spyQuote.price - previousSpy) / previousSpy
        : null;

    const chain = buildAdvisorProviderChain({ reasoning: true });
    if (chain.length === 0) {
      throw new Error("No LLM provider configured for Upside Portfolio");
    }

    const { object: rawDecision } = await withAdvisorFallback(
      chain,
      (model, _id, signal) =>
        generateObject({
          model,
          schema: fundDecisionSchema,
          providerOptions: STRUCTURED_PROVIDER_OPTIONS,
          abortSignal: signal,
          system: buildFundSystemPrompt(),
          prompt: buildFundUserPrompt({
            today,
            cash,
            holdings: pricedHoldings,
            totalValue: totalValueBefore,
            spyMovePct,
            fearGreed,
            recentHeadlines,
            currentWatchlist: sanitizeFundWatchlist(
              Array.isArray(fundRow.watchlist) ? fundRow.watchlist : [],
              holdings.map((h) => h.ticker)
            ),
            currentCashPurpose:
              typeof fundRow.cash_purpose === "string"
                ? fundRow.cash_purpose
                : null,
          }),
        }),
      { deadlineAt: Date.now() + 240_000 }
    );
    const decision = humanizeMargusTree(rawDecision);

    const actions: FundAction[] = [];
    // Running share count per still-open holding, updated as each decision
    // is applied — pricedHoldings itself stays a frozen "start of day"
    // snapshot, so the final portfolio value has to come from this map,
    // not from re-summing the (now stale) pricedHoldings.marketValue.
    const currentShares = new Map<string, number>(
      pricedHoldings.map((h) => [h.id, h.shares])
    );

    for (const dec of decision.holdingDecisions) {
      const holding = pricedHoldings.find(
        (h) => h.ticker.toUpperCase() === dec.ticker.toUpperCase()
      );
      if (!holding) continue; // hallucinated ticker not in book -- skip defensively

      if (dec.action === "hold") {
        actions.push({ type: "hold", ticker: holding.ticker, reasoning: dec.reasoning });
        continue;
      }

      if (dec.action === "exit") {
        const proceeds = holding.shares * holding.price;
        cash += proceeds;
        const realizedPnl = proceeds - holding.shares * holding.cost_basis;
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({
            status: "closed",
            closed_at: today,
            exit_reasoning: dec.reasoning,
            realized_pnl: realizedPnl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", holding.id);
        currentShares.delete(holding.id);
        actions.push({
          type: "exit",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: holding.shares,
          price: holding.price,
          dollarAmount: proceeds,
        });
        continue;
      }

      const fraction = Math.min(1, Math.max(0, dec.fraction ?? 0));
      if (fraction <= 0) {
        actions.push({ type: "hold", ticker: holding.ticker, reasoning: dec.reasoning });
        continue;
      }

      if (dec.action === "trim") {
        const sellShares = Math.min(holding.shares, holding.shares * fraction);
        const proceeds = sellShares * holding.price;
        const newShares = holding.shares - sellShares;
        cash += proceeds;
        currentShares.set(holding.id, newShares);
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({ shares: newShares, updated_at: new Date().toISOString() })
          .eq("id", holding.id);
        actions.push({
          type: "trim",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: sellShares,
          price: holding.price,
          dollarAmount: proceeds,
        });
      } else if (dec.action === "add") {
        const desiredDollars = holding.marketValue * fraction;
        const affordable = Math.min(desiredDollars, Math.max(0, cash - 100));
        if (affordable < 50) {
          actions.push({
            type: "hold",
            ticker: holding.ticker,
            reasoning: `${dec.reasoning} (wanted to add, but not enough free cash today)`,
          });
          continue;
        }
        const buyShares = affordable / holding.price;
        const newShares = holding.shares + buyShares;
        const newCostBasis =
          (holding.cost_basis * holding.shares + affordable) / newShares;
        cash -= affordable;
        currentShares.set(holding.id, newShares);
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({
            shares: newShares,
            cost_basis: newCostBasis,
            updated_at: new Date().toISOString(),
          })
          .eq("id", holding.id);
        actions.push({
          type: "add",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: buyShares,
          price: holding.price,
          dollarAmount: affordable,
        });
      }
    }

    let newPositionsValue = 0;
    for (const idea of decision.newPositions) {
      const ticker = idea.ticker.trim().toUpperCase();
      if (!ticker) continue;
      // Not already priced above (it's a new name) -- fetch it specifically.
      const { quotes: ideaQuotes, missing: ideaMissing } =
        await fetchQuotesWithFallback([ticker]);
      const q = pinQuotesToSessionClose(ideaQuotes, today)[ticker];
      if (!q || ideaMissing.includes(ticker)) {
        actions.push({
          type: "hold",
          ticker,
          reasoning: `Wanted to open ${ticker} (${idea.thesis}) but couldn't get a reliable live price today -- skipping rather than trade on a bad quote.`,
        });
        continue;
      }
      const affordable = Math.min(idea.allocationDollars, Math.max(0, cash - 100));
      if (affordable < 100) {
        actions.push({
          type: "hold",
          ticker,
          reasoning: `Wanted to open ${ticker} but not enough free cash today after other actions.`,
        });
        continue;
      }
      const shares = affordable / q.price;
      const { error: insertErr } = await supabase
        .from(PORTFELL_TABLES.margusFundHoldings)
        .insert({
          ticker,
          shares,
          cost_basis: q.price,
          entry_date: today,
          thesis: idea.thesis,
          target_timeframe: idea.targetTimeframe,
          exit_plan: idea.exitPlan,
          status: "open",
        });
      if (insertErr) {
        await logError({
          source: "server",
          message: `Upside Portfolio: failed to insert new holding ${ticker}: ${insertErr.message}`,
          path: "/api/cron/margus-fund",
        });
        continue;
      }
      cash -= affordable;
      newPositionsValue += affordable;
      actions.push({
        type: "buy",
        ticker,
        reasoning: idea.thesis,
        shares,
        price: q.price,
        dollarAmount: affordable,
      });
    }

    const finalHoldingsValue = pricedHoldings.reduce((sum, h) => {
      const shares = currentShares.get(h.id);
      if (shares === undefined) return sum; // exited today
      return sum + shares * h.price;
    }, 0);
    const totalValueAfter = cash + finalHoldingsValue + newPositionsValue;

    const stillHeld = [
      ...pricedHoldings
        .filter((h) => currentShares.has(h.id))
        .map((h) => h.ticker),
      ...actions.filter((a) => a.type === "buy").map((a) => a.ticker),
    ];
    const watchlist = sanitizeFundWatchlist(
      decision.watchlist,
      stillHeld
    ).map((w) => ({
      ticker: w.ticker,
      waitFor: humanizeMargusText(w.waitFor),
    }));
    const cashPurpose = humanizeMargusText(decision.cashPurpose ?? "").trim();

    await supabase
      .from(PORTFELL_TABLES.margusFund)
      .update({
        cash,
        watchlist,
        cash_purpose: cashPurpose || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "main");

    const dayChangeDollar =
      previousValue != null ? totalValueAfter - previousValue : null;
    const dayChangePct =
      previousValue && previousValue > 0
        ? (totalValueAfter - previousValue) / previousValue
        : null;
    const totalReturnPct =
      (totalValueAfter - Number(fundRow.starting_capital)) /
      Number(fundRow.starting_capital);

    const tradedLines = actions
      .filter((a) => a.type !== "hold")
      .map((a) => {
        const verb =
          a.type === "buy"
            ? "Opened"
            : a.type === "exit"
              ? "Exited"
              : a.type === "trim"
                ? "Trimmed"
                : "Added to";
        return `**${verb} ${a.ticker}**: ${a.reasoning}`;
      });
    const holdLines = actions
      .filter((a) => a.type === "hold")
      .map((a) => `*${a.ticker}: ${a.reasoning}*`);

    const bodyLines = [
      decision.marketNote,
      "",
      ...(tradedLines.length > 0 ? tradedLines : ["No trades today."]),
      ...(holdLines.length > 0 ? ["", ...holdLines] : []),
      "",
      decision.closingNote,
    ];

    const startCap = Number(fundRow.starting_capital);
    const monday = usWeekMondayKey(today);
    const weekAnchor = reportHistory.find((r) => r.report_date < monday);
    const weekStartValue = weekAnchor?.portfolio_value ?? startCap;
    const weekStartSpy = weekAnchor?.spy_price ?? null;
    const weekChangeDollar = totalValueAfter - weekStartValue;
    const weekReturnPct =
      weekStartValue > 0 ? weekChangeDollar / weekStartValue : null;
    const spyWeekChangePct =
      spyQuote?.price && weekStartSpy && weekStartSpy > 0
        ? (spyQuote.price - weekStartSpy) / weekStartSpy
        : null;
    const totalChangeDollar = totalValueAfter - startCap;
    const spyTotalChangePct =
      spyQuote?.price && inceptionSpy && inceptionSpy > 0
        ? (spyQuote.price - inceptionSpy) / inceptionSpy
        : null;
    const movers = pricedHoldings.map((h) => ({
      ticker: h.ticker,
      changePct: liveQuotes[h.ticker]?.changePercent ?? null,
    }));
    const xCard = {
      daily: {
        dollar: dayChangeDollar,
        pct: dayChangePct,
        spyPct: spyChangePct,
      },
      weekly: {
        dollar: weekChangeDollar,
        pct: weekReturnPct,
        spyPct: spyWeekChangePct,
      },
      total: {
        dollar: totalChangeDollar,
        pct: totalReturnPct,
        spyPct: spyTotalChangePct,
      },
      balance: totalValueAfter,
      actions,
      movers,
      radar: watchlist,
    };

    /*
     * Compose the post before writing the report, and store it on the row.
     *
     * The text used to be composed only to hand straight to the X client
     * and was thrown away if the send didn't happen. That made "post the
     * fund update by hand" impossible — the update existed only inside a
     * request that had already ended. Now every trading day's post is
     * saved whether or not it is ever sent, so it can be copied out of
     * /admin, and so turning auto-posting on later changes nothing about
     * what gets written.
     */
    const xPost = composeDailyFundPost({
      serial: (existingReportCount ?? 0) + 1,
      ...xCard,
    });

    const { data: report, error: reportErr } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .insert({
        report_date: today,
        headline: decision.headline,
        body: humanizeMargusText(bodyLines.join("\n")),
        actions: humanizeMargusTree(actions),
        portfolio_value: totalValueAfter,
        cash,
        day_change_dollar: dayChangeDollar,
        day_change_pct: dayChangePct,
        total_return_pct: totalReturnPct,
        spy_price: spyQuote?.price ?? null,
        x_post: xPost,
      })
      .select()
      .single();
    if (reportErr) throw new Error(reportErr.message);

    const tweeted = await maybeTweetFundUpdate(xPost);

    // Fire-and-forget-ish: still awaited so logs/errors are captured in
    // this invocation, but wrapped so a recap issue never fails the
    // (already-committed) daily decision above. Uses the start-of-run
    // holdings snapshot (share counts from today's trims/adds aren't
    // reflected) since this is narrative color for the reflection, not
    // the ledger -- but exits ARE filtered out so a position closed
    // today doesn't show up as "still held" in the same recap.
    await maybeGenerateWeeklyRecap(
      supabase,
      today,
      Number(fundRow.starting_capital),
      pricedHoldings.filter((h) => currentShares.has(h.id)),
      xCard
    );

    return NextResponse.json({
      ok: true,
      reportDate: today,
      reportId: report.id,
      totalValue: totalValueAfter,
      cash,
      actions: actions.length,
      headline: decision.headline,
      tweeted,
      stillBehind: missing.length - 1,
    });
  } catch (err) {
    await logError({
      source: "server",
      message: `Upside Portfolio cron failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/margus-fund",
    });
    return NextResponse.json(
      { error: dbError(err, "GET /api/cron/margus-fund: run") },
      { status: 500 }
    );
  }
}

export const GET = cronRoute(handleGET, '/api/cron/margus-fund');
