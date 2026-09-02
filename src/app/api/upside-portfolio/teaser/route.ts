import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MARGUS_FUND_COLUMNS, PORTFELL_TABLES } from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import {
  fundDayNumber,
  liveFundTodayMove,
  liveFundTotalValue,
} from "@/lib/margus-fund-mark";
import { stripReportSerialPrefix } from "@/lib/fund-copy";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FundTeaser = {
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  headline: string | null;
  dayNumber: number;
  openCount: number;
  startingCapital: number;
};

/**
 * Same live mark for every signed-in viewer. Auth still runs per request;
 * this only skips repeating Supabase + Yahoo for 15 seconds.
 */
const getCachedFundTeaser = unstable_cache(
  async (): Promise<FundTeaser> => {
    const supabase = getSupabaseServer();
    if (!supabase) {
      throw new Error("Supabase not configured");
    }

    const [
      { data: fund, error: fundErr },
      { data: holdings, error: holdingsErr },
      { data: latestReport, error: reportErr },
    ] = await Promise.all([
      supabase
        .from(PORTFELL_TABLES.margusFund)
        .select(MARGUS_FUND_COLUMNS)
        .eq("id", "main")
        .maybeSingle(),
      supabase
        .from(PORTFELL_TABLES.margusFundHoldings)
        .select("ticker, shares, cost_basis, status")
        .eq("status", "open"),
      supabase
        .from(PORTFELL_TABLES.margusFundReports)
        .select("headline, portfolio_value, cash, report_date")
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (fundErr) throw new Error(fundErr.message);
    if (holdingsErr) throw new Error(holdingsErr.message);
    if (reportErr) throw new Error(reportErr.message);

    const openHoldings = (holdings ?? []) as {
      ticker: string;
      shares: number;
      cost_basis: number;
      status: string;
    }[];
    const tickers = openHoldings.map((h) => h.ticker);
    const { quotes } = await fetchQuotesWithFallback(tickers);

    const cash =
      (latestReport as { cash?: number } | null)?.cash ??
      (fund as { cash?: number } | null)?.cash ??
      0;
    const totalValue = liveFundTotalValue({
      cash,
      holdings: openHoldings,
      quotes,
    });
    const lastValue = (latestReport as { portfolio_value?: number } | null)
      ?.portfolio_value;
    const { todayDollar, todayPct } = liveFundTodayMove({
      liveTotal: totalValue,
      lastReportValue: lastValue,
    });

    return {
      totalValue,
      todayDollar,
      todayPct,
      headline:
        stripReportSerialPrefix(
          ((latestReport as { headline?: string } | null)?.headline ?? "").trim()
        ) || null,
      dayNumber: fundDayNumber(
        (fund as { inception_date?: string } | null)?.inception_date
      ),
      openCount: openHoldings.length,
      startingCapital:
        (fund as { starting_capital?: number } | null)?.starting_capital ?? 0,
    };
  },
  ["upside-fund-teaser-v1"],
  { revalidate: 15 }
);

/**
 * Small card for Overview. Same live mark as the Fund page, without
 * dragging sixty reports across the wire.
 */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  if (!getSupabaseServer()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  try {
    const teaser = await getCachedFundTeaser();
    return NextResponse.json(teaser, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    /*
      "Supabase not configured" is this app's own sentence and keeps its
      400. Everything else that reaches here was thrown with the driver's
      message on it, and that stays on the server.
    */
    if (err instanceof Error && err.message === "Supabase not configured") {
      return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
    }
    return NextResponse.json(
      { error: dbError(err, "GET /api/upside-portfolio/teaser: load teaser") },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, "/api/upside-portfolio/teaser");
