import { requireCronAuth } from "@/lib/cron-auth";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { getAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import {
  MARGUS_FUND_COLUMNS,
  MARGUS_FUND_HOLDING_COLUMNS,
  PORTFELL_TABLES,
} from "@/lib/supabase/tables";
import {
  lastCompletedUsSessionKey,
  tradingDaysBetween,
  usWeekMondayKey,
} from "@/lib/market/session";
import { logEvent } from "@/lib/telemetry";
import {
  STRUCTURED_PROVIDER_OPTIONS,
  buildAdvisorProviderChain,
  withAdvisorFallback,
} from "@/lib/ai/model";
import { humanizeMargusText, humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildFundNarrativeSystemPrompt,
  buildFundNarrativeUserPrompt,
  buildWeeklyRecapSystemPrompt,
  buildWeeklyRecapUserPrompt,
  fallbackNarrative,
  fundNarrativeSchema,
  weeklyRecapSchema,
  type FundAction,
  type FundHolding,
  type PricedHolding,
} from "@/lib/margus-fund";
import {
  FUND_BENCHMARK,
  FUND_RULES,
  FUND_UNIVERSE,
  marketIsUp,
  planTrades,
} from "@/lib/fund-strategy";
import {
  closesThrough,
  exitPlanFor,
  holdLine,
  positionsFromHoldings,
  readsFor,
  watchlistFrom,
} from "@/lib/fund-run";
import { fetchDailyCloseHistory } from "@/lib/market/daily-history";
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
      return NextResponse.json({ ok: true, skipped: "already ran today" });
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

    /*
      The trades are the rules', not the model's.

      This used to hand the model today's prices and a prompt telling it
      most days should have no trades, and let it decide. It made almost
      none. Now the rules in `fund-strategy.ts` read about a year and a half
      of each company's closes and decide, the same arithmetic every day,
      and the model is only asked to write about what they did.
    */
    const universe = [
      ...new Set([
        FUND_BENCHMARK,
        ...FUND_UNIVERSE,
        ...holdings.map((h) => h.ticker.toUpperCase()),
      ]),
    ];
    const history = await fetchDailyCloseHistory(universe);
    const benchSeries = history[FUND_BENCHMARK];
    if (!benchSeries || Object.keys(history).length < universe.length / 2) {
      // Too little of the market answered to trade on. Throwing hands the
      // day back to the backlog, so a later run retries it.
      throw new Error(
        `Upside Fund: price history answered for ${Object.keys(history).length} of ${universe.length} names`
      );
    }
    const { reads, bench } = readsFor(history, today);
    const benchThrough = closesThrough(benchSeries, today).closes;
    const benchPrice = benchThrough.at(-1) ?? null;
    const benchPrev = benchThrough.at(-2) ?? null;
    const spyMovePct =
      benchPrice != null && benchPrev ? benchPrice / benchPrev - 1 : null;
    // The benchmark, which is QQQ since the Fund started again. The report
    // column is still called `spy_price`; see the reset migration.
    const spyQuote = benchPrice != null ? { price: benchPrice } : null;
    const spyChangePct =
      benchPrice != null && previousSpy && previousSpy > 0
        ? (benchPrice - previousSpy) / previousSpy
        : null;

    const { data: tradeRows } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("report_date, actions")
      .order("report_date", { ascending: false })
      .limit(300);
    const pastTrades = (tradeRows ?? []) as {
      report_date: string;
      actions: FundAction[];
    }[];
    const trimmedSince = (ticker: string, entryDate: string) =>
      pastTrades.some(
        (r) =>
          r.report_date >= entryDate &&
          (r.actions ?? []).some(
            (a) => a.ticker === ticker && a.rule === "take-half"
          )
      );

    let cash = Number(fundRow.cash);
    const { positions, parkedShares } = positionsFromHoldings({
      holdings,
      history,
      day: today,
      trimmedSince,
    });
    const priceOf = (ticker: string, fallback: number) =>
      ticker === FUND_BENCHMARK
        ? (benchPrice ?? fallback)
        : (reads[ticker]?.price ?? fallback);

    const orders = planTrades({
      cash,
      parkedShares,
      positions,
      reads,
      bench,
    });

    // Apply every order to the stored book, in the order the rules gave.
    const rowFor = new Map(
      holdings.map((h) => [h.ticker.toUpperCase(), { ...h, shares: Number(h.shares) }])
    );
    const cost = FUND_RULES.costPerTrade;
    const actions: FundAction[] = [];
    const now = () => new Date().toISOString();
    for (const o of orders) {
      const row = rowFor.get(o.ticker);
      if (o.side === "sell") {
        if (!row) continue;
        const sell = Math.min(o.shares, row.shares);
        const proceeds = sell * o.price * (1 - cost);
        cash += proceeds;
        const left = row.shares - sell;
        if (left <= 1e-6) {
          await supabase
            .from(PORTFELL_TABLES.margusFundHoldings)
            .update({
              status: "closed",
              closed_at: today,
              exit_reasoning: o.why,
              realized_pnl: proceeds - sell * Number(row.cost_basis),
              updated_at: now(),
            })
            .eq("id", row.id);
          rowFor.delete(o.ticker);
        } else {
          await supabase
            .from(PORTFELL_TABLES.margusFundHoldings)
            .update({ shares: left, updated_at: now() })
            .eq("id", row.id);
          rowFor.set(o.ticker, { ...row, shares: left });
        }
        actions.push({
          type: left <= 1e-6 ? "exit" : "trim",
          ticker: o.ticker,
          reasoning: o.why,
          rule: o.rule,
          shares: sell,
          price: o.price,
          dollarAmount: proceeds,
        });
        continue;
      }
      const spend = Math.min(o.shares * o.price / (1 - cost), cash);
      if (spend <= 1) continue;
      const shares = (spend * (1 - cost)) / o.price;
      cash -= spend;
      if (row) {
        const total = row.shares + shares;
        const basis = (Number(row.cost_basis) * row.shares + shares * o.price) / total;
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({ shares: total, cost_basis: basis, updated_at: now() })
          .eq("id", row.id);
        rowFor.set(o.ticker, { ...row, shares: total, cost_basis: basis });
      } else {
        const read = reads[o.ticker];
        const parkedRow = o.ticker === FUND_BENCHMARK;
        const { data: inserted, error: insertErr } = await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .insert({
            ticker: o.ticker,
            shares,
            cost_basis: o.price,
            entry_date: today,
            thesis: o.why,
            target_timeframe: parkedRow ? null : "1 to 12 months",
            exit_plan: parkedRow || !read ? null : exitPlanFor(read),
            status: "open",
          })
          .select(MARGUS_FUND_HOLDING_COLUMNS)
          .single();
        if (insertErr || !inserted) {
          await logError({
            source: "server",
            message: `Upside Fund: failed to open ${o.ticker}: ${insertErr?.message ?? "no row"}`,
            path: "/api/cron/margus-fund",
          });
          cash += spend;
          continue;
        }
        const ins = inserted as unknown as FundHolding;
        rowFor.set(o.ticker, { ...ins, shares: Number(ins.shares) });
      }
      actions.push({
        type: row ? "add" : "buy",
        ticker: o.ticker,
        reasoning: o.why,
        rule: o.rule,
        shares,
        price: o.price,
        dollarAmount: spend,
      });
    }

    // Everything the rules left alone gets one checkable line.
    const traded = new Set(orders.map((o) => o.ticker));
    for (const pos of positions) {
      if (traded.has(pos.ticker) || !rowFor.has(pos.ticker)) continue;
      const read = reads[pos.ticker];
      actions.push({
        type: "hold",
        ticker: pos.ticker,
        reasoning: read ? holdLine(pos, read) : "No price today, so nothing was traded.",
      });
    }

    const openRows = [...rowFor.values()];
    const totalValueAfter =
      cash +
      openRows.reduce(
        (s, r) => s + r.shares * priceOf(r.ticker.toUpperCase(), Number(r.cost_basis)),
        0
      );
    const pricedHoldings: PricedHolding[] = openRows
      .filter((r) => r.ticker.toUpperCase() !== FUND_BENCHMARK)
      .map((r) => {
        const price = priceOf(r.ticker.toUpperCase(), Number(r.cost_basis));
        const marketValue = price * r.shares;
        const costValue = Number(r.cost_basis) * r.shares;
        return {
          ...r,
          price,
          marketValue,
          unrealizedPnl: marketValue - costValue,
          unrealizedPnlPct: costValue > 0 ? marketValue / costValue - 1 : 0,
          daysHeld: daysBetween(r.entry_date, today),
        };
      });

    const companyTrades = actions
      .filter((a) => a.type !== "hold" && a.ticker !== FUND_BENCHMARK)
      .map((a) => ({
        side: a.type === "buy" || a.type === "add" ? "buy" : "sell",
        ticker: a.ticker,
        why: a.reasoning,
      }));
    const narrativeInput = {
      today,
      benchMovePct: spyMovePct,
      riskOn: marketIsUp(bench),
      trades: companyTrades,
      holdingCount: pricedHoldings.length,
    };
    let decision = fallbackNarrative(narrativeInput);
    const chain = buildAdvisorProviderChain({ reasoning: true });
    if (chain.length > 0) {
      try {
        const { object } = await withAdvisorFallback(
          chain,
          (model, _id, signal) =>
            generateObject({
              model,
              schema: fundNarrativeSchema,
              providerOptions: STRUCTURED_PROVIDER_OPTIONS,
              abortSignal: signal,
              system: buildFundNarrativeSystemPrompt(),
              prompt: buildFundNarrativeUserPrompt(narrativeInput),
            }),
          { deadlineAt: Date.now() + 90_000 }
        );
        decision = humanizeMargusTree(object);
      } catch {
        // The trades stand; only the words fall back.
      }
    }

    const stillHeld = new Set(openRows.map((r) => r.ticker.toUpperCase()));
    const watchlist = watchlistFrom(reads, stillHeld);
    const cashPurpose = marketIsUp(bench)
      ? "Money waiting for the next setup sits in the Nasdaq 100 rather than in cash."
      : "The Nasdaq 100 is under its 200-day average, so money not in companies waits in cash.";

    await supabase
      .from(PORTFELL_TABLES.margusFund)
      .update({
        cash,
        watchlist,
        cash_purpose: cashPurpose,
        updated_at: now(),
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
    const movers = pricedHoldings.map((h) => {
      const c = history[h.ticker.toUpperCase()]
        ? closesThrough(history[h.ticker.toUpperCase()]!, today).closes
        : [];
      return {
        ticker: h.ticker,
        changePct: c.length >= 2 ? c.at(-1)! / c.at(-2)! - 1 : null,
      };
    });
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
      pricedHoldings,
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
