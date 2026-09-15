"use client";

/**
 * One fetch of "what does this company look worth", shared by every room
 * that draws a price ladder.
 *
 * The same shape as `quote-pool.ts` and `fear-greed-pool.ts` and for the
 * same reason: the holdings map, Home's list, the alerts and the Circle
 * all want the same answer for overlapping sets of names, and a request
 * per surface would ask the feeds the same question four times over.
 *
 * AN ENTRY CARRIES ITS AGE, WHICH IS THE PART THIS REPOSITORY KEEPS
 * RELEARNING. A cache with no way to go stale is a cache that hands a
 * reader last week's figure forever, so a reading older than
 * `MAX_AGE_MS` is asked again rather than trusted. The server's own
 * `fetchCompanyFacts` is cached for an hour, so asking more often than
 * that cannot return anything new; a quarter of an hour here means a
 * company that reports mid-session reaches the ladder in the same
 * session without the browser polling for it.
 *
 * A name the feed could not answer about is remembered as a miss with a
 * time on it, not dropped: without that, a ticker with no valuation
 * would be re-asked on every render for the life of the tab.
 */
import { useEffect, useMemo, useState } from "react";
import {
  MAX_ANCHOR_TICKERS,
  type CompanyAnchor,
  type CompanyAnchors,
} from "@/lib/company/company-anchor-types";

export const MAX_AGE_MS = 15 * 60_000;

type Entry = {
  anchor: CompanyAnchor | null;
  at: number;
  /**
   * The ask failed rather than the feed having nothing to say. Held so a
   * room is never stuck waiting on a route that is down -- it falls back
   * to the ladder it always had -- while still asking again soon, rather
   * than sitting on a shrug for a quarter of an hour.
   */
  failed?: boolean;
};

/** How soon a failed ask is worth repeating. */
export const RETRY_MS = 60_000;

const pool = new Map<string, Entry>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();

function announce() {
  for (const l of [...listeners]) l();
}

function fresh(ticker: string, now: number): boolean {
  const entry = pool.get(ticker);
  if (!entry) return false;
  return now - entry.at < (entry.failed ? RETRY_MS : MAX_AGE_MS);
}

/** Every anchor this browser already holds, for the names asked about. */
export function anchorsFor(tickers: string[]): CompanyAnchors {
  const out: CompanyAnchors = {};
  for (const t of tickers) {
    const entry = pool.get(t);
    if (entry?.anchor) out[t] = entry.anchor;
  }
  return out;
}

/**
 * Ask about any of these names this browser has no fresh answer for.
 *
 * Exported so the pool's own rules can be tested without a React tree:
 * everything that matters here is the bookkeeping, not the rendering.
 */
export async function ensureCompanyAnchors(tickers: string[]): Promise<void> {
  const now = Date.now();
  const wanted = tickers.filter(
    (t) => !fresh(t, now) && !inFlight.has(t)
  );
  if (wanted.length === 0) return;
  for (const t of wanted) inFlight.add(t);

  // One request per `MAX_ANCHOR_TICKERS`, because that is what the route
  // will answer about; a book bigger than that asks twice rather than
  // silently losing the tail.
  const batches: string[][] = [];
  for (let i = 0; i < wanted.length; i += MAX_ANCHOR_TICKERS) {
    batches.push(wanted.slice(i, i + MAX_ANCHOR_TICKERS));
  }

  for (const batch of batches) {
    try {
      const res = await fetch(
        `/api/company/anchors?tickers=${encodeURIComponent(batch.join(","))}`
      );
      if (!res.ok) {
        for (const t of batch) {
          pool.set(t, { anchor: null, at: Date.now(), failed: true });
          inFlight.delete(t);
        }
        continue;
      }
      const data = (await res.json()) as { anchors?: CompanyAnchors };
      const at = Date.now();
      for (const t of batch) {
        pool.set(t, { anchor: data.anchors?.[t] ?? null, at });
        inFlight.delete(t);
      }
    } catch {
      for (const t of batch) {
        pool.set(t, { anchor: null, at: Date.now(), failed: true });
        inFlight.delete(t);
      }
    }
    // Per batch rather than at the end, so a book bigger than one
    // request draws the first half while the second is still out.
    announce();
  }
}

/**
 * True once every one of these names has been answered about at all.
 *
 * Deliberately "ever", not "recently": an entry being due for a refresh
 * is no reason to take a ladder off the screen while the refresh runs,
 * and a route that is down answers here too (as a failure) so a room
 * falls back to the ladder it always had rather than waiting forever.
 */
export function anchorsSettled(tickers: string[]): boolean {
  return tickers.every((t) => pool.has(t));
}

/**
 * The shared anchor for each of these names, asked for once however many
 * rooms want it, and whether the asking has finished.
 *
 * `ready` matters because the alternative to waiting is not "no ladder",
 * it is a ladder anchored on whatever this browser could see on its own,
 * which is the per-browser anchor this whole file exists to replace. A
 * room that draws those for a moment and then redraws them has shown the
 * reader a band that was never true, and on the surfaces that alert, it
 * has raised one.
 */
export function useCompanyAnchors(tickers: string[]): {
  anchors: CompanyAnchors;
  ready: boolean;
} {
  // The identity of the array changes on every quote poll; the list of
  // names does not, so the key is what the effect and the memo watch.
  const key = [...new Set(tickers.map((t) => t.toUpperCase()))]
    .sort()
    .join(",");
  /*
    A VERSION, NOT THE ANSWER ITSELF, BECAUSE THE ANSWER IS WHAT EVERY
    LADDER IN THE ROOM IS MEMOISED ON.

    `anchorsFor` builds a fresh record every time it is called, so
    returning it raw would hand every caller a new object identity on
    every render -- and these rooms re-render on every quote poll, with
    `useMemo` on the ladders precisely so a poll does not rebuild forty
    of them. So the record is built once per change and held, and the
    change is what the pool announces.
  */
  const [version, bump] = useState(0);

  useEffect(() => {
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const names = key.split(",").filter(Boolean);
    if (names.length === 0) return;
    void ensureCompanyAnchors(names);
  }, [key]);

  return useMemo(() => {
    const names = key.split(",").filter(Boolean);
    return {
      anchors: anchorsFor(names),
      // Nothing to wait for is ready: a book with no holdings in it is
      // not a book whose anchors have failed to arrive.
      ready: names.length === 0 || anchorsSettled(names),
    };
    // `version` is the pool telling this hook its own answer moved; the
    // pool is a module, so nothing else can say so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}

/** Testing seam: forget everything this browser has been told. */
export function resetCompanyAnchorPool() {
  pool.clear();
  inFlight.clear();
}
