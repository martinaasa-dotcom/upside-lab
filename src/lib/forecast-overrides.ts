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

/**
 * WHERE EACH OF THOSE FIGURES CAME FROM, WHICH THE STORE ABOVE CANNOT SAY.
 *
 * `setEoyOverride` is a reader typing into the Growth room's own field.
 * `mergeEoyTargetPaths` is a forecast run writing a whole path for every
 * holding at once. Both land in the same map as a bare number, and from
 * that moment nothing in this app can tell them apart, so a reader who
 * has never typed a figure in their life was told the price on screen
 * was theirs -- and the house account's own runs were republished to
 * every other reader as figures that account had "typed directly".
 *
 * A number is a number, so the fix is not to move the values: it is to
 * record, beside them, which of the two wrote each one. A year with no
 * entry here is one saved before this app recorded that, or one synced
 * from a device that did not, and the honest word for it is neither
 * "yours" nor "the model's" -- every reader-facing sentence about it
 * says it was saved earlier and offers to be typed over, which is true
 * whichever it was.
 *
 * Deliberately a second key rather than a richer value: the shape of
 * `eoy_overrides` is validated by `sanitizeEoyOverrides`, sent to the
 * account, mirrored into `portfell_house_forecast` and read by four
 * surfaces, and widening a stored number into an object would break
 * every one of them for a fact none of them needs.
 */
export const FORECAST_EOY_SOURCES_KEY = "portfell-forecast-eoy-source-by-portfolio";

/** Who wrote a figure. Absent means it was saved before this was kept. */
export type EoySource = "yours" | "model";
export type EoyTickerSources = Partial<Record<ForecastYear, EoySource>>;
export type PortfolioEoySources = Record<string, EoyTickerSources>;
export type StoredEoySources = Record<string, PortfolioEoySources>;

/**
 * What a surface actually needs to know about the figure it is drawing:
 * the reader typed it, a model run wrote it, or it was saved before this
 * app kept the answer.
 */
export type EoyOrigin = EoySource | "saved";

export function sanitizeEoySources(raw: unknown): PortfolioEoySources {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PortfolioEoySources = {};
  for (const [ticker, row] of Object.entries(raw as Record<string, unknown>)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const key = ticker.trim().toUpperCase();
    if (!key) continue;
    const cleaned: EoyTickerSources = {};
    for (const year of FORECAST_YEARS) {
      const v = (row as Record<string, unknown>)[String(year)];
      if (v === "yours" || v === "model") cleaned[year] = v;
    }
    if (Object.keys(cleaned).length > 0) out[key] = cleaned;
  }
  return out;
}

export function loadEoySources(portfolioId: string): PortfolioEoySources {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FORECAST_EOY_SOURCES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredEoySources;
    return sanitizeEoySources(parsed?.[portfolioId]);
  } catch {
    return {};
  }
}

export function saveEoySources(
  portfolioId: string,
  sources: PortfolioEoySources
) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(FORECAST_EOY_SOURCES_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredEoySources;
    if (Object.keys(sources).length === 0) {
      delete parsed[portfolioId];
    } else {
      parsed[portfolioId] = sources;
    }
    localStorage.setItem(FORECAST_EOY_SOURCES_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

/** The companion to `setEoyOverride`: one year, one reader, one answer. */
export function setEoySource(
  current: PortfolioEoySources,
  ticker: string,
  year: ForecastYear,
  source: EoySource | null
): PortfolioEoySources {
  const key = ticker.toUpperCase();
  const next: PortfolioEoySources = { ...current };
  const row = { ...(next[key] ?? {}) };
  if (source === null) delete row[year];
  else row[year] = source;
  if (Object.keys(row).length === 0) delete next[key];
  else next[key] = row;
  return next;
}

/** The companion to `mergeEoyTargetPaths`: a whole run, marked as one. */
export function mergeEoySourcePaths(
  current: PortfolioEoySources,
  paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[],
  source: EoySource
): PortfolioEoySources {
  const next = { ...current };
  for (const path of paths) {
    const key = path.ticker.toUpperCase();
    const row = { ...(next[key] ?? {}) };
    for (const year of FORECAST_YEARS) {
      const p = path.prices[year];
      // Exactly the years `mergeEoyTargetPaths` writes a price for, so
      // the two maps cannot disagree about which years a run answered.
      if (typeof p === "number" && p > 0) row[year] = source;
    }
    if (Object.keys(row).length === 0) delete next[key];
    else next[key] = row;
  }
  return next;
}

/** `mergeBookEoyOverrides` for the sources, and for the same reason. */
export function mergeBookEoySources(
  perPortfolio: PortfolioEoySources[]
): PortfolioEoySources {
  let merged: PortfolioEoySources = {};
  for (const row of perPortfolio) {
    merged = { ...merged, ...row };
  }
  return merged;
}
