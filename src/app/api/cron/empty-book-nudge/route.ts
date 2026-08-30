import { requireCronAuth } from "@/lib/cron-auth";
import { dispatchEmptyBookNudges } from "@/lib/empty-book-nudge";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily. One-time encouragement if the book is still empty a week after signup. */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await dispatchEmptyBookNudges();
  return NextResponse.json(result, { status: result.status ?? 200 });
}

export const GET = cronRoute(handleGET, '/api/cron/empty-book-nudge');
