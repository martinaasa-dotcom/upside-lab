// Type-only imports: erased at build time, so ForecastPlan can still be
// derived from the schema without pulling zod into the client bundle that
// ForecastPanel (a client component) loads from this module.
import type { z } from "zod";
import type { forecastPlanSchema } from "@/lib/forecast-plan-schema";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { insightsPromptBlock } from "@/lib/book-insights";
import { humanizeMargusTree } from "@/lib/ai/humanize-copy";
import type { ForecastModel, ForecastYear } from "@/lib/forecast";
import type { ModelRun } from "@/lib/ai/model-label";
import { FORECAST_YEARS } from "@/lib/forecast";
import {
  FORECAST_CONVICTION_PROMPT,
  fillMissingForecastYears,
  forecastThemeForTicker,
  liftPathToThemeMagnitude,
  restoreCurrentYearDestination,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";
import { todayKeyInTz } from "@/lib/timezone";

export const FORECAST_PLAN_STORAGE_KEY = "portfell-forecast-plan-by-portfolio";
const FORECAST_PLAN_PREV_KEY = "portfell-forecast-plan-prev-by-portfolio";

export type ForecastStance = "bearish" | "base" | "bullish";

/** Default (and only) stance. Cautious/optimistic toggles are gone. */
export const DEFAULT_FORECAST_STANCE: ForecastStance = "base";

/**
 * What kind of business each ticker is, in words a reader gets.
 *
 * These are not an internal tag. They are printed on the Forecast cards and
 * they are what the allocation breakdown groups by, so somebody who has
 * never worked in finance reads them. They used to be written for somebody
 * who has: "AI infra / neo-cloud", "Cloud SaaS / observability",
 * "Semiconductors / lithography", "US large-cap index (UCITS)". Four of
 * those are not English outside a trading floor, and one of them is a fund
 * regulation. Say what the company actually does instead.
 */
export const TICKER_SECTORS: Record<string, string> = {
  NBIS: "Rents out computers for AI",
  CRWV: "Rents out computers for AI",
  RKLB: "Rockets and spacecraft",
  BMNR: "Holds Bitcoin",
  VST: "Generates electricity",
  SOFI: "Online banking and loans",
  HOOD: "An app for buying shares",
  PLTR: "Software for handling data",
  NOW: "Business software",
  CRM: "Business software",
  DDOG: "Software that watches other software",
  SNOW: "Software for storing data",
  NVDA: "Makes computer chips",
  AVGO: "Makes computer chips",
  RDDT: "A social network",
  PWR: "Builds power lines and grids",
  ASML: "Makes the machines that make chips",
  "ASML.AS": "Makes the machines that make chips",
  GOOGL: "Search, ads and AI",
  AAPL: "Phones, computers and software",
  NFLX: "Film and television streaming",
  UNH: "Health insurance",
  LLY: "Makes medicines",
  ISRG: "Makes surgical robots",
  AVAV: "Defence and drones",
  KTOS: "Defence and drones",
  SPY: "A fund of large US companies",
  "CSPX.L": "A fund of large US companies",
  "VWCE.DE": "A fund of companies worldwide",
  "SMH.L": "A fund of chip makers",
  "ABEA.DE": "Search, ads and AI",
  "JEDI.L": "A fund built around one theme",
  "ANX.PA": "A European company",
  "EX13.VI": "A fund of European companies",
};

export type ForecastPlan = z.infer<typeof forecastPlanSchema> & {
  generatedAt: string;
  portfolioId: string;
  portfolioName: string;
  stance: ForecastStance;
  /** Sorted ticker fingerprint when the plan was generated */
  holdingsKey?: string;
  /** Per-ticker conviction/thesis fingerprint when the plan was generated */
  convictionKey?: string;
  /** Generic theme-shaped prices when Margus never finished a run. */
  fallback?: boolean;
  /**
   * Which model actually answered, recorded at the moment it did. The eye
   * beside a modeled price names it, so a reader can look it up rather than
   * take "a language model" on faith. Absent on a plan that no model ran.
   */
  writtenBy?: ModelRun | null;
  /**
   * Tickers whose path was reused from an earlier run somewhere else in
   * Upside Lab rather than written fresh, mapped to when that run happened.
   * A reused path was reasoned from the company, not from this portfolio,
   * and the reader is told which of their names that applies to.
   */
  reused?: Record<string, string>;
};

export function isFallbackForecastPlan(
  plan: ForecastPlan | null | undefined
): boolean {
  return Boolean(plan?.fallback);
}

export type StoredForecastPlans = Record<string, ForecastPlan>;

/** Shared EOY paths, keyed by ticker, so Anu/MaryAnn reuse Aasad's reasoning
 * instead of calling the model every time a portfolio is opened. */
export const FORECAST_TICKER_CACHE_KEY = "portfell-forecast-ticker-paths";

export type CachedTickerPath = {
  prices: Partial<Record<ForecastYear, number>>;
  rationale?: string;
  generatedAt: string;
  convictionKey: string;
};

export type StoredTickerPaths = Record<string, CachedTickerPath>;

type ConvictionLike = Record<string, { level: number; thesis: string }>;

export function forecastHoldingsKey(tickers: string[]): string {
  return [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join("|");
}

export function tickerConvictionKey(
  ticker: string,
  convictions?: ConvictionLike
): string {
  if (!convictions) return "";
  const c =
    convictions[ticker] ??
    convictions[ticker.toUpperCase()] ??
    convictions[ticker.split(".")[0]!.toUpperCase()];
  if (!c) return "";
  return `${c.level}:${(c.thesis ?? "").trim()}`;
}

export function bookConvictionKey(
  tickers: string[],
  convictions?: ConvictionLike
): string {
  return [...new Set(tickers.map((t) => t.toUpperCase()))]
    .sort()
    .map((t) => `${t}=${tickerConvictionKey(t, convictions)}`)
    .join("|");
}

function tickerCacheIsFresh(
  cached: CachedTickerPath | undefined,
  ticker: string,
  convictions?: ConvictionLike
): boolean {
  if (!cached?.prices || Object.keys(cached.prices).length === 0) return false;
  const nowKey = tickerConvictionKey(ticker, convictions);
  // Harvested pre-fingerprint entries stay usable so opening a portfolio after
  // this ships does not fire a model run. A later explicit regenerate stamps
  // a real key; thesis edits after that do trigger a refresh.
  if (!cached.convictionKey) return true;
  return cached.convictionKey === nowKey;
}

function harvestPlansIntoTickerCache(
  cache: StoredTickerPaths
): StoredTickerPaths {
  if (typeof window === "undefined") return cache;
  try {
    const raw = localStorage.getItem(FORECAST_PLAN_STORAGE_KEY);
    if (!raw) return cache;
    const parsed = JSON.parse(raw) as StoredForecastPlans;
    for (const plan of Object.values(parsed ?? {})) {
      for (const t of plan.eoyTargets ?? []) {
        const key = t.ticker.toUpperCase();
        if (cache[key] || !t.prices) continue;
        cache[key] = {
          prices: t.prices,
          rationale: t.rationale,
          generatedAt: plan.generatedAt ?? "",
          convictionKey: "",
        };
      }
    }
  } catch {
    /* ignore */
  }
  return cache;
}

export function loadTickerPathCache(): StoredTickerPaths {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(FORECAST_TICKER_CACHE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredTickerPaths;
    return harvestPlansIntoTickerCache(parsed ?? {});
  } catch {
    return harvestPlansIntoTickerCache({});
  }
}

function persistTickerPathCache(cache: StoredTickerPaths) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FORECAST_TICKER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

export function upsertTickerPathsFromPlan(
  plan: ForecastPlan,
  convictions?: ConvictionLike
) {
  if (typeof window === "undefined") return;
  const cache = loadTickerPathCache();
  for (const t of plan.eoyTargets ?? []) {
    if (!t.prices) continue;
    cache[t.ticker.toUpperCase()] = {
      prices: t.prices,
      rationale: t.rationale,
      generatedAt: plan.generatedAt ?? cache[t.ticker.toUpperCase()]?.generatedAt ?? "",
      convictionKey: convictions
        ? tickerConvictionKey(t.ticker, convictions)
        : cache[t.ticker.toUpperCase()]?.convictionKey ?? "",
    };
  }
  persistTickerPathCache(cache);
}

export function cachedEoyPathsFor(
  tickers: string[],
  convictions?: ConvictionLike
): {
  ticker: string;
  prices: Partial<Record<ForecastYear, number>>;
  rationale?: string;
}[] {
  const cache = loadTickerPathCache();
  const out: {
    ticker: string;
    prices: Partial<Record<ForecastYear, number>>;
    rationale?: string;
  }[] = [];
  for (const ticker of tickers) {
    const hit = cache[ticker.toUpperCase()];
    if (!tickerCacheIsFresh(hit, ticker, convictions) || !hit) continue;
    out.push({ ticker, prices: hit.prices, rationale: hit.rationale });
  }
  return out;
}

export function cachedTickersFor(
  tickers: string[],
  convictions?: ConvictionLike
): string[] {
  return cachedEoyPathsFor(tickers, convictions).map((p) =>
    p.ticker.toUpperCase()
  );
}

export type ForecastAutoRefresh =
  | { run: false; reason: "ok" | "empty" }
  | {
      run: true;
      reason: "first-run" | "new-holding";
    };

/** Auto-run the model only when there is no reusable path yet: first visit
 * with nothing cached, or a newly added ticker with no shared path.
 * A saved plan, a shared ticker path, or a filled grid is enough. Opening
 * the portfolio again, switching portfolios, or convictions loading in late must
 * not call the model. "Work it out again" is the user's override. */
export function shouldAutoRefreshForecast(input: {
  plan: ForecastPlan | null;
  tickers: string[];
  fullyCovered: boolean;
  cachedTickers?: string[];
}): ForecastAutoRefresh {
  const tickers = input.tickers.map((t) => t.toUpperCase());
  if (tickers.length === 0) return { run: false, reason: "empty" };
  if (input.plan && isFallbackForecastPlan(input.plan)) {
    return { run: true, reason: "first-run" };
  }
  if (input.fullyCovered) return { run: false, reason: "ok" };

  const cached = new Set(
    (input.cachedTickers ?? []).map((t) => t.toUpperCase())
  );
  const planned = new Set(
    (input.plan?.eoyTargets ?? []).map((t) => t.ticker.toUpperCase())
  );
  const uncovered = tickers.filter((t) => !cached.has(t) && !planned.has(t));
  if (uncovered.length === 0) return { run: false, reason: "ok" };

  if (!input.plan) return { run: true, reason: "first-run" };
  return { run: true, reason: "new-holding" };
}

export function loadForecastPlan(portfolioId: string): ForecastPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FORECAST_PLAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredForecastPlans;
    const plan = parsed?.[portfolioId];
    if (!plan?.periods?.length) return null;
    if (plan.fallback) return null;
    return humanizeMargusTree({
      ...plan,
      stance: plan.stance ?? "base",
      eoyTargets: plan.eoyTargets ?? [],
    });
  } catch {
    return null;
  }
}

export function loadPreviousForecastPlan(portfolioId: string): ForecastPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FORECAST_PLAN_PREV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredForecastPlans;
    const plan = parsed?.[portfolioId];
    if (!plan?.eoyTargets?.length) return null;
    return plan;
  } catch {
    return null;
  }
}

export function saveForecastPlan(
  plan: ForecastPlan,
  convictions?: ConvictionLike,
  opts?: { shareTickerPaths?: boolean }
) {
  if (typeof window === "undefined") return;
  try {
    const cleaned = humanizeMargusTree({
      ...plan,
      stance: DEFAULT_FORECAST_STANCE,
    });
    const raw = localStorage.getItem(FORECAST_PLAN_STORAGE_KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as StoredForecastPlans;
    const prev = parsed[cleaned.portfolioId];
    if (prev?.generatedAt && prev.generatedAt !== cleaned.generatedAt) {
      const prevRaw = localStorage.getItem(FORECAST_PLAN_PREV_KEY);
      const prevStore = (prevRaw ? JSON.parse(prevRaw) : {}) as StoredForecastPlans;
      prevStore[cleaned.portfolioId] = prev;
      localStorage.setItem(FORECAST_PLAN_PREV_KEY, JSON.stringify(prevStore));
    }
    parsed[cleaned.portfolioId] = cleaned;
    localStorage.setItem(FORECAST_PLAN_STORAGE_KEY, JSON.stringify(parsed));
    // A shaped fallback is a safety net for this portfolio, not a reasoned
    // path to copy onto Anu/MaryAnn and skip their first real run.
    if (opts?.shareTickerPaths !== false) {
      upsertTickerPathsFromPlan(cleaned, convictions);
    }
  } catch {
    /* ignore */
  }
}

function stanceGuidance(): string {
  return `Reason each ticker's path from its own fundamentals, its cycle and how jumpy it is, anchored on the baseline above. Do not paste one magnitude across the portfolio in either direction: a steady name landing near the market baseline and a jumpy name landing far above or far below it can both be right in the same run. A quiet year is shape, not automatically a smaller destination. No per-ticker price target to match. Consistency: if nothing about the company has meaningfully changed since a prior run, keep magnitudes in a similar neighborhood rather than reshuffling for no reason.`;
}

function isJunkRationale(text: string | undefined): boolean {
  if (!text?.trim()) return true;
  return /too timid|portfolio-aligned|sheet-aligned|overridden|rejected as|house baseline|calibrated \w+ \w+ path|thesis \w+ \w+ path from spot/i.test(
    text
  );
}

function themeDynamicsLabel(
  theme: ReturnType<typeof forecastThemeForTicker>
): string {
  switch (theme) {
    case "ai_infra":
      return "AI computer builders S-curve with quiet years, not a straight line";
    case "ai_power":
      return "datacenter power bottleneck compounding through buildout";
    case "crypto":
      return "crypto easy-money cycle with an explicit winter in the middle";
    case "space":
      return "launch-rhythm story with quiet stretches between expansion legs";
    case "semi":
      return "AI chip cycle that pauses, then runs again on spend";
    case "fintech":
      return "payment and finance companies that move when rates and risk appetite move";
    case "software":
      return "software / SaaS adoption with a quiet stretch in the middle";
    case "healthcare":
      return "healthcare compounder with non-linear clinical / payer cycles";
    case "drones":
      return "defense / autonomy rhythm with quiet program years";
    case "index":
      return "broad market grind, quieter than a single big bet";
    default:
      return "path with non-linear bull runs and quiet stretches";
  }
}

function fallbackRationale(input: {
  ticker: string;
  theme: ReturnType<typeof forecastThemeForTicker>;
  spot: number;
  prices: Record<ForecastYear, number>;
  existing?: string;
  reshaped: boolean;
}): string {
  if (!input.reshaped && !isJunkRationale(input.existing)) {
    return input.existing!.trim();
  }
  const y26 = input.prices[FORECAST_YEARS[0]!];
  const y30 = input.prices[FORECAST_YEARS[FORECAST_YEARS.length - 1]!];
  return `${input.ticker}: ${themeDynamicsLabel(input.theme)}; illustrative path EOY’26 ~$${Math.round(y26)} → ’30 ~$${Math.round(y30)} (spot $${input.spot.toFixed(0)}). Modeled prices, not a target.`;
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled. Gaps and
 * boringly-linear ramps use the theme shape. A non-linear path whose 2030
 * multiple still sits below the theme band is lifted (shape kept, destination
 * restored). A path already at or above the band is never lowered. If the
 * current calendar year is hugging today's spot, that cell is rewritten as
 * the remaining-year move, not a restatement of now.
 */
/**
 * What this app did to the model's answer before you saw it.
 *
 * The path on screen is not always the path the model wrote. A year it
 * left empty gets filled from a table of typical shapes, a straight line
 * gets replaced with a shaped one, and a path finishing below the shape
 * kept for that kind of business gets scaled up to it. Every one of those
 * is defensible and none of them is the reader's assumption, so the eye
 * beside the price says which of them happened to this name.
 */
export type ForecastPathAdjustment = {
  /** The model gave no path for this name at all. */
  missing: boolean;
  /** It skipped at least one year, and the app filled that year in. */
  filled: boolean;
  /** It came out as an even ramp, so the app replaced it with a shaped path. */
  reshaped: boolean;
  /** It finished below the shape kept for this kind of business, so the app
   * scaled it up to that shape. Paths above it are never scaled down. */
  lifted: boolean;
};

export function forecastPathWasAdjusted(
  adjust: ForecastPathAdjustment | undefined
): boolean {
  return Boolean(
    adjust && (adjust.missing || adjust.filled || adjust.reshaped || adjust.lifted)
  );
}

export function ensureCompleteEoyTargets(
  forecast: ForecastModel,
  eoyTargets: ForecastPlan["eoyTargets"],
  /** Told, per ticker, what the app changed. Optional: only the surfaces
   * that show a reader where a number came from need to hear it. */
  onAdjust?: (ticker: string, adjust: ForecastPathAdjustment) => void
): ForecastPlan["eoyTargets"] {
  const byTicker = new Map<string, ForecastPlan["eoyTargets"][number]>();
  for (const t of eoyTargets ?? []) {
    byTicker.set(t.ticker.toUpperCase(), {
      ...t,
      ticker: t.ticker,
      prices: { ...t.prices },
    });
  }

  const out: ForecastPlan["eoyTargets"] = [];
  for (const row of forecast.rows) {
    const key = row.ticker.toUpperCase();
    const existing = byTicker.get(key);
    const spot = row.currentPrice > 0 ? row.currentPrice : 1;
    const theme = forecastThemeForTicker(row.ticker);
    const shaped = shapedFallbackPath(spot, theme);
    let prices = fillMissingForecastYears(existing?.prices, shaped);

    const reshape = isNearLinear(prices, spot) && theme !== "index";
    if (reshape) {
      prices = { ...shaped };
    }

    const lifted = liftPathToThemeMagnitude(prices, shaped, spot);
    prices = restoreCurrentYearDestination(lifted.prices, shaped, spot);

    onAdjust?.(row.ticker.toUpperCase(), {
      missing: !existing?.prices,
      filled: FORECAST_YEARS.some((y) => {
        const given = existing?.prices?.[y];
        return !(typeof given === "number" && given > 0);
      }),
      reshaped: reshape,
      lifted: lifted.lifted,
    });

    out.push({
      ticker: row.ticker,
      prices: prices as ForecastPlan["eoyTargets"][number]["prices"],
      rationale: fallbackRationale({
        ticker: row.ticker,
        theme,
        spot,
        prices,
        existing: existing?.rationale,
        reshaped: reshape,
      }),
    });
  }
  return out;
}

/**
 * Complete plan from the generic theme shapes. Used when the model is
 * down, skipped, or still thinking, so the portfolio is never a flat line
 * of today's price.
 */
export function buildFallbackForecastPlan(input: {
  forecast: ForecastModel;
  portfolioId: string;
  portfolioName: string;
  now?: Date;
}): ForecastPlan {
  const now = input.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  const nextQuarter =
    quarter === 4
      ? { q: 1, y: year + 1 }
      : { q: quarter + 1, y: year };
  const eoyTargets = ensureCompleteEoyTargets(input.forecast, []);
  return humanizeMargusTree({
    generalAdvice:
      "The starting prices in the table come from how each kind of company has tended to move. Margus still has to write the reasoning.",
    sectorRotation:
      "Different groups of similar stocks will take turns leading. The finished writeup picks which group matters for this portfolio.",
    periods: [
      {
        label: `Next quarter (Q${nextQuarter.q} ${nextQuarter.y})`,
        theme: "Starting shape",
        add: "No mix change",
        trim: "No mix change",
      },
      {
        label: `${year + 1}`,
        theme: "Starting path",
        add: "No mix change",
        trim: "No mix change",
      },
    ],
    eoyTargets,
    generatedAt: now.toISOString(),
    portfolioId: input.portfolioId,
    portfolioName: input.portfolioName,
    stance: DEFAULT_FORECAST_STANCE,
    fallback: true,
  });
}

/**
 * Assemble a plan straight from the shared server-side ticker cache
 * (src/lib/forecast-ticker-cache-store.ts), with no model call at all. Used
 * when every holding in the portfolio already has a fresh cached path from
 * some other portfolio's run, so a person never waits on Margus to re-derive
 * a name that has already been reasoned out.
 */
export function buildCachedForecastPlan(input: {
  forecast: ForecastModel;
  portfolioId: string;
  portfolioName: string;
  cacheHits: Record<
    string,
    {
      prices: Partial<Record<ForecastYear, number>>;
      rationale?: string;
      generatedAt?: string;
    }
  >;
  now?: Date;
}): ForecastPlan {
  const now = input.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  const nextQuarter =
    quarter === 4
      ? { q: 1, y: year + 1 }
      : { q: quarter + 1, y: year };
  const seeded = input.forecast.rows.map((r) => {
    const hit = input.cacheHits[r.ticker.toUpperCase()];
    return {
      ticker: r.ticker,
      prices: (hit?.prices ?? {}) as ForecastPlan["eoyTargets"][number]["prices"],
      rationale: hit?.rationale,
    };
  });
  const eoyTargets = ensureCompleteEoyTargets(input.forecast, seeded);

  /*
    Nothing here was worked out just now, so the plan must not say it was.
    "Worked out ..." is printed under the grid and handed to Margus, and the
    oldest path in it is the honest answer for the whole plan: it is the one
    the reader would most want to know the age of.
  */
  const reused = input.forecast.rows
    .map((r) => input.cacheHits[r.ticker.toUpperCase()]?.generatedAt)
    .filter((at): at is string => Boolean(at) && Number.isFinite(Date.parse(at!)));
  const oldest = reused.length
    ? reused.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
    : null;
  return humanizeMargusTree({
    generalAdvice:
      "Every holding here already had a modeled price path worked out, so this loaded that earlier work instead of asking the model again. Press Work it out again for a fresh one.",
    sectorRotation:
      "This was reused from an earlier run on these same holdings. Ask Margus to work it out again if you want a fresh read on which groups are leading.",
    periods: [
      {
        label: `Next quarter (Q${nextQuarter.q} ${nextQuarter.y})`,
        theme: "Reused from a shared run",
        add: "No mix change",
        trim: "No mix change",
      },
      {
        label: `${year + 1}`,
        theme: "Reused from a shared run",
        add: "No mix change",
        trim: "No mix change",
      },
    ],
    eoyTargets,
    generatedAt: oldest ?? now.toISOString(),
    portfolioId: input.portfolioId,
    portfolioName: input.portfolioName,
    stance: DEFAULT_FORECAST_STANCE,
    fallback: false,
  });
}

/** Detect boring equal-step / near-constant YoY ramps the model sometimes emits. */
function isNearLinear(
  prices: Record<ForecastYear, number>,
  spot: number
): boolean {
  const seq = [spot, ...FORECAST_YEARS.map((y) => prices[y])];
  const yoy: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]!;
    const cur = seq[i]!;
    if (!(prev > 0) || !(cur > 0)) return false;
    yoy.push(cur / prev - 1);
  }
  if (yoy.length < 3) return false;
  const mean = yoy.reduce((s, x) => s + x, 0) / yoy.length;
  const variance =
    yoy.reduce((s, x) => s + (x - mean) ** 2, 0) / yoy.length;
  // Nearly identical YoY each year → linear idiot path
  if (variance < 0.0008 && Math.abs(mean) < 0.35) return true;
  // Nearly equal dollar steps
  const steps: number[] = [];
  for (let i = 1; i < seq.length; i++) steps.push(seq[i]! - seq[i - 1]!);
  const stepMean = steps.reduce((s, x) => s + x, 0) / steps.length;
  const stepVar =
    steps.reduce((s, x) => s + (x - stepMean) ** 2, 0) / steps.length;
  const scale = Math.max(Math.abs(stepMean), spot * 0.02);
  return stepVar < (scale * 0.15) ** 2;
}

export function buildForecastPlanPrompt(input: {
  portfolioName: string;
  cashBalance: number;
  forecast: ForecastModel;
  /** The owner's own per-ticker conviction level and written thesis. This
   * is where a personal view belongs (the engine itself stays generic and
   * ticker-agnostic), so it's passed through and weighted explicitly. */
  convictions?: Record<string, { level: number; thesis: string }>;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  const nextQuarter =
    quarter === 4
      ? { q: 1, y: year + 1 }
      : { q: quarter + 1, y: year };

  const lines = input.forecast.rows.map((r) => {
    const sector =
      TICKER_SECTORS[r.ticker] ??
      TICKER_SECTORS[r.ticker.split(".")[0]!] ??
      "unclassified";
    const theme = forecastThemeForTicker(r.ticker);
    const weightPct =
      input.forecast.currentTotal > 0
        ? ((r.currentValue / input.forecast.currentTotal) * 100).toFixed(1)
        : "0";
    const conv =
      input.convictions?.[r.ticker] ??
      input.convictions?.[r.ticker.split(".")[0]!.toUpperCase()];
    const convBit = conv
      ? `, HOW SURE THEY ARE=${conv.level}/5${conv.thesis?.trim() ? `, why they own it: "${conv.thesis.trim().slice(0, 400)}"` : ""}`
      : "";
    return `${r.ticker} [${sector} · theme=${theme}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, weight=${weightPct}% of portfolio, covered=${r.hasTargets ? "yes" : "NEED FULL PATH"}${convBit}`;
  });

  const anyConviction = lines.some((l) => l.includes("HOW SURE THEY ARE"));
  const convictionGuidance = anyConviction
    ? `
HOW SURE THEY ARE: some holdings carry the owner's own 1-5 score and a written reason they own it. Treat a high score plus a real writeup as a serious input, not decoration: if the owner has said why a name is a long-term compounder, reason their argument through properly and let the path reflect it where the argument holds up. You are allowed to disagree, but if you land materially below their view you must say why in one plain sentence in that ticker's rationale, naming the specific thing you think they are underweighting. A 5/5 with a real writeup should not quietly get an average path.
`
    : "";

  const yearsList = FORECAST_YEARS.join(", ");

  return `${MARGUS_PERSONA}

${FORECAST_CONVICTION_PROMPT}

Build an actionable trim/add + theme plan AND a full EOY stock-price prognosis for Upside Lab portfolio "${input.portfolioName}".

CRITICAL: Reason every price from why that company exists and the anchoring above. Do NOT paste sell-side targets. Do NOT draw straight lines. Never leave a ticker or year empty. Never paste the same spot across all years unless cash-like (say so).

Today (Europe/Tallinn): ${todayKeyInTz()} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

${stanceGuidance()}
${convictionGuidance}
Cash: ${input.cashBalance}
Current portfolio value (equity+cash): ${input.forecast.currentTotal.toFixed(0)}

Holdings (share counts stay fixed unless a modeled mix observation names a different weight):
${lines.length ? lines.join("\n") : "(no holdings)"}

${insightsPromptBlock(
    input.forecast.rows.map((r) => ({
      ticker: r.ticker,
      value: r.currentValue,
    }))
  )}

Requirements:
1. periods MUST include:
   - Next quarter (label like "Next quarter (Q${nextQuarter.q} ${nextQuarter.y})")
   - Next year (label "${year + 1}" or "Next year (${year + 1})")
   - Then 2-3 longer horizons aligned to the EOY path (e.g. 2028, 2029, 2030) if useful. Not more than 6 total.
2. Themes should be memorable but practical (not marketing fluff).
3. Add and Trim are SEPARATE bullet lists of modeled mix observations. Semicolon-separated. ONE name or group per item, never two tickers packed with a slash.
   - Reference each name's CURRENT weight (given above) and state the modeled weight: a target weight (e.g. "modeled weight $RKLB from 14% to about 9% if X", "modeled weight of software about 3-5% of the portfolio"), never an order to buy or sell.
   - Ground the "why" in something specific and falsifiable for THAT company (a metric, a date, or an event with rough timing). Never a generic sector vibe that could be pasted onto any ticker in the theme.
   - Name the condition when the modeled weight would apply: a price, an earnings date, a number that just came out. So it reads as a scenario, not a headline.
   - Each item: "TICKER (current% -> target%): specific why + condition". Groups: "data-center power (~0% to 5%): why + size". Tickers already in the portfolio preferred; NEW tickers and sectors are welcome when describing a modeled mix, not as a shopping list.
   - Plain English only. Never say sleeve, marks, conviction, digestion, beta, or rotation. Thesis is fine.
   - If the modeled mix is unchanged: "No mix change" (never leave blank)
   - Never use em dashes or en-dash clause breaks in add/trim lines.
4. sectorRotation: talk through money moving between groups (AI computer builders, chip makers, data-center power, crypto, space, software, healthcare, drones, payments and finance, etc.). Chip makers and AI computer builders are different bets. Do not stay stuck in one box. Plain speech, no em dashes.
5. generalAdvice: sizing, concentration, cash, described as facts about the mix. 2-4 short spoken sentences in you/your. Sound like a note at a desk, not a generated briefing. Forbidden: em dashes, stacked jargon slogans, tidy wrap-up paragraphs, trade orders. Never we/us/our.
6. eoyTargets: REQUIRED for EVERY ticker listed above. Use the exact ticker strings (keep ".AS", ".L", ".DE", etc.).
   - Provide a positive price for EACH of years ${yearsList}. All five required, no omissions.
   - Year ${year} is December 31 ${year}, not today's spot. Do not paste today's price into that cell.
   - NON-LINEAR only, unless the holding is genuinely steady (a broad index fund, a cash-like holding), in which case say so. Crypto-linked: include a deep drop year. Jumpy growth names: a quiet year somewhere in the middle.
   - rationale: one human sentence on why this company + how the path wiggles. FORBIDDEN words/phrases: overridden, rejected, too timid, portfolio-aligned, calibrated path. No em dashes. Never say sleeve, marks, conviction, digestion, beta, or rotation. Thesis is fine.
7. Consistency: if the reason you own the names is unchanged from a prior run, keep year-end prices in a similar neighborhood. Do not randomly reshuffle for no reason.
8. Do not invent fake share counts or claim trades already happened.
9. Be concise.
10. Frame everything as modeled prices, never a prediction, never a personalized recommendation, never a guarantee. Describe modeled weights, never orders. Never "trim $RKLB now" or "add software today". "A modeled mix: $RKLB from 14% to about 9% if X" is the shape.`;
}

export function planEoyPaths(
  plan: ForecastPlan
): { ticker: string; prices: Partial<Record<ForecastYear, number>> }[] {
  return (plan.eoyTargets ?? []).map((t) => ({
    ticker: t.ticker,
    prices: t.prices as Partial<Record<ForecastYear, number>>,
  }));
}
