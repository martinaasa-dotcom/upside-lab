import { requireCronAuth } from "@/lib/cron-auth";
import { cronRoute } from "@/lib/cron-heartbeat";
import { warmResearchPages } from "@/lib/research/warm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/*
  Keeps the public research pages written, so that reading one never is.

  Everything about why this exists is in `src/lib/research/warm.ts` and
  `src/lib/research/page-data.ts`. The short version: a page view may not
  spend a model run, because a crawler would then be the one deciding how
  much this app spends, so the runs happen here instead, a few companies at
  a time, at a rate set in `vercel.json`.

  Safe to call as often as anybody likes. `buildCompanyPage` refuses to run
  the model when the shared store already has a usable row, so a second run
  a minute after the first finds nothing to do and writes nothing.
*/
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const result = await warmResearchPages();
  return NextResponse.json(result);
}

export const GET = cronRoute(handleGET, "/api/cron/research-briefs");
