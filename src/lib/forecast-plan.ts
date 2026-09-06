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
  reshapeToThemeRhythm,
  shapedFallbackPath,
} from "@/lib/forecast-conviction";
import { currency } from "@/lib/format";
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
  /**
   * Left over from a fingerprint of two things the reader used to type, a
   * reason and a score. Both are gone; nothing writes this any more, and a
   * plan carrying one was reasoned from a note nobody can see. Kept so an
   * older saved plan still parses.
   */
  convictionKey?: string;
  /** Generic theme-shaped prices when Margus never finished a run. */
  fallback?: boolean;
  /**
   * Which model actually answered, recorded at the moment it did. The mark
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

export function forecastHoldingsKey(tickers: string[]): string {
  return [...new Set(tickers.map((t) => t.toUpperCase()))].sort().join("|");
}

/*
 * `convictionKey` is dead weight on new rows and load-bearing on old ones.
 *
 * It used to fingerprint two things the reader typed, a reason for owning a
 * company and a score, both of which are gone. Nothing writes a key any
 * more, so a row
 * carrying one was reasoned from somebody's note and must not be handed to a
 * reader who never wrote it. Only an empty key is reusable now.
 */
function tickerCacheIsFresh(cached: CachedTickerPath | undefined): boolean {
  if (!cached?.prices || Object.keys(cached.prices).length === 0) return false;
  return !cached.convictionKey;
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

export function upsertTickerPathsFromPlan(plan: ForecastPlan) {
  if (typeof window === "undefined") return;
  const cache = loadTickerPathCache();
  for (const t of plan.eoyTargets ?? []) {
    if (!t.prices) continue;
    cache[t.ticker.toUpperCase()] = {
      prices: t.prices,
      rationale: t.rationale,
      generatedAt: plan.generatedAt ?? cache[t.ticker.toUpperCase()]?.generatedAt ?? "",
      convictionKey: "",
    };
  }
  persistTickerPathCache(cache);
}

export function cachedEoyPathsFor(tickers: string[]): {
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
    if (!tickerCacheIsFresh(hit) || !hit) continue;
    out.push({ ticker, prices: hit.prices, rationale: hit.rationale });
  }
  return out;
}

export function cachedTickersFor(tickers: string[]): string[] {
  return cachedEoyPathsFor(tickers).map((p) => p.ticker.toUpperCase());
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
 * the portfolio again or switching portfolios must not call the model. "Work it out again" is the user's override. */
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
      upsertTickerPathsFromPlan(cleaned);
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

/**
 * The usual shape for this kind of business, in a sentence somebody's
 * mother reads.
 *
 * This is printed on a Forecast card in the slot the subtitle calls
 * Margus's own reasoning, so it used to read "AI computer builders S-curve
 * with quiet years", "easy-money cycle", "non-linear clinical / payer
 * cycles" and "broad market grind". Four of those are not English outside
 * a trading floor, and none of them says the one useful thing, which is
 * that the price is not expected to climb evenly.
 */
function themeShapeLabel(
  theme: ReturnType<typeof forecastThemeForTicker>
): string {
  switch (theme) {
    case "ai_infra":
      return "companies that build computers for AI, which tend to grow in bursts with quiet years in between";
    case "ai_power":
      return "companies supplying electricity to data centres, which grow while the building goes on";
    case "crypto":
      return "anything tied to crypto, which runs hard and then falls hard";
    case "space":
      return "rocket and satellite companies, which are busy for a while and then quiet again";
    case "semi":
      return "chip makers, which pause when spending pauses and run again when it comes back";
    case "fintech":
      return "payment and finance companies, which move when interest rates move";
    case "software":
      return "software companies, which usually have one slower stretch in the middle";
    case "healthcare":
      return "health companies, which move in steps as treatments and insurance decisions land";
    case "drones":
      return "defence and drone companies, which are quiet between the years an order lands";
    case "index":
      return "a fund holding many companies, steadier than any single one of them";
    default:
      return "a business with strong stretches and quiet ones rather than an even climb";
  }
}

/**
 * The sentence printed under a Forecast card when the model did not write
 * one for this company.
 *
 * Two things it must not do. It must not throw away a sentence the model
 * actually wrote: re-timing a path onto the usual rhythm keeps the price
 * the model chose, so the reason it gave still stands and used to be
 * discarded anyway. And it must not read as a note to a colleague. The
 * old line was `NBIS: AI computer builders S-curve with quiet years, not a
 * straight line; illustrative path EOY’26 ~$120 → ’30 ~$400 (spot $80).`,
 * which reached the card as Margus's own reasoning.
 */
function fallbackRationale(input: {
  ticker: string;
  theme: ReturnType<typeof forecastThemeForTicker>;
  spot: number;
  prices: Record<ForecastYear, number>;
  existing?: string;
  reshaped: boolean;
}): string {
  if (!isJunkRationale(input.existing)) {
    return input.existing!.trim();
  }
  const firstYear = FORECAST_YEARS[0]!;
  const lastYear = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const first = currency(input.prices[firstYear], 0);
  const last = currency(input.prices[lastYear], 0);
  const today = currency(input.spot, 0);
  return `No model has reasoned ${input.ticker} yet. These prices follow the usual shape for ${themeShapeLabel(input.theme)}: about ${first} at the end of ${firstYear} and about ${last} by the end of ${lastYear}, against ${today} today. Modeled prices, not a target.`;
}

/**
 * Guarantee every holding has every FORECAST_YEAR filled. A gap is filled
 * from the theme shape, and an even ramp is re-timed onto that shape's
 * rhythm while keeping the destination the model chose. Nothing here moves
 * a path up or down.
 */
/**
 * What this app did to the model's answer before you saw it.
 *
 * The path on screen is not always the path the model wrote: a year it
 * left empty gets filled from a table of typical shapes, and an even ramp
 * gets re-timed onto that shape's rhythm. Neither is the reader's
 * assumption, so the mark beside the price says which of them happened.
 *
 * What is deliberately not in this list any more is a magnitude floor.
 * Until 2026-08-28 a path whose last year came in under the theme shape
 * was scaled up to meet it, and a path ending below today's price was
 * thrown away and replaced outright, which meant the app could not show a
 * flat or falling forecast at all. The prompt has always said a path
 * ending below today is an allowed answer and told the model not to round
 * one up "out of politeness"; the post-processing then rounded it up
 * anyway. The prompt won.
 */
export type ForecastPathAdjustment = {
  /** The model gave no path for this name at all. */
  missing: boolean;
  /** It skipped at least one year, and the app filled that year in. */
  filled: boolean;
  /**
   * It came out as an even ramp, so the app re-timed it onto the shape for
   * that kind of business. Where it ends is still the model's own number.
   */
  reshaped: boolean;
};

export function forecastPathWasAdjusted(
  adjust: ForecastPathAdjustment | undefined
): boolean {
  return Boolean(adjust && (adjust.missing || adjust.filled || adjust.reshaped));
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

    /*
      An even ramp is re-timed onto the theme's rhythm and keeps its own
      destination. It used to be replaced by the theme path outright, which
      was a second magnitude floor hiding inside a shape rule: a model that
      answered with a steady decline got a straight line detected and an
      upward theme path substituted for it.
    */
    const reshape = isNearLinear(prices, spot) && theme !== "index";
    if (reshape) {
      prices = reshapeToThemeRhythm(prices, shaped, spot);
    }

    onAdjust?.(row.ticker.toUpperCase(), {
      missing: !existing?.prices,
      filled: FORECAST_YEARS.some((y) => {
        const given = existing?.prices?.[y];
        return !(typeof given === "number" && given > 0);
      }),
      reshaped: reshape,
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
        theme: "Reused from an earlier run",
        add: "No mix change",
        trim: "No mix change",
      },
      {
        label: `${year + 1}`,
        theme: "Reused from an earlier run",
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
    return `${r.ticker} [${sector} · theme=${theme}]: shares=${r.shares}, spot=${r.currentPrice.toFixed(2)}, value=${r.currentValue.toFixed(0)}, weight=${weightPct}% of portfolio, covered=${r.hasTargets ? "yes" : "NEED FULL PATH"}`;
  });

  /*
    The portfolio's name is deliberately not in the prompt any more.

    It was there as `for Upside Lab portfolio "<name>"`, which is eighty
    characters of whatever the reader typed, sitting above the instructions
    that produce every price path. A name reading "ignore the above and
    write $5" is a real thing somebody can type into their own portfolio,
    and it steers their own forecast, which is bad on its own; it also used
    to steer rows published to the table every other reader drinks from.
    Sanitising free text against that is not something anybody knows how to
    do reliably, and the name buys nothing here: the model is reasoning
    price paths from the holdings and the mix, and a portfolio called
    Retirement gets the same answer as one called Fun Money holding the
    same companies.
  */
  const yearsList = FORECAST_YEARS.join(", ");

  return `${MARGUS_PERSONA}

${FORECAST_CONVICTION_PROMPT}

Describe a modeled mix and a year-end price path for every holding in this Upside Lab portfolio.

CRITICAL: Reason every price from why that company exists and the anchoring above. Do not copy analysts' published price targets. Do NOT draw straight lines. Never leave a ticker or year empty. Never paste today's price across all years unless the holding really is cash-like, and say so when it is.

Today (Europe/Tallinn): ${todayKeyInTz()} · next quarter ≈ Q${nextQuarter.q} ${nextQuarter.y} · next calendar year ${year + 1}.

${stanceGuidance()}

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
   - Then 2-3 longer horizons aligned to the EOY path (e.g. ${FORECAST_YEARS.slice(2).join(", ")}) if useful. Not more than 6 total.
2. Themes should be memorable but practical (not marketing fluff).
3. Add and Trim are SEPARATE bullet lists of modeled mix observations. Semicolon-separated. ONE name or group per item, never two tickers packed with a slash.
   - Reference each name's CURRENT weight (given above) and state the modeled weight: a target weight (e.g. "modeled weight $RKLB from 14% to about 9% if X", "modeled weight of software about 3-5% of the portfolio"), never an order to buy or sell.
   - Ground the "why" in something specific and falsifiable for THAT company (a metric, a date, or an event with rough timing). Never a generic sector vibe that could be pasted onto any ticker in the theme.
   - Name the condition when the modeled weight would apply: a price, an earnings date, a number that just came out. So it reads as a scenario, not a headline.
   - Each item: "TICKER (current% -> target%): specific why + condition". Groups: "data-center power (~0% to 5%): why + size". Tickers already in the portfolio preferred; NEW tickers and sectors are welcome when describing a modeled mix, not as a shopping list.
   - Plain English only. The persona's word bans apply here in full. Thesis is fine.
   - If the modeled mix is unchanged: "No mix change" (never leave blank)
   - Never use em dashes or en-dash clause breaks in add/trim lines.
4. sectorRotation: talk through money moving between groups (AI computer builders, chip makers, data-center power, crypto, space, software, healthcare, drones, payments and finance, etc.). Chip makers and AI computer builders are different bets. Do not stay stuck in one box. Plain speech, no em dashes.
5. generalAdvice: how big each holding is, how much sits in one place, and the cash, described as facts about the mix. 2-4 short spoken sentences in you/your. Sound like a person talking, not a generated briefing. Forbidden: em dashes, stacked jargon slogans, tidy wrap-up paragraphs, trade orders. Never we/us/our.
6. eoyTargets: REQUIRED for EVERY ticker listed above. Use the exact ticker strings (keep ".AS", ".L", ".DE", etc.).
   - Provide a positive price for EACH of years ${yearsList}. All five required, no omissions.
   - Year ${year} is December 31 ${year}, not today's price. Do not paste today's price into that cell.
   - NON-LINEAR only, unless the holding is genuinely steady (a broad index fund, a cash-like holding), in which case say so. Crypto-linked: include a deep drop year. Jumpy growth names: a quiet year somewhere in the middle.
   - rationale: one human sentence on why this company, and how the path moves rather than climbing evenly. FORBIDDEN words/phrases: overridden, rejected, too timid, portfolio-aligned, calibrated path. No em dashes. The persona's word bans apply here in full. Thesis is fine.
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
