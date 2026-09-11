import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchTickerSectors } from "@/lib/market/sectors";
import { MAX_SECTOR_TICKERS } from "@/lib/sector-words";
import { NextRequest, NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";

/*
  What kind of business each holding is, from the provider.

  Its own route rather than a field on `/api/quotes`, and the argument is
  the one `/api/market/best-days` already records: the quote payload is the
  hottest thing this app serves and it is on a poll, so carrying a fact
  that never moves on it would be paid for on every cycle, all day, by
  every reader.

  The CDN life says the same thing from the other side. A sector changes
  when a company reinvents itself, so a day at the edge is short rather
  than bold, and nothing here is per-reader: two people holding Coca-Cola
  get the same answer, which is what makes it cacheable in public at all.
*/
const SECTOR_TTL_SECONDS = 60 * 60 * 24;

async function handleGET(req: NextRequest) {
  const asked = (req.nextUrl.searchParams.get("tickers") ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (asked.length === 0) {
    return NextResponse.json(
      { sectors: {} },
      { headers: publicCdnHeaders(SECTOR_TTL_SECONDS) }
    );
  }

  /*
    Refused rather than truncated. A caller asking about more names than a
    portfolio can hold is not a reader, and answering the first sixty of a
    thousand would look like success while quietly dropping the rest.
    `fetchTickerSectors` caps as well, because a limit that only one caller
    enforces is a limit one refactor away from being gone.
  */
  if (asked.length > MAX_SECTOR_TICKERS) {
    return NextResponse.json(
      { error: `Ask about at most ${MAX_SECTOR_TICKERS} companies at once.` },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const sectors = await fetchTickerSectors(asked);
  return NextResponse.json(
    { sectors },
    { headers: publicCdnHeaders(SECTOR_TTL_SECONDS) }
  );
}

export const GET = observeRoute(handleGET, "/api/market/sectors");
