import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchMarketEvents } from "@/lib/market/yahoo";
import { MAX_TICKERS_PER_REQUEST } from "@/lib/market/quotes";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";
import { checkUnresolvedBudget } from "@/lib/market/unresolved-budget";
import { isQuotableTicker } from "@/lib/ticker";

export const runtime = "nodejs";
export const maxDuration = 30;

async function handleGET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers") ?? "";
  // Free text costs a provider call apiece here and can never answer, so it
  // is dropped before anything is contacted. Dropped rather than refused,
  // for the reason /api/quotes gives: one bad row in a portfolio must not
  // take the earnings dates off every other name in it.
  const tickers = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => Boolean(t) && isQuotableTicker(t));

  // Same cost ceiling as /api/quotes: one request must not fan out without
  // a bound, whatever the per-IP request limiter says.
  if (tickers.length > MAX_TICKERS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many tickers in one request. Ask for at most ${MAX_TICKERS_PER_REQUEST}.`,
      },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  if (tickers.length === 0) {
    return NextResponse.json(
      { earnings: [], catalysts: [] },
      { headers: publicCdnHeaders(3600, 7200) }
    );
  }

  // This route cannot report which names died -- `fetchMarketEvents` does
  // not resolve symbols the way the quote path does -- so it does not
  // contribute to the budget. It does honour it: an address already refused
  // for spraying invented symbols at /api/quotes does not get to keep
  // spending here instead.
  const budget = await checkUnresolvedBudget(req);
  if (!budget.ok) {
    return NextResponse.json(
      { error: "Too many unknown tickers. Try again shortly." },
      {
        status: 429,
        headers: {
          ...noStoreHeaders(),
          "Retry-After": String(budget.retryAfterSec ?? 60),
        },
      }
    );
  }

  const events = await fetchMarketEvents(tickers);
  const withBriefs =
    req.nextUrl.searchParams.get("brief") === "1"
      ? {
          ...events,
          earnings: await (
            await import("@/lib/earnings-brief")
          ).attachEarningsBriefs(events.earnings),
        }
      : events;
  return NextResponse.json(withBriefs, {
    headers: publicCdnHeaders(3600, 7200),
  });
}

export const GET = observeRoute(handleGET, "/api/market/events");
