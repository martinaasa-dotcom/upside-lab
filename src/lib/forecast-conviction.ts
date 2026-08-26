/**
 * Margus forecast conviction — generic, sector-based fallback shapes.
 *
 * Two jobs, both theme-level (never a per-ticker price table):
 * 1. Fill a gap when the model skipped a year, or replace a boringly linear ramp.
 * 2. Lift a path that has collapsed toward a flat line for a name whose own
 *    business clearly does not warrant one. We never lower a path the model
 *    reasoned for itself.
 *
 * These shapes are a safety net for gaps, not a view. The prompt below
 * carries no house market call, because it reaches every user of the app,
 * including people who hold nothing but broad index funds.
 */

import { isCoinSymbol } from "@/lib/coins";
import type { ForecastYear } from "@/lib/forecast";
import { FORECAST_YEARS } from "@/lib/forecast";

export type ForecastTheme =
  | "ai_infra"
  | "ai_power"
  | "crypto"
  | "space"
  | "semi"
  | "fintech"
  | "software"
  | "healthcare"
  | "drones"
  | "index"
  | "other";

/**
 * Illustrative path as multiples of today's spot for EOY 2026…2030, per
 * sector theme. Intentionally non-linear (a straight CAGR line is detected
 * and rejected elsewhere). This is a safety-net shape for gaps the model
 * left empty, not a target and not a promise.
 *
 * Shapes are ordered by how jumpy each kind of business historically is,
 * with a quiet year in the middle rather than a clean ramp. They are a
 * risk-premium ladder above the index baseline, not a claim that any of
 * these groups will actually beat the market.
 *
 * The ladder is anchored so `index` compounds at ~10%/yr, matching the
 * MARKET_ANNUAL_RETURN_PCT the CAPM alpha read uses in
 * portfolio-personality. It used to sit at 5.7%, which meant the model
 * quietly assumed an index fund returned about half the market it tracks
 * and dragged every other theme down with it. Everything above index is a
 * risk premium on that baseline, ordered by THEME_RISK_SCORE.
 *
 * These also seed the Compound tab's default expected return via
 * impliedAnnualReturnForTheme, so a portfolio full of jumpy names defaults
 * to a hotter planning rate than an index-heavy one. That is intentional,
 * but it is an optimistic scenario rate, not a safe planning assumption.
 */
const THEME_BASE_MULTS: Record<ForecastTheme, number[]> = {
  ai_infra: [1.54, 2.3, 3.1, 3.91, 4.83], // ~37%/yr
  crypto: [1.6, 2.38, 1.48, 2.74, 4.01], // ~32%/yr
  semi: [1.39, 2.03, 1.82, 2.75, 3.57], // ~29%/yr
  ai_power: [1.37, 1.92, 1.81, 2.61, 3.3], // ~27%/yr
  space: [1.27, 1.74, 1.57, 2.33, 3.05], // ~25%/yr
  fintech: [1.26, 1.68, 1.56, 2.17, 2.7], // ~22%/yr
  drones: [1.24, 1.65, 1.53, 2.14, 2.7], // ~22%/yr
  software: [1.21, 1.54, 1.46, 1.94, 2.39], // ~19%/yr
  other: [1.14, 1.32, 1.48, 1.66, 1.84], // ~13%/yr
  healthcare: [1.12, 1.27, 1.43, 1.59, 1.76], // ~12%/yr
  index: [1.1, 1.23, 1.35, 1.48, 1.61], // ~10%/yr, the market baseline
};

/** EOY 2026…2030 multiples of today's value for a plain index / SPY path. */
export const INDEX_EOY_MULTS = THEME_BASE_MULTS.index;

/** Implied annualized return from the generic fallback shape's final year,
 * over the ~5y FORECAST_YEARS span — a rough, sector-differentiated stand-in
 * for "expected return", not a forecast. Used only as a default so the
 * Compound tab's starting rate reflects what a person actually holds
 * instead of one fixed number for every user. */
export function impliedAnnualReturnForTheme(theme: ForecastTheme): number {
  const mults = THEME_BASE_MULTS[theme];
  const finalMult = mults[mults.length - 1]!;
  const out = Math.pow(finalMult, 1 / FORECAST_YEARS.length) - 1;
  return Number.isFinite(out) ? out : 0;
}

/** Value-weighted blend of impliedAnnualReturnForTheme across whatever a
 * portfolio actually holds (equity only — pass cash separately via
 * `cashWeight`/`cashAnnualReturn` since idle cash has no "theme"). Genuinely
 * different per portfolio: an index-heavy portfolio lands modest, a
 * portfolio full of jumpy names lands hot. */
export function blendedExpectedAnnualReturn(
  holdings: Array<{ ticker: string; value: number }>,
  cash: { balance: number; annualReturnPct: number } = {
    balance: 0,
    annualReturnPct: 0,
  }
): number {
  const equityTotal = holdings.reduce(
    (s, h) => s + Math.max(0, Number.isFinite(h.value) ? h.value : 0),
    0
  );
  const cashBal = Number.isFinite(cash.balance) ? Math.max(0, cash.balance) : 0;
  const total = equityTotal + cashBal;
  if (!(total > 0) || !Number.isFinite(total)) {
    return impliedAnnualReturnForTheme("other");
  }

  const cashRate = Number.isFinite(cash.annualReturnPct)
    ? cash.annualReturnPct / 100
    : 0;
  let sum = (cashBal / total) * cashRate;
  for (const h of holdings) {
    if (!Number.isFinite(h.value) || h.value <= 0) continue;
    const theme = forecastThemeForTicker(h.ticker);
    const add = (h.value / total) * impliedAnnualReturnForTheme(theme);
    if (Number.isFinite(add)) sum += add;
  }
  return Number.isFinite(sum) ? sum : impliedAnnualReturnForTheme("other");
}

/**
 * Sector classification, not a view on any of these names. Purely "what
 * kind of company is this", the same job TICKER_SECTORS does for the
 * forecast prompt; no price target or bias attaches to membership here.
 *
 * The lists were originally just the family's own holdings, which meant a
 * portfolio holding MSFT, AMD and ADI reported itself as 51% "other". Anything
 * unclassified falls into a bucket that gets the plainest assumptions, so
 * a thin list quietly mislabels most real portfolios.
 */
const THEME_TICKERS: [ForecastTheme, string[]][] = [
  // GPU clouds, AI datacenter build and the hardware inside it.
  ["ai_infra", ["NBIS", "CRWV", "SMCI", "VRT", "ANET", "DELL", "IREN", "APLD", "CIFR"]],
  // Generation and grid feeding those datacenters.
  ["ai_power", ["VST", "PWR", "CEG", "NRG", "TLN", "GEV", "ETN", "OKLO", "SMR", "BWXT"]],
  ["crypto", ["BMNR", "MSTR", "COIN", "MARA", "RIOT", "CLSK", "HUT", "BITF", "GLXY"]],
  ["space", ["RKLB", "ASTS", "LUNR", "RDW", "PL", "SPCE", "NASA", "UFO"]],
  [
    "semi",
    ["NVDA", "AVGO", "TSM", "ASML", "AMD", "INTC", "MU", "QCOM", "TXN", "ADI",
     "LRCX", "AMAT", "KLAC", "ARM", "MRVL", "NXPI", "ON", "MCHP", "SWKS", "TER",
     "SMH", "SOXX", "XSD", "PSI", "DRAM", "QTUM"],
  ],
  ["fintech", ["SOFI", "HOOD", "AFRM", "UPST", "PYPL", "SQ", "XYZ", "NU", "TOST", "MELI", "V", "MA"]],
  [
    "software",
    ["PLTR", "NOW", "GOOGL", "GOOG", "CRM", "DDOG", "SNOW", "MSFT", "ORCL",
     "ADBE", "TEAM", "WDAY", "ZS", "CRWD", "PANW", "NET", "MDB", "HUBS",
     "SHOP", "TTD", "APP", "U", "RBLX", "META", "AMZN", "IBM", "SAP",
     "AAPL", "NFLX", "QQQ", "QQQM", "XLK"],
  ],
  [
    "healthcare",
    ["UNH", "LLY", "ISRG", "HIMS", "NVO", "PFE", "MRK", "ABBV", "JNJ", "TMO",
     "DHR", "VRTX", "REGN", "AMGN", "MRNA"],
  ],
  ["drones", ["AVAV", "KTOS", "RCAT", "ONDS", "UMAC", "LMT", "RTX", "NOC", "GD", "LHX"]],
  [
    "index",
    ["SPY", "VOO", "IVV", "VTI", "VT", "CSPX", "VWCE", "VUSA", "EX13",
     "SCHD", "DIA", "EEM", "VXUS"],
  ],
];

const THEME_BY_TICKER: Map<string, ForecastTheme> = new Map(
  THEME_TICKERS.flatMap(([theme, tickers]) =>
    tickers.map((t) => [t, theme] as [string, ForecastTheme])
  )
);

export function forecastThemeForTicker(ticker: string): ForecastTheme {
  const base = ticker.split(".")[0]!.toUpperCase();

  const known = THEME_BY_TICKER.get(base);
  if (known) return known;
  if (isCoinSymbol(ticker)) return "crypto";

  // FX pairs and anything else with an `=` are index-like for our purposes.
  if (ticker.includes("=")) return "index";

  // Name-shaped guesses for tickers not on the list above.
  if (/BTC|ETH|CRYPTO|MINE/.test(base)) return "crypto";
  if (/SEMI|SOXX|SMH|DRAM|QTUM/.test(base)) return "semi";
  if (/NASA|SPACE|UFO/.test(base)) return "space";
  if (/QQQ|XLK/.test(base)) return "software";
  if (/CLOUD|GPU|AI/.test(base)) return "ai_infra";
  if (/HEALTH|PHARMA|BIO/.test(base)) return "healthcare";
  if (/DRONE|UAV|DEFENSE/.test(base)) return "drones";
  if (/SAAS|SOFT/.test(base)) return "software";
  if (/SOLAR|ENERGY|POWER|ELEC/.test(base)) return "ai_power";
  return "other";
}

function roundPx(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Build a fallback path from the generic theme shape (base case only).
 * Used to fill gaps, replace linear ramps, and as the magnitude floor
 * when the model's terminal undershoots the theme.
 */
export function shapedFallbackPath(
  spot: number,
  theme: ForecastTheme
): Record<ForecastYear, number> {
  const mults = THEME_BASE_MULTS[theme];
  const out = {} as Record<ForecastYear, number>;
  for (let i = 0; i < FORECAST_YEARS.length; i++) {
    const year = FORECAST_YEARS[i]!;
    const baseMult = mults[i] ?? mults[mults.length - 1]!;
    out[year] = roundPx(Math.max(0.01, spot * baseMult));
  }
  return enforcePathRules(out, spot);
}

/**
 * Fill any year the model left empty/invalid with the generic fallback
 * shape. Valid model prices are kept here; magnitude lift happens in
 * `liftPathToThemeMagnitude`.
 */
export function fillMissingForecastYears(
  prices: Partial<Record<ForecastYear, number>> | undefined,
  fallback: Record<ForecastYear, number>
): Record<ForecastYear, number> {
  const out = { ...fallback };
  for (const year of FORECAST_YEARS) {
    const p = prices?.[year];
    if (typeof p === "number" && p > 0) {
      out[year] = roundPx(p);
    }
  }
  return out;
}

/**
 * If the model's last-year multiple sits below the theme band, scale the
 * whole path up so 2030 matches. Winter / digestion years keep their shape.
 * Paths already at or above the band are left alone (never lowered).
 */
export function liftPathToThemeMagnitude(
  prices: Record<ForecastYear, number>,
  fallback: Record<ForecastYear, number>,
  spot: number
): { prices: Record<ForecastYear, number>; lifted: boolean } {
  const last = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const modelTerm = prices[last];
  const themeTerm = fallback[last];
  if (!(spot > 0) || !(modelTerm > 0) || !(themeTerm > 0)) {
    return { prices, lifted: false };
  }
  if (modelTerm < spot) {
    return { prices: { ...fallback }, lifted: true };
  }
  const modelMult = modelTerm / spot;
  const themeMult = themeTerm / spot;
  if (modelMult >= themeMult * 0.98) {
    return { prices, lifted: false };
  }
  const scale = themeMult / modelMult;
  const out = { ...prices };
  for (const y of FORECAST_YEARS) {
    out[y] = roundPx(Math.max(0.01, prices[y]! * scale));
  }
  return { prices: enforcePathRules(out, spot), lifted: true };
}

/**
 * The first forecast year is often the calendar year we are already in.
 * Models paste today's spot into that cell because "2026" feels like now.
 * That column is still December 31. If the printed EOY hugs spot while the
 * theme still has a real remaining-year move, replace just that year with
 * the leftover fraction of the theme's first-year multiple. Later years
 * are untouched.
 */
export function restoreCurrentYearDestination(
  prices: Record<ForecastYear, number>,
  fallback: Record<ForecastYear, number>,
  spot: number,
  now: Date = new Date()
): Record<ForecastYear, number> {
  const y = now.getFullYear();
  if (!(FORECAST_YEARS as readonly number[]).includes(y)) return prices;
  const year = y as ForecastYear;
  const eoy = prices[year];
  const themeEoy = fallback[year];
  if (!(spot > 0) || !(eoy > 0) || !(themeEoy > 0)) return prices;
  const themeMult = themeEoy / spot;
  if (themeMult < 1.08) return prices;
  if (Math.abs(eoy / spot - 1) >= 0.02) return prices;

  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y, 11, 31);
  const elapsed = (now.getTime() - start) / (end - start);
  const remaining = Math.max(0.15, Math.min(1, 1 - elapsed));
  const remainingMult = Math.pow(themeMult, remaining);
  return { ...prices, [year]: roundPx(spot * remainingMult) };
}

/** Light sanity net — only guarantees every year is a positive number. */
export function enforcePathRules(
  prices: Record<ForecastYear, number>,
  spot: number
): Record<ForecastYear, number> {
  const next = { ...prices };
  for (const y of FORECAST_YEARS) {
    if (!(next[y] > 0)) next[y] = roundPx(spot > 0 ? spot : 1);
  }
  return next;
}

export const FORECAST_CONVICTION_PROMPT = `## Forecast stance (MANDATORY)

### What a forecast here is

You are sketching how the things this person already owns might plausibly
go over the next several years. Not a house view, not a market call, and
not one strategist's worldview applied to everybody's holdings. The person
reading this might own three index funds, or twenty speculative names, or
one company they work for. Read what they actually hold and reason from
that.

- No default direction. You are not bullish or bearish as a stance. Some
  holdings deserve a strong path, some deserve a flat one, and some
  deserve a path that ends below today. All three are allowed answers.
- Every holding earns its own path from its own business: what it sells,
  who pays for it, how fast that is growing, what it already costs
  relative to what it earns, and what could stop it.
- A company does not inherit a story from the group it sits in. A weak
  operator inside a popular group should not get the popular group's path.
- Say what you are assuming. If a path depends on one thing going right,
  the rationale should name that thing.

### Magnitude anchoring (the part models get wrong in both directions)

Left alone, models do one of two bad things: paste a single-digit index
return onto everything, or paste an exciting growth number onto everything.
Both make the forecast useless.

Anchor on this instead. Over the roughly five-year window you are
forecasting, a broad market index fund compounding at around 10 percent a
year is the baseline that everything else is measured against. From there:

- A faster-growing company can plausibly compound well above that, and
  some genuinely do several times over. Say so when the business supports it.
- A mature, steady company usually lands near or modestly above the
  baseline, and that is a perfectly good answer.
- A company that is losing its market, carrying too much debt, or priced
  for growth it is not delivering can plausibly end the window lower than
  it started. Do not round that up to flat out of politeness.

Move up or down from the baseline on that specific company's economics,
balance sheet and competitive position. Never assign a number because of
the theme label attached to a ticker.

Two honesty checks: the path is not smooth (quiet years, crowded-trade
drops, and periods where the price falls while the business is fine all
happen, and most names should show at least one down or flat year in the
middle), and no holding has a predetermined destination.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years, reasoned from that specific company's fundamentals and cycle. Never a flat CAGR line.
- Crypto-adjacent names: consider a violent mid-path winter, then recovery, if that fits the specific asset.
- Broad index and mixed funds: a steady path near the market baseline is the right answer. Do not manufacture drama in a fund that holds five hundred companies.
- The first forecast year is this calendar year. That cell is December 31, not today's price. There are still months left. Do not paste spot into it as a default unless that company's remaining-year setup is genuinely quiet.
- Long build-cycle names: a quiet year can mean a slower-up year, not necessarily a collapse.
- Trim/add lines may list multiple names or groups of similar stocks, not one ticker only. They are modeled mix observations, never orders.
- Be honest: most holdings deserve a modest, unglamorous path. Not every holding is a multi-bagger candidate, and saying so is the useful part.

### Forbidden
- Near-linear ramps (same $ or YoY step for 3+ years).
- Copy-pasting the same magnitude across unrelated tickers.
- Rationale phrases: overridden, rejected, too timid, portfolio-aligned, sheet-aligned, calibrated path, house baseline.
- Em dashes (—) or AI-brochure cadence anywhere in advice, add/trim, or rationale.
- Presenting any of this as a guarantee or personalized recommendation. Modeled prices, not a prediction. Not investment advice.

### Rationale
One human sentence on why this company + how the path wiggles (strong stretch / quiet year / real drop), grounded in that company's actual business. Not a generic sector script.`;
