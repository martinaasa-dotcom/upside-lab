/**
 * Instant-load cache for the Upside Portfolio page, same pattern as
 * lib/community-cache.ts.
 *
 * The fund only changes once a day (the cron writes a new report after the
 * close), yet the page used to start with loading = true and wait on the
 * network every single visit. Now the last payload paints immediately and
 * a background refresh corrects it, which matters most for the live quote
 * numbers layered on top.
 */

const CACHE_KEY = "upside-fund-v1";

export type UpsidePortfolioCacheEntry = {
  payload: unknown;
  cachedAt: string;
};

export function loadUpsidePortfolioCache(): UpsidePortfolioCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UpsidePortfolioCacheEntry | null;
    if (!parsed?.payload || !parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveUpsidePortfolioCache(payload: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ payload, cachedAt: new Date().toISOString() })
    );
  } catch {
    /* ignore quota / private mode */
  }
}
