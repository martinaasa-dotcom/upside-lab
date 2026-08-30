import { runDisasterRecoveryJob } from "@/lib/dr/export-book";
import { requireCronAuth } from "@/lib/cron-auth";
import { cronRoute } from "@/lib/cron-heartbeat";
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
      console.error("[cron/disaster-recovery]", result.warnings.join(" | "));
      return NextResponse.json(result, { status: 503 });
    }
    if (result.warnings.length) {
      console.error(
        "[cron/disaster-recovery] warnings",
        result.warnings.join(" | ")
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/disaster-recovery]", err);
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
