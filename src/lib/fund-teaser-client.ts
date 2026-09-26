/**
 * One request for the Fund's teaser, however many Home cards want it.
 *
 * Two cards on Home read it (the latest trade and the Fund's balance in
 * "Around Upside Lab"), and each asking for itself put the same request on
 * the wire twice on every visit. The answer is cached on the server for
 * fifteen seconds, so a shared in-flight promise that lives that long here
 * costs nothing and asks once.
 */

import type { FundTrade } from "@/lib/fund-latest-trade";

export type FundTeaserPayload = {
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  headline: string | null;
  dayNumber: number;
  openCount: number;
  startingCapital?: number;
  trade?: (FundTrade & { path: { date: string; close: number }[] }) | null;
};

const LIFE_MS = 15_000;
let inFlight: { at: number; promise: Promise<FundTeaserPayload | null> } | null = null;

export function fetchFundTeaser(): Promise<FundTeaserPayload | null> {
  if (inFlight && Date.now() - inFlight.at < LIFE_MS) return inFlight.promise;
  const promise = fetch("/api/upside-portfolio/teaser")
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as FundTeaserPayload;
      return Number.isFinite(data.totalValue) ? data : null;
    })
    .catch(() => null);
  inFlight = { at: Date.now(), promise };
  return promise;
}
