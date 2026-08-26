import { noStoreHeaders, publicCdnHeaders } from "@/lib/cdn-cache";
import { fetchMarketSentimentSnapshot, sentimentCacheTtlSec } from "@/lib/market/sentiment-fetch";
import { NextResponse } from "next/server";
import { observeRoute } from "@/lib/observe-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET() {
  const snapshot = await fetchMarketSentimentSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { error: "Market reading unavailable" },
      { status: 502, headers: noStoreHeaders() }
    );
  }
  const ttl = sentimentCacheTtlSec();
  return NextResponse.json(snapshot, {
    headers: publicCdnHeaders(ttl, ttl * 2),
  });
}

export const GET = observeRoute(handleGET, "/api/market/sentiment");
