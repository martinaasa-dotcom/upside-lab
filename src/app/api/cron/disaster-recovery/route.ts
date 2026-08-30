import { runDisasterRecoveryJob } from "@/lib/dr/export-book";
import { requireCronAuth } from "@/lib/cron-auth";
import { cronRoute } from "@/lib/cron-heartbeat";
import { logError } from "@/lib/error-log";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * Daily WAL backup check + encrypted book export to S3/R2.
 * Independent of /api/cron/snapshot so a cold-storage miss does not skip
 * the in-database nightly save.
 */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Disaster recovery skipped. SUPABASE_SERVICE_ROLE_KEY is not configured, so a cron request cannot read books under RLS.",
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
    const result = await runDisasterRecoveryJob({ supabase });
    if (!result.ok) {
      await logError({
        source: "server",
        message: `Disaster recovery failed: ${result.warnings.join(" | ")}`,
        path: "/api/cron/disaster-recovery",
        event: "disaster_recovery_failed",
      });
      return NextResponse.json(result, { status: 503 });
    }
    /*
      A warning-laden ok run is the quiet failure this route can hide: the
      job counts "cold copy skipped, key not configured" as ok, so a
      production env regression that loses SNAPSHOT_ENCRYPTION_KEY or the
      DR_S3 keys turns every nightly run green while backups quietly stop
      existing. The heartbeat deliberately answers only "did the run
      complete", so the warning goes to portfell_error_log instead: /admin
      shows it, and the daily error digest mails the day it starts (and
      then stays quiet while the state persists, since a known class does
      not re-alert -- one mail per regression, not one per night).
    */
    if (result.warnings.length) {
      await logError({
        source: "server",
        message: `Disaster recovery ran with warnings: ${result.warnings.join(" | ")}`,
        path: "/api/cron/disaster-recovery",
        event: "disaster_recovery_warning",
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    await logError({
      source: "server",
      message: `Disaster recovery failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/disaster-recovery",
      event: "disaster_recovery_failed",
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Disaster recovery failed",
      },
      { status: 500 }
    );
  }
}

export const GET = cronRoute(handleGET, "/api/cron/disaster-recovery");
