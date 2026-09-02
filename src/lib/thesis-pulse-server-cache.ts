/**
 * Server cache for Pulse. A hit (up to 4 hours) is served as-is.
 * The model is not called again just because the read is a bit old.
 */

import {
  isEmptyPulseCheck,
  isMoveRestatement,
  type PulseCheck,
  type PulseHeadline,
} from "@/lib/thesis-pulse";

export type PulseServerCacheEntry = {
  check: PulseCheck;
  headlines: PulseHeadline[];
  cachedAt: number;
  effectivePct: number | null;
  /*
    Which model wrote this check, kept with it rather than taken from
    whichever run happened to serve it.

    A Pulse report is mostly cache hits: nine names on screen can be eight
    entries up to four hours old, several of them written for a different
    signed-in reader under the shared nothesis key, and one fresh call. The
    report stamped that one call's model and "just now" across all nine, so
    the provenance eye, whose whole job is to say where a sentence came
    from, named a model that had not written eight of them and a time that
    was up to four hours wrong.
  */
  writtenBy: { provider: string; model: string } | null;
};

// Cache timings
export const PULSE_SERVER_FRESH_TTL_MS = 60 * 60 * 1000;
export const PULSE_SERVER_STALE_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_CACHE_SIZE = 300;

const PULSE_SERVER_CACHE = new Map<string, PulseServerCacheEntry>();
// Keyed by the requesting user's id. The summary is "one short sentence on
// the portfolio as a whole" (specific tickers, whether a call left Hold) --
// unlike the per-ticker check cache above, this is inherently one person's
// book and must never be handed to a different signed-in user who happens
// to hit the same rate-limit / busy-slot fallback within the TTL window.
const SUMMARY_CACHE = new Map<string, { summary: string; cachedAt: number }>();
const MAX_SUMMARY_CACHE_SIZE = 300;

export function getMoveBucket(effectivePct: number | null): string {
  if (effectivePct == null || !Number.isFinite(effectivePct)) return "flat";
  if (effectivePct <= -0.10) return "down_deep";
  if (effectivePct <= -0.05) return "down_heavy";
  if (effectivePct <= -0.02) return "down_mild";
  if (effectivePct >= 0.08) return "up_deep";
  if (effectivePct >= 0.04) return "up_heavy";
  if (effectivePct >= 0.015) return "up_mild";
  return "flat";
}

export function getPulseCacheKey(
  ticker: string,
  effectivePct: number | null,
  thesis?: string,
  level?: number
): string {
  const symbol = ticker.toUpperCase();
  const bucket = getMoveBucket(effectivePct);
  const thesisKey = thesis
    ? `${thesis.trim().slice(0, 40)}:${level ?? 0}`
    : "nothesis";
  return `${symbol}:${bucket}:${thesisKey}`;
}

/**
 * Whether this key's answer will be handed to other readers.
 *
 * A check on a company the reader has written nothing about is stored under
 * the shared spelling and served to every other holder of it in the same
 * move bucket. That is the sharing the cache exists for, and it is also the
 * one place a caller must not be allowed to write on purpose.
 */
export function isSharedPulseKey(key: string): boolean {
  return key.endsWith(":nothesis");
}

export function getCachedPulseCheck(
  key: string,
  opts?: { force?: boolean }
): PulseServerCacheEntry | null {
  if (opts?.force) return null;
  const entry = PULSE_SERVER_CACHE.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > PULSE_SERVER_STALE_TTL_MS) {
    PULSE_SERVER_CACHE.delete(key);
    return null;
  }

  if (isEmptyPulseCheck(entry.check) || isMoveRestatement(entry.check.moveReason) || isMoveRestatement(entry.check.verdict)) {
    PULSE_SERVER_CACHE.delete(key);
    return null;
  }

  return entry;
}

export function setCachedPulseCheck(
  key: string,
  check: PulseCheck,
  headlines: PulseHeadline[],
  effectivePct: number | null,
  writtenBy: { provider: string; model: string } | null = null
) {
  if (isEmptyPulseCheck(check) || isMoveRestatement(check.moveReason) || isMoveRestatement(check.verdict)) return;
  prunePulseCacheIfNeeded();
  PULSE_SERVER_CACHE.set(key, {
    check,
    headlines,
    cachedAt: Date.now(),
    effectivePct,
    writtenBy,
  });
}

export function getCachedPulseSummary(userId: string): string | null {
  const entry = SUMMARY_CACHE.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > PULSE_SERVER_FRESH_TTL_MS) {
    SUMMARY_CACHE.delete(userId);
    return null;
  }
  return entry.summary;
}

export function setCachedPulseSummary(userId: string, summary: string) {
  if (!summary || !summary.trim()) return;
  if (SUMMARY_CACHE.size > MAX_SUMMARY_CACHE_SIZE) {
    const sorted = [...SUMMARY_CACHE.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < 50; i++) {
      if (sorted[i]) SUMMARY_CACHE.delete(sorted[i][0]);
    }
  }
  SUMMARY_CACHE.set(userId, {
    summary: summary.trim(),
    cachedAt: Date.now(),
  });
}

function prunePulseCacheIfNeeded() {
  if (PULSE_SERVER_CACHE.size > MAX_CACHE_SIZE) {
    const sorted = [...PULSE_SERVER_CACHE.entries()].sort(
      (a, b) => a[1].cachedAt - b[1].cachedAt
    );
    for (let i = 0; i < 50; i++) {
      if (sorted[i]) {
        PULSE_SERVER_CACHE.delete(sorted[i][0]);
      }
    }
  }
}
