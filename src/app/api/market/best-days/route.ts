import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import {
  fetchBestDaysRead,
  sentimentCacheTtlSec,
} from "@/lib/market/sentiment-fetch";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Ten years of the index with its best and worst days taken out, for the
  Playbook. Its own route rather than a field on the sentiment snapshot,
  which every reader fetches from Home on a poll: measured, carrying it
  there made that payload 24% larger for a figure one Lab tab draws. It
  reads the same cached walk, so there is no second provider call.

  A longer CDN life than the gauges, and that is the point of splitting it:
  this answer only moves when a trading day closes, where the VIX and the
  Fear & Greed score move all session.
*/
const TEN_YEAR_TTL_MULTIPLE = 6;

async function handleGET() {
  const read = await fetchBestDaysRead();
  if (!read) {
    return NextResponse.json(
      { error: "Ten year read unavailable" },
      { status: 502, headers: noStoreHeaders() }
    );
  }
  const ttl = sentimentCacheTtlSec() * TEN_YEAR_TTL_MULTIPLE;
  return NextResponse.json(
    { bestDays: read },
    { headers: publicCdnHeaders(ttl, ttl * 2) }
  );
}

export const GET = observeRoute(handleGET, "/api/market/best-days");
