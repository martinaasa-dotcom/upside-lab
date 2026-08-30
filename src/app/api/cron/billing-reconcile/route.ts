import { requireCronAuth } from "@/lib/cron-auth";
import { reconcileBillingSubscriptions } from "@/lib/billing-reconcile";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily backstop for the Stripe webhook (Pass 6 M1). Re-derives every
 * subscribed profile's status from Stripe directly, so a dropped or
 * delayed webhook self-heals within a day instead of drifting silently.
 */
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  const result = await reconcileBillingSubscriptions();
  return NextResponse.json(result, { status: result.status ?? 200 });
}

export const GET = cronRoute(handleGET, "/api/cron/billing-reconcile");
