import { requireCronAuth } from "@/lib/cron-auth";
import { refreshPopularTickers } from "@/lib/popular-tickers-store";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron — first of the month. Refresh the onboarding watchlist picks. */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Monthly popular names skipped. SUPABASE_SERVICE_ROLE_KEY is not configured.",
      },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 400 }
    );
  }

  try {
    const payload = await refreshPopularTickers(supabase);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    console.error("[cron/popular-tickers]", err);
    return NextResponse.json(
      { error: dbError(err, "GET /api/cron/popular-tickers: refresh") },
      { status: 500 }
    );
  }
}

export const GET = cronRoute(handleGET, '/api/cron/popular-tickers');
