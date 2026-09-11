"use client";

import { useEffect, useMemo, useState } from "react";

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

export function useSectorQuotes(funds: string[]): Record<string, Quote> {
  const asked = useMemo(
    () => [...new Set(funds.map((f) => f.trim().toUpperCase()).filter(Boolean))].sort(),
    [funds]
  );
  const key = asked.join(",");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  useEffect(() => {
    if (!key) return;
    let live = true;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(key)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { quotes?: Record<string, Quote> };
        if (live && data.quotes) setQuotes(data.quotes);
      } catch {
        /*
          Quiet. A missing sector move costs one line on a card and every
          caller already draws nothing without it; it is not worth an error
          on a room whose own prices arrived fine.
        */
      }
    })();
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [key]);

  return quotes;
}
