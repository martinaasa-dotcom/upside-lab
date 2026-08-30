import { requireCronAuth } from "@/lib/cron-auth";
import { runErrorDigest } from "@/lib/error-digest";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily. Mails the superadmin when the error log grows a new kind of
 * error or the volume jumps; a quiet day sends nothing. */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await runErrorDigest();
  return NextResponse.json(result, { status: result.status ?? 200 });
}

export const GET = cronRoute(handleGET, "/api/cron/error-digest");
