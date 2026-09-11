"use client";

import { useEffect, useMemo, useState } from "react";

import { quoteViewMaxAgeMs } from "@/lib/market/session";
import type { Quote } from "@/lib/types";

/**
 * Today's move for the sector funds a portfolio touches.
 *
 * Its own small fetch rather than a rider on the portfolio's quote
 * request, and the argument is the one `/api/market/best-days` records:
 * the reader's own quote poll is the hottest thing this app serves and its
 * payload is per portfolio, where these eleven symbols are the same for
 * everybody. Asked on their own they are a CDN hit shared by every reader
 * in the product rather than eleven more names on every poll.
 *
 * `/api/quotes` is already public and already edge-cached at fifteen to
 * sixty seconds depending on the session, so a sector fund a thousand
 * readers are looking at is not a thousand provider calls. Nothing here
 * polls: a card is drawn once when the room opens, and the reader's own
 * prices carry the freshness stamp the page shows.
 */

/**
 * Kept for the session, and re-asked only once the reader would notice.
 *
 * Without this the hook re-fetched on every room it was mounted in:
 * measured by walking Home, Pulse, Lab, Pulse, Lab in one session, the
 * sectors were asked for once and these were asked for nine times. A
 * sector fund's price is a price, so it does have to move -- but not on
 * every tap between two rooms, and `quoteViewMaxAgeMs` is the app's own
 * answer to how stale a price may be at the moment somebody is looking.
 */
const CACHE = new Map<string, { at: number; quote: Quote }>();
const INFLIGHT = new Map<string, Promise<void>>();

function fresh(symbol: string, now: number): Quote | null {
  const hit = CACHE.get(symbol);
  if (!hit) return null;
  return now - hit.at <= quoteViewMaxAgeMs() ? hit.quote : null;
}

async function load(symbols: string[]): Promise<void> {
  const key = symbols.join(",");
  const running = INFLIGHT.get(key);
  if (running) return running;

  const run = (async () => {
    try {
      const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(key)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { quotes?: Record<string, Quote> };
      const now = Date.now();
      for (const [symbol, quote] of Object.entries(data.quotes ?? {})) {
        if (quote) CACHE.set(symbol.toUpperCase(), { at: now, quote });
      }
    } catch {
      /*
        Quiet. A missing sector move costs one line on a card, every caller
        already draws nothing without it, and nothing is written, so one
        bad minute does not become a session with no comparison in it.
      */
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, run);
  return run;
}

export function useSectorQuotes(funds: string[]): Record<string, Quote> {
  const asked = useMemo(
    () => [...new Set(funds.map((f) => f.trim().toUpperCase()).filter(Boolean))].sort(),
    [funds]
  );
  const [, setTick] = useState(0);

  /*
    Recomputed every render and cheap, because it is a read of the map
    rather than a fetch. It is the real dependency of the answer below:
    it changes exactly when a quote arrives or goes stale, which is
    something a linter can see where a counter standing in for a module
    store is not.
  */
  const now = Date.now();
  const missing = asked.filter((symbol) => !fresh(symbol, now));
  const missingKey = missing.join(",");
  const readyKey = asked
    .map((symbol) => `${symbol}:${fresh(symbol, now)?.changePercent ?? ""}`)
    .join("|");

  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    void load(missingKey.split(",")).then(() => {
      if (live) setTick((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  return useMemo(() => {
    const out: Record<string, Quote> = {};
    const at = Date.now();
    for (const symbol of asked) {
      const quote = fresh(symbol, at);
      if (quote) out[symbol] = quote;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on readyKey, which is the module cache's contents; the cache is not state React can see
  }, [asked, readyKey]);
}
