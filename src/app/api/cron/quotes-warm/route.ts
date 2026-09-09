import { requireCronAuth } from "@/lib/cron-auth";
import { logError } from "@/lib/error-log";
import { MAX_TICKERS_PER_REQUEST, fetchQuotesWithFallback } from "@/lib/market/quotes";
import { dbError } from "@/lib/db-error";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { cronRoute } from "@/lib/cron-heartbeat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Vercel Cron, once a day just before the open. Keeps the shared quote
  store (memory + `portfell_quote_cache`) warm for every ticker anybody
  actually holds, whether or not anybody has the app open right now.

  Without this, a portfolio nobody has looked at all day has a store entry
  that is however old the last person's visit was -- fine most of the time,
  and exactly the case that produces the flash `quotes.ts` documents: a
  reader opens a cold browser, the local cache is a wildly stale number,
  and the live fetch that corrects it pays a full Yahoo round trip because
  nothing kept the shared answer fresh in the meantime. This sweep is what
  makes the warm path in `fetchQuotesWithFallbackUnshared` actually warm for
  a portfolio nobody in the household has opened recently, rather than only
  benefiting from whoever else's own poll happens to be running.

  Was every five minutes through market hours. The Hobby plan refuses to
  deploy any cron that fires more than once a day, which that schedule
  quietly did from the
  moment it merged -- every production deploy behind it failed at the
  platform level, not the build, so nothing in CI caught it. One run
  timed for the open is both what the plan allows and the single best
  moment to spend it: it warms the cache for the readers most likely to
  open a cold app right then, at a fraction of the compute the five-minute
  cadence cost. See `CRON_GRACE_SECONDS["quotes-warm"]` in `cron-checks.ts`.

  `portfell_tickers_held` is the same RPC `applyDueSplits` uses for "every
  ticker somebody holds" -- one distinct list across every portfolio in the
  project, computed in Postgres rather than paged out row by row, which is
  what makes it exempt from the `readAll` paging rule (see `read-all.ts`).
*/
async function handleGET(req: Request) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      { error: "Quote warm sweep skipped. SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  try {
    const { data: held, error } = await supabase.rpc("portfell_tickers_held");
    if (error) throw error;

    const tickers = [
      ...new Set(
        ((held ?? []) as { ticker: string }[])
          .map((row) => row.ticker?.toUpperCase())
          .filter((ticker): ticker is string => Boolean(ticker))
      ),
    ];

    if (tickers.length === 0) {
      return NextResponse.json({ ok: true, tickers: 0, batches: 0 });
    }

    // One request per MAX_TICKERS_PER_REQUEST names -- the same ceiling
    // `/api/quotes` enforces on a single call, so this sweep never asks a
    // provider for more at once than a real reader's own request could.
    const batches: string[][] = [];
    for (let i = 0; i < tickers.length; i += MAX_TICKERS_PER_REQUEST) {
      batches.push(tickers.slice(i, i + MAX_TICKERS_PER_REQUEST));
    }

    for (const batch of batches) {
      // Sequential on purpose: these batches share the same free-tier
      // provider quota every reader's own poll draws from, so a warm sweep
      // fanning out in parallel would spend a burst of it on nobody's
      // behalf. `fetchQuotesWithFallback` writes through to the shared
      // store itself -- that write-through is the entire point of this
      // route, nothing further is done with the result here.
      await fetchQuotesWithFallback(batch);
    }

    return NextResponse.json({ ok: true, tickers: tickers.length, batches: batches.length });
  } catch (err) {
    await logError({
      source: "server",
      message: `Quote warm sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/quotes-warm",
      event: "quotes_warm_failed",
    });
    return NextResponse.json(
      { error: dbError(err, "GET /api/cron/quotes-warm: sweep") },
      { status: 500 }
    );
  }
}

export const GET = cronRoute(handleGET, "/api/cron/quotes-warm");
