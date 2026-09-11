"use client";

import { useEffect, useMemo, useState } from "react";

import { quoteViewMaxAgeMs } from "@/lib/market/session";
import { loadCachedQuotes } from "@/lib/quote-cache";
import type { Quote } from "@/lib/types";

/**
 * One price per ticker for the whole browser, for the length of a session.
 *
 * The server has worked this way for a long time: `quote-store.ts` keeps a
 * quote per ticker in the isolate and in Supabase, so two readers asking
 * about Apple in two different lists cost one provider call. Across reloads
 * the browser did too, in `quote-cache.ts`, which merges everything ever
 * fetched into one blob so the first paint is a real valuation.
 *
 * What was missing was the read path in between. A quote lived wherever it
 * happened to be fetched -- the portfolio poll in the Dashboard's state, a
 * searched company in Pulse's own state, a sector fund in a third place --
 * so nothing could use a price somebody else had already asked for, and one
 * ticker could be fetched three times by one person on one screen.
 *
 * So there is one map and everything reads and writes it:
 *
 * Whoever fetches, everyone benefits. The portfolio poll publishes every
 * quote it receives, so a room wanting a ticker the reader already holds
 * asks for nothing at all.
 *
 * Nothing asks for what it already has. `ensureQuotes` requests only the
 * names missing or stale, so a room wanting five of which four are known
 * fetches one.
 *
 * Concurrent askers share one request, so two rooms mounting together do
 * not both dial out for the same list.
 *
 * And it opens warm. The first read seeds from the saved snapshot, so a
 * reader coming back to a room they were in yesterday has prices before a
 * single request goes out, and the poll corrects them a moment later.
 *
 * Freshness is the app's own rule rather than a number invented here:
 * `quoteViewMaxAgeMs` is what every reader-triggered path is judged by and
 * it tightens and loosens with the market session.
 */

type Entry = { quote: Quote; at: number };

const POOL = new Map<string, Entry>();
const INFLIGHT = new Map<string, Promise<void>>();
const LISTENERS = new Set<() => void>();

/**
 * A ceiling, so a long session of looking companies up cannot grow this
 * without bound. Oldest out first; a dropped entry costs one fetch.
 */
const MAX_ENTRIES = 400;

let seeded = false;

/**
 * Seeded from the saved snapshot at `savedAt`, which is the age that blob
 * already carries, so a price restored from yesterday is correctly too old
 * to show and is re-asked rather than drawn as today's.
 */
function seedOnce(): void {
  if (seeded || typeof window === "undefined") return;
  seeded = true;
  try {
    const { quotes, savedAt } = loadCachedQuotes();
    if (!savedAt) return;
    for (const [ticker, quote] of Object.entries(quotes)) {
      if (quote) POOL.set(ticker.toUpperCase(), { quote, at: savedAt });
    }
  } catch {
    /* a browser with storage off simply starts cold */
  }
}

function prune(): void {
  if (POOL.size <= MAX_ENTRIES) return;
  const oldest = [...POOL.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [ticker] of oldest.slice(0, POOL.size - MAX_ENTRIES)) {
    POOL.delete(ticker);
  }
}

function poolKey(ticker: string): string {
  return ticker.trim().toUpperCase();
}

/**
 * Put quotes in, from wherever they came.
 *
 * Called by the portfolio poll and by a company lookup, which is what makes
 * the rest of this worth having: between them they already fetch most of
 * what any room wants.
 */
export function publishQuotes(
  quotes: Record<string, Quote> | null | undefined,
  at: number = Date.now()
): void {
  if (!quotes) return;
  seedOnce();
  let wrote = false;
  for (const [ticker, quote] of Object.entries(quotes)) {
    const key = poolKey(ticker);
    if (!quote || !key) continue;
    POOL.set(key, { quote, at });
    wrote = true;
  }
  if (!wrote) return;
  prune();
  for (const listener of LISTENERS) listener();
}

/** The quote for this ticker, if one is here and fresh enough to show. */
export function pooledQuote(ticker: string, now: number = Date.now()): Quote | null {
  seedOnce();
  const hit = POOL.get(poolKey(ticker));
  if (!hit) return null;
  return now - hit.at <= quoteViewMaxAgeMs() ? hit.quote : null;
}

/** The names of these that are missing or too old to show. */
export function staleAmong(tickers: string[], now: number = Date.now()): string[] {
  return [...new Set(tickers.map(poolKey).filter(Boolean))]
    .filter((ticker) => !pooledQuote(ticker, now))
    .sort();
}

/**
 * Fetch exactly the names that are not already here, and publish them.
 *
 * Keyed on the sorted list of missing names, so two rooms arriving together
 * wanting the same thing make one call.
 */
export async function ensureQuotes(tickers: string[]): Promise<void> {
  const missing = staleAmong(tickers);
  if (missing.length === 0) return;
  const id = missing.join(",");
  const running = INFLIGHT.get(id);
  if (running) return running;

  const run = (async () => {
    try {
      const res = await fetch(`/api/quotes?tickers=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { quotes?: Record<string, Quote> };
      publishQuotes(data.quotes);
    } catch {
      /*
        Quiet, and nothing is written. Every caller draws nothing without a
        price and the page carries its own freshness stamp, so one bad
        minute must not be recorded as an answer.
      */
    } finally {
      INFLIGHT.delete(id);
    }
  })();

  INFLIGHT.set(id, run);
  return run;
}

/**
 * Prices for these tickers, fetching only what is not already known.
 *
 * A name with no price yet is absent rather than null, so a caller reads
 * one thing whether the answer has not arrived or never will.
 */
export function useQuotes(tickers: string[]): Record<string, Quote> {
  const asked = useMemo(
    () => [...new Set(tickers.map(poolKey).filter(Boolean))].sort(),
    [tickers]
  );
  const [, setTick] = useState(0);

  // Subscribed, so a quote published by the portfolio poll or by a company
  // lookup reaches a room that is only reading.
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    LISTENERS.add(listener);
    return () => {
      LISTENERS.delete(listener);
    };
  }, []);

  const missingKey = staleAmong(asked).join(",");
  useEffect(() => {
    if (!missingKey) return;
    void ensureQuotes(missingKey.split(","));
  }, [missingKey]);

  /*
    Recomputed every render and cheap, because it is a read of the map
    rather than a fetch. It is the real dependency of the answer below: it
    changes exactly when a price arrives or ages out, which a linter can
    see where a counter standing in for a module store cannot.
  */
  const readyKey = asked
    .map((ticker) => `${ticker}:${pooledQuote(ticker)?.price ?? ""}`)
    .join("|");

  return useMemo(() => {
    const out: Record<string, Quote> = {};
    const now = Date.now();
    for (const ticker of asked) {
      const quote = pooledQuote(ticker, now);
      if (quote) out[ticker] = quote;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on readyKey, which is the module map's contents; the map is not state React can see
  }, [asked, readyKey]);
}

/** Test seam. */
export function resetQuotePoolForTests(): void {
  POOL.clear();
  INFLIGHT.clear();
  seeded = false;
}
