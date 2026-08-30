import { dbError } from "@/lib/db-error";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import {
  MARGUS_FUND_COLUMNS,
  MARGUS_FUND_HOLDING_COLUMNS,
  MARGUS_FUND_RECAP_COLUMNS,
  MARGUS_FUND_REPORT_COLUMNS,
  PORTFELL_TABLES,
} from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/** Read-only for any signed-in user — the whole point is a watchable feed. */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const [
    { data: fund, error: fundErr },
    { data: holdings, error: holdingsErr },
    { data: reports, error: reportsErr },
    { data: weeklyRecaps, error: weeklyErr },
  ] = await Promise.all([
    supabase
      .from(PORTFELL_TABLES.margusFund)
      .select(MARGUS_FUND_COLUMNS)
      .eq("id", "main")
      .maybeSingle(),
    supabase
      .from(PORTFELL_TABLES.margusFundHoldings)
      .select(MARGUS_FUND_HOLDING_COLUMNS)
      .order("entry_date", { ascending: false }),
    supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select(MARGUS_FUND_REPORT_COLUMNS)
      .order("report_date", { ascending: false })
      .limit(60),
    supabase
      .from(PORTFELL_TABLES.margusFundWeeklyRecaps)
      .select(MARGUS_FUND_RECAP_COLUMNS)
      .order("week_ending", { ascending: false })
      .limit(20),
  ]);

  if (fundErr) return NextResponse.json({ error: dbError(fundErr, "/api/upside-portfolio") }, { status: 500 });
  if (holdingsErr) return NextResponse.json({ error: dbError(holdingsErr, "/api/upside-portfolio") }, { status: 500 });
  if (reportsErr) return NextResponse.json({ error: dbError(reportsErr, "/api/upside-portfolio") }, { status: 500 });
  if (weeklyErr) return NextResponse.json({ error: dbError(weeklyErr, "/api/upside-portfolio") }, { status: 500 });

  const openHoldings = (holdings ?? []).filter(
    (h: { status: string }) => h.status === "open"
  );
  const tickers = openHoldings.map((h: { ticker: string }) => h.ticker);
  // SPY always included — it's the always-on benchmark line, fetched here
  // so the client gets its live price for free in this same response.
  const { quotes } = await fetchQuotesWithFallback([...tickers, "SPY"]);

  return NextResponse.json({
    fund: fund ?? null,
    holdings: holdings ?? [],
    reports: reports ?? [],
    weeklyRecaps: weeklyRecaps ?? [],
    quotes,
  });
}

export const GET = observeRoute(handleGET, '/api/upside-portfolio');
