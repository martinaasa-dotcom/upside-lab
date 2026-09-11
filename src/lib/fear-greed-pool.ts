"use client";

import { loadMacroPaint, saveFearGreedPaint } from "@/lib/paint-cache";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";

/**
 * One market-mood reading for the whole browser.
 *
 * This is `quote-pool.ts` for the figure that is not a price. The score is
 * published once a day and the route behind it is CDN cached for fifteen
 * minutes, so it is the single most shareable number in the product, and
 * it was the one nothing shared: the header strip, Pulse and the Playbook
 * each fetched it themselves. Measured on the real app, opening Pulse put
 * three requests for it on the wire in the same millisecond.
 *
 * The saved paint had the opposite fault, and it is the one that actually
 * reached a reader. It carried no time, so `if (!loadMacroPaint()?.fearGreed)`
 * -- the guard the header strip used -- meant that once any score had ever
 * been written, the mount fetch never ran again: somebody opening the app
 * in the morning read yesterday's mood under a card saying "today" until a
 * poll tick came round, which overnight is ten minutes and at the weekend
 * thirty. A cache with no way to go stale is the fault this repo keeps
 * recording, in a new place.
 *
 * So: one entry, one in-flight request, and an age. `MAX_AGE_MS` is the
 * route's own CDN life, because asking more often than the edge refreshes
 * cannot return anything new.
 */

const MAX_AGE_MS = 15 * 60 * 1000;

let entry: { snapshot: FearGreedSnapshot; at: number } | null = null;
let inflight: Promise<void> | null = null;
const LISTENERS = new Set<() => void>();

/**
 * Seeded from the saved paint, at the age that paint carries.
 *
 * A paint written before this field existed has no time on it, so it is
 * read as arbitrarily old: shown at once, because a number on screen beats
 * an empty cell, and re-asked immediately rather than trusted.
 */
function seed(): void {
  if (entry || typeof window === "undefined") return;
  const paint = loadMacroPaint();
  const fg = paint?.fearGreed;
  if (!fg || typeof fg.score !== "number") return;
  entry = { snapshot: fg, at: paint?.fearGreedAt ?? 0 };
}

/** The reading, if one is here -- fresh or not. */
export function pooledFearGreed(): FearGreedSnapshot | null {
  seed();
  return entry?.snapshot ?? null;
}

/** Whether what is here is recent enough that asking again is waste. */
export function fearGreedIsFresh(now: number = Date.now()): boolean {
  seed();
  return entry != null && now - entry.at <= MAX_AGE_MS;
}

function publish(snapshot: FearGreedSnapshot, at: number): void {
  entry = { snapshot, at };
  saveFearGreedPaint(snapshot, at);
  for (const listener of LISTENERS) listener();
}

/**
 * Fetch the reading unless a fresh one is already here.
 *
 * Concurrent callers share one request, which is what makes three
 * components wanting it on one screen cost one round trip.
 */
export async function ensureFearGreed(force = false): Promise<void> {
  if (!force && fearGreedIsFresh()) return;
  if (inflight) return inflight;

  const run = (async () => {
    try {
      const res = await fetch("/api/market/fear-greed");
      if (!res.ok) return;
      const data = (await res.json()) as FearGreedSnapshot | null;
      if (data && typeof data.score === "number") publish(data, Date.now());
    } catch {
      /*
        Quiet, and nothing is written. Every caller draws nothing without a
        reading, and one bad minute must not be recorded as an answer.
      */
    } finally {
      inflight = null;
    }
  })();

  inflight = run;
  return run;
}

/** Told when a reading lands, so a component that only reads still updates. */
export function onFearGreed(listener: () => void): () => void {
  LISTENERS.add(listener);
  return () => {
    LISTENERS.delete(listener);
  };
}
