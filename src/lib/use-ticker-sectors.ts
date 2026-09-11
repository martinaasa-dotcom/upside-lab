"use client";

import { MAX_SECTOR_TICKERS } from "@/lib/sector-words";
import { useEffect, useMemo, useState } from "react";

/**
 * What kind of business each holding is, asked once and then remembered.
 *
 * Deliberately not a poll and deliberately not part of the quote cycle. A
 * sector is the one fact about a holding that does not move: a company
 * changes what it does over years, so asking twice in a session is a
 * provider call spent re-learning something that cannot have changed. The
 * rooms that draw a portfolio all read from the same module-level map, so
 * walking from Lab to Pulse asks for nothing.
 *
 * `null` in the map is an answer, not a gap. It means the provider was
 * asked about this name and had nothing -- a fund, a coin, a listing it
 * does not profile -- and recording that is what stops every room asking
 * again about the same name for the rest of the session.
 */
const KNOWN = new Map<string, string | null>();

/** Sets already in flight, so two rooms mounting at once ask once. */
const INFLIGHT = new Map<string, Promise<void>>();

function normalize(tickers: string[]): string[] {
  return [
    ...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)),
  ].sort();
}

async function loadSectors(missing: string[]): Promise<void> {
  const key = missing.join(",");
  const existing = INFLIGHT.get(key);
  if (existing) return existing;

  const run = (async () => {
    try {
      const res = await fetch(
        `/api/market/sectors?tickers=${encodeURIComponent(key)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        sectors?: Record<string, { words?: string }>;
      };
      const found = data.sectors ?? {};
      for (const ticker of missing) {
        const words = found[ticker]?.words;
        /*
          A name the answer did not mention is recorded as null rather than
          left out. Leaving it out would put it back in `missing` on the
          next render and ask again on every mount, forever, for exactly
          the holdings the provider is never going to answer about.
        */
        KNOWN.set(ticker, typeof words === "string" && words ? words : null);
      }
    } catch {
      /*
        Quiet, and nothing is written. A network failure is not evidence
        that a company has no sector, so recording null here would turn one
        bad minute into a session with no sectors in it.
      */
    } finally {
      INFLIGHT.delete(key);
    }
  })();

  INFLIGHT.set(key, run);
  return run;
}

/**
 * Sectors for these holdings, as `{ TICKER: words }`. Names the provider
 * has nothing for are absent, so a caller reads one thing whether the
 * answer has not arrived yet or never will.
 */
export function useTickerSectors(tickers: string[]): Record<string, string> {
  const asked = useMemo(() => normalize(tickers), [tickers]);
  /*
    The counter only asks React for another render. What actually makes the
    answer change is `knownKey` below, and the difference matters: the
    sectors live in a module map, so nothing React can see changes when a
    fetch lands. A memo keyed on the holdings alone would hand back the
    empty answer it built on the first render for as long as that array
    kept its identity, which on a quiet room is the whole session.
  */
  const [, setTick] = useState(0);

  const missingKey = asked.filter((t) => !KNOWN.has(t)).join(",");
  /*
    Recomputed every render and cheap, because it is a read of the map
    rather than a fetch. It is the real dependency of the memo: it changes
    exactly when an answer arrives, and a linter can see that, where it
    cannot see a counter standing in for a store it does not know about.
  */
  const knownKey = asked.map((t) => `${t}:${KNOWN.get(t) ?? ""}`).join("|");

  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    const missing = missingKey.split(",").slice(0, MAX_SECTOR_TICKERS);
    void loadSectors(missing).then(() => {
      // A render, not a state shape: the answers live in the module map,
      // which every room reads, so the only thing this component needs is
      // to be told to look again.
      if (live) setTick((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const ticker of asked) {
      const words = KNOWN.get(ticker);
      if (words) out[ticker] = words;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on knownKey, which is the module map's contents; the map is not state React can see
  }, [asked, knownKey]);
}

/** Test seam: forget everything asked so far. */
export function resetTickerSectorsForTests() {
  KNOWN.clear();
  INFLIGHT.clear();
}
