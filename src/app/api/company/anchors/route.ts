/**
 * What a list of companies look worth, one reading each, the same reading
 * for everybody who asks.
 *
 * This is the shared anchor every price ladder outside the Research room
 * hangs off: the holdings map, the list on Home, the alerts and the
 * Circle's pooled picture. Before it, each of those anchored a company on
 * whatever it happened to have in hand, so one name sat in a different
 * band on every screen. See `company-anchors.ts` for the whole argument.
 *
 * Signed in, because the query string is a list of the caller's own
 * holdings and that is their data whatever the answer costs. The answer
 * itself is not theirs and is not private: it is one number per company
 * built from the feed's own figures, and the expensive half of it is
 * already cached for an hour per company inside `fetchCompanyFacts`, so a
 * second reader asking about the same name pays nothing.
 */
import { NextResponse } from "next/server";
import { loadCompanyAnchors } from "@/lib/company/company-anchors";
import { MAX_ANCHOR_TICKERS } from "@/lib/company/company-anchor-types";
import { isQuotableTicker } from "@/lib/ticker";
import { noStoreHeaders } from "@/lib/cdn-cache";
import { observeRoute } from "@/lib/observe-route";
import { requireAuthUser } from "@/lib/supabase/server-auth";

export const dynamic = "force-dynamic";

async function handleGET(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const raw = new URL(req.url).searchParams.get("tickers") ?? "";
  /*
    Refused before anything is fetched, which is what keeps a shared,
    cached read safe: the ticker list is the only caller-supplied value
    that reaches this route, and a symbol the market does not list would
    be a provider call nobody could ever check.
  */
  const tickers = raw
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0 && isQuotableTicker(t))
    .slice(0, MAX_ANCHOR_TICKERS);

  if (tickers.length === 0) {
    return NextResponse.json({ anchors: {} }, { headers: noStoreHeaders() });
  }

  const anchors = await loadCompanyAnchors(tickers);
  return NextResponse.json({ anchors }, { headers: noStoreHeaders() });
}

export const GET = observeRoute(handleGET, "/api/company/anchors");
