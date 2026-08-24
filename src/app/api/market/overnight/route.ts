import { publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchOvernightIndication } from "@/lib/market/overnight-fetch";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * The overnight indication. Public and identical for everybody, so it is
 * the CDN's to serve: one upstream pair of chart calls covers every reader
 * in the window rather than one pair per open tab.
 *
 * Outside the window this answers `{ indication: null }` rather than a 404,
 * because "the market is printing normally, there is nothing to indicate"
 * is a successful answer and the client renders nothing for it.
 */
async function handleGET() {
  const indication = await fetchOvernightIndication();
  return NextResponse.json(
    { indication },
    { headers: publicCdnHeaders(indication ? 60 : 300) }
  );
}

export const GET = observeRoute(handleGET, "/api/market/overnight");
