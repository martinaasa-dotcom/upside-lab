import type { ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";

/** Per-portfolio manual / Margus EOY SP overrides. Never delete this key lightly. */
export const FORECAST_EOY_OVERRIDES_KEY = "portfell-forecast-eoy-by-portfolio";

export type EoyTickerOverrides = Partial<Record<ForecastYear, number>>;
export type PortfolioEoyOverrides = Record<string, EoyTickerOverrides>;
export type StoredEoyOverrides = Record<string, PortfolioEoyOverrides>;

export function loadEoyOverrides(
  portfolioId: string
): PortfolioEoyOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FORECAST_EOY_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredEoyOverrides;
    return parsed?.[portfolioId] ?? {};
  } catch {
    return {};
  }
}

export function saveEoyOverrides(
  portfolioId: string,
  overrides: PortfolioEoyOverrides
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(FORECAST_EOY_OVERRIDES_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredEoyOverrides;
    if (Object.keys(overrides).length === 0) {
      delete parsed[portfolioId];
    } else {
      parsed[portfolioId] = overrides;
    }
    localStorage.setItem(FORECAST_EOY_OVERRIDES_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function setEoyOverride(
  current: PortfolioEoyOverrides,
  ticker: string,
  year: ForecastYear,
  price: number | null
): PortfolioEoyOverrides {
  const key = ticker.toUpperCase();
  const next: PortfolioEoyOverrides = { ...current };
  const row = { ...(next[key] ?? {}) };

  if (price == null || !(price > 0) || Number.isNaN(price)) {
    delete row[year];
  } else {
    row[year] = Math.round(price * 100) / 100;
  }

  if (Object.keys(row).length === 0) {
    delete next[key];
  } else {
    next[key] = row;
  }
  return next;
}

/**
 * Every portfolio's own overrides, folded into one map keyed by ticker.
 *
 * `loadEoyOverrides` answers for ONE portfolio, which is right for a
 * view scoped to that portfolio and wrong for anything that spans the
 * whole book: a ticker held in a portfolio that is not the one open
 * right now would otherwise silently lose its own end-of-year target on
 * a surface that reads only the active portfolio's copy, while a
 * per-holding surface that merges across every portfolio a ticker sits
 * in (the way `anchorForHolding` is used everywhere else) still finds
 * it. That is the same holding anchored on two different kinds of
 * figure on two screens, which is the one thing a shared price ladder
 * may never do. There is no rule in this app for which portfolio's
 * target should win when the same ticker carries one in more than one,
 * so the last one in the list wins, same as any other object spread.
 */
export function mergeBookEoyOverrides(
  perPortfolio: PortfolioEoyOverrides[]
): PortfolioEoyOverrides {
  let merged: PortfolioEoyOverrides = {};
  for (const row of perPortfolio) {
    merged = { ...merged, ...row };
  }
  return merged;
}

/** Merge a full Margus path (partial years OK) into overrides. */
export function mergeEoyTargetPaths(
  current: PortfolioEoyOverrides,
  paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[]
): PortfolioEoyOverrides {
  const next = { ...current };
  for (const path of paths) {
    const key = path.ticker.toUpperCase();
    const row = { ...(next[key] ?? {}) };
    for (const year of FORECAST_YEARS) {
      const p = path.prices[year];
      if (typeof p === "number" && p > 0) {
        row[year] = Math.round(p * 100) / 100;
      }
    }
    if (Object.keys(row).length === 0) delete next[key];
    else next[key] = row;
  }
  return next;
}
