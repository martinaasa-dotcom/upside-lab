import {
  captureBookPayload,
  computeSnapshotMarks,
  pruneOldSnapshots,
  saveBookSnapshot,
} from "@/lib/book-snapshot";
import { requireCronAuth } from "@/lib/cron-auth";
import { logError } from "@/lib/error-log";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { todayKeyInTz } from "@/lib/timezone";
import { dbError } from "@/lib/db-error";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel Cron — nightly full-book snapshot. */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  // Cron has no user session at all, so this can only ever see/write across
  // every user's portfolios via service role. Without it, RLS would silently
  // limit the capture to nothing (anon has no auth.uid()), producing an
  // empty-but-"successful"-looking nightly snapshot — worse than skipping.
  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Nightly snapshot skipped. SUPABASE_SERVICE_ROLE_KEY is not configured, so a cron request (no user session) cannot read any portfolios under RLS.",
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
    const day = todayKeyInTz();
    const payload = await captureBookPayload(supabase);
    const tickers = [
      ...new Set(
        (payload.holdings as Array<{ ticker?: string }>).map((h) =>
          String(h.ticker ?? "").toUpperCase()
        )
      ),
    ].filter(Boolean);
    if (tickers.length > 0) {
      try {
        const { quotes } = await fetchQuotesWithFallback(tickers);
        payload.marks = computeSnapshotMarks(
          payload.portfolios,
          payload.holdings,
          quotes
        );
      } catch (err) {
        /*
          The snapshot still saves, so this is a warning rather than a
          failed night: what is lost is the marks, which is what makes a
          restored book worth anything to read. It gets a row for the same
          reason a warning-laden disaster-recovery run does -- a known
          class stays quiet after the first mail, so this is one mail per
          regression, not one per night.
        */
        await logError({
          source: "server",
          message: `Nightly snapshot saved without marks: ${
            err instanceof Error ? err.message : String(err)
          }`,
          path: "/api/cron/snapshot",
          event: "snapshot_marks_skipped",
        });
      }
    }
    const snap = await saveBookSnapshot(
      supabase,
      "nightly",
      `Nightly ${day}`,
      payload
    );
    await pruneOldSnapshots(supabase);
    return NextResponse.json({
      ok: true,
      snapshotId: snap.id,
      portfolios: payload.portfolios.length,
      holdings: payload.holdings.length,
    });
  } catch (err) {
    /*
      This catch answers 500, so nothing is thrown and `onRequestError`
      never runs: without this row a failed night is a console line in a
      log stream nobody reads. That is not hypothetical -- the check went
      down on 3 September 2026 and the daily digest named only
      disaster-recovery, because the nightly snapshot had no way to say so.
    */
    await logError({
      source: "server",
      message: `Nightly snapshot failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/snapshot",
      event: "snapshot_failed",
    });
    return NextResponse.json(
      { error: dbError(err, "GET /api/cron/snapshot: nightly snapshot") },
      { status: 500 }
    );
  }
}

export const GET = cronRoute(handleGET, '/api/cron/snapshot');
