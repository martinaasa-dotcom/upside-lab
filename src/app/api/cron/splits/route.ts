import { requireCronAuth } from "@/lib/cron-auth";
import { applyDueSplits } from "@/lib/share-splits";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Weekday mornings, after the opening bell.

  A split takes effect at the open, and until it is applied every holding of
  that company is the wrong number of shares. The schedule is 15:00 UTC, which
  is 11:00 in New York in summer and 10:00 in winter, so one line covers both
  halves of the year and neither of them runs before the market has opened.

  Safe to call as often as anyone likes: the day's claim means one worker asks
  the provider, and the ledger means a split is applied once.
*/
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const result = await applyDueSplits();
  return NextResponse.json(result);
}

export const GET = observeRoute(handleGET, "/api/cron/splits");
