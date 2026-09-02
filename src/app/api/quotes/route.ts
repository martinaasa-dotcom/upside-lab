import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import {
  MAX_TICKERS_PER_REQUEST,
  MAX_UNKNOWN_NAMES_PER_REQUEST,
  fetchFxOnly,
  fetchQuotesWithFallback,
  namesThatWouldWalk,
} from "@/lib/market/quotes";
import { marketSession } from "@/lib/market/session";
import {
  chargeUnresolvedBudget,
  checkUnresolvedBudget,
} from "@/lib/market/unresolved-budget";
import { isQuotableTicker } from "@/lib/ticker";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";

/**
 * How long the CDN may reuse a quote response. Browsers always revalidate
 * (max-age=0) so a tab that opened overnight cannot keep serving a
 * flattened close after pre-market starts. Vercel-CDN-Cache-Control is set
 * too: Next otherwise stamps dynamic route handlers with no-store and the
 * s-maxage never reaches the edge.
 */
function cacheSeconds(): number {
  switch (marketSession()) {
    case "open":
    case "extended":
      return 15;
    case "closed":
      return 60;
  }
}

function tooManyUnknown(retryAfterSec: number | undefined) {
  return NextResponse.json(
    { error: "Too many unknown tickers. Try again shortly." },
    {
      status: 429,
      headers: {
        ...noStoreHeaders(),
        "Retry-After": String(retryAfterSec ?? 60),
      },
    }
  );
}

async function handleGET(req: NextRequest) {
  const tickersParam = req.nextUrl.searchParams.get("tickers") ?? "";
  const asked = tickersParam
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  // Free text is the expensive thing here, so it never reaches a provider.
  // Names that are not symbol-shaped are dropped rather than failing the
  // whole request: a portfolio can hold one bad row from an old import, and
  // blanking every price the reader has because of it would be a worse
  // answer than the one missing price they were going to get anyway.
  const tickers = asked.filter((t) => isQuotableTicker(t));
  const notSymbols = asked.filter((t) => !isQuotableTicker(t));

  // A caller whose whole list was free text has nothing to ask about, and
  // saying so plainly is better than an empty answer that reads as an outage.
  if (tickers.length === 0 && notSymbols.length > 0) {
    return NextResponse.json(
      { error: "Those don't look like real ticker symbols." },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  // FX-only: Compound / empty books still need EURUSD open, close and last
  if (
    tickers.length === 0 ||
    (tickers.length === 1 && tickers[0] === "EURUSD=X")
  ) {
    const fx = await fetchFxOnly();
    return NextResponse.json(
      {
        quotes: {},
        fx,
        delayed: false,
        updatedAt: new Date().toISOString(),
      },
      { headers: publicCdnHeaders(Math.max(60, cacheSeconds())) }
    );
  }

  // One request may not be turned into an unbounded upstream fan-out. See
  // MAX_TICKERS_PER_REQUEST -- the per-IP limiter counts requests, not the
  // provider calls a single request can cause.
  if (tickers.length > MAX_TICKERS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `Too many tickers in one request. Ask for at most ${MAX_TICKERS_PER_REQUEST}.`,
      },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  // Looking up names that resolve nowhere is the expensive thing this
  // endpoint does, and an address that has spent its share of it is refused
  // before any provider is contacted. Real books never reach this.
  const budget = await checkUnresolvedBudget(req);
  if (!budget.ok) return tooManyUnknown(budget.retryAfterSec);

  // Which of these names no cache can vouch for, and would therefore walk
  // the whole exchange chain. For a real portfolio the answer is an empty
  // list and nothing is charged; for a script inventing symbols it is the
  // whole request, and it is settled here rather than after the walk.
  const walkers = await namesThatWouldWalk(tickers);
  const deferred = new Set(walkers.slice(MAX_UNKNOWN_NAMES_PER_REQUEST));
  const bill = await chargeUnresolvedBudget(
    req,
    walkers.slice(0, MAX_UNKNOWN_NAMES_PER_REQUEST)
  );
  if (!bill.ok) return tooManyUnknown(bill.retryAfterSec);

  // Names past the per-request ceiling wait for the next poll rather than
  // being refused. The ones asked about this time are in the shared cache
  // by then, so a genuinely new portfolio fills itself in over a few
  // seconds instead of the reader being told no.
  const askNow =
    deferred.size === 0 ? tickers : tickers.filter((t) => !deferred.has(t));

  const { quotes, delayed, fx, sources, missing, updatedAt } =
    await fetchQuotesWithFallback(askNow);

  return NextResponse.json(
    {
      quotes,
      fx,
      delayed,
      sources,
      missing: [...missing, ...deferred, ...notSymbols],
      updatedAt: new Date(updatedAt).toISOString(),
    },
    { headers: publicCdnHeaders(cacheSeconds()) }
  );
}

export const GET = observeRoute(handleGET, '/api/quotes');
