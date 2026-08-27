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
