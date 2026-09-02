import { dbError } from "@/lib/db-error";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import type { AppSupabaseClient } from "@/lib/supabase/client-types";
import {
  getSupabaseDataClient,
  getSupabaseServer,
  supabaseUsesServiceRole,
} from "@/lib/supabase/server";
import {
  MARGUS_FUND_COLUMNS,
  MARGUS_FUND_HOLDING_COLUMNS,
  MARGUS_FUND_RECAP_COLUMNS,
  MARGUS_FUND_REPORT_COLUMNS,
  PORTFELL_TABLES,
} from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/** This app's own sentence, so it keeps its 400 rather than reading as a fault. */
const NOT_CONFIGURED = "Supabase not configured";

/**
 * The whole payload, built once for everybody.
 *
 * Nothing in here is keyed to the person asking: the select policy on all
 * four fund tables is `auth.uid() is not null`, so every signed-in viewer
 * matches the same rows. Errors throw rather than return, because a failed
 * read must not be what the next fifteen seconds of viewers are handed.
 */
async function loadFundPayload(supabase: AppSupabaseClient) {
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

  if (fundErr) throw new Error(fundErr.message);
  if (holdingsErr) throw new Error(holdingsErr.message);
  if (reportsErr) throw new Error(reportsErr.message);
  if (weeklyErr) throw new Error(weeklyErr.message);

  const openHoldings = (holdings ?? []).filter(
    (h: { status: string }) => h.status === "open"
  );
  const tickers = openHoldings.map((h: { ticker: string }) => h.ticker);
  // SPY always included -- it's the always-on benchmark line, fetched here
  // so the client gets its live price for free in this same response.
  const { quotes } = await fetchQuotesWithFallback([...tickers, "SPY"]);

  return {
    fund: fund ?? null,
    holdings: holdings ?? [],
    reports: reports ?? [],
    weeklyRecaps: weeklyRecaps ?? [],
    quotes,
  };
}

/**
 * Same fund for every signed-in viewer. Auth still runs per request; this
 * only skips repeating four Supabase reads and the quote walk for fifteen
 * seconds, the same window the teaser card beside it already uses.
 */
const getCachedFundPayload = unstable_cache(
  async () => {
    const supabase = getSupabaseServer();
    if (!supabase) throw new Error(NOT_CONFIGURED);
    return loadFundPayload(supabase);
  },
  ["upside-fund-payload-v1"],
  { revalidate: 15 }
);

/**
 * Only the shared client can be cached. Without a service role key the data
 * client is the viewer's own cookie session, and reading cookies inside
 * `unstable_cache` is not allowed, so that setup keeps the read it had.
 */
async function loadFundPayloadForViewer() {
  if (supabaseUsesServiceRole()) return getCachedFundPayload();
  const supabase = await getSupabaseDataClient();
  if (!supabase) throw new Error(NOT_CONFIGURED);
  return loadFundPayload(supabase);
}

/** Read-only for any signed-in user -- the whole point is a watchable feed. */
async function handleGET() {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  try {
    const payload = await loadFundPayloadForViewer();
    /*
      Private, never `publicCdnHeaders`. The body is the same for everybody,
      but the route is behind a sign-in check, and a shared CDN copy would
      answer a request that never passed it. This is the viewer's own browser
      holding what it just read for as long as the server would have.
    */
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=30",
      },
    });
  } catch (err) {
    const failure = err instanceof Error ? err : null;
    if (failure?.message === NOT_CONFIGURED) {
      return NextResponse.json({ error: NOT_CONFIGURED }, { status: 400 });
    }
    return NextResponse.json(
      { error: dbError(failure, "GET /api/upside-portfolio: load fund") },
      { status: 500 }
    );
  }
}

export const GET = observeRoute(handleGET, '/api/upside-portfolio');
