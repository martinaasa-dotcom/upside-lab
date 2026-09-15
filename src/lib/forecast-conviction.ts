/**
 * Margus forecast conviction: the SHAPE of a path, and the prompt behind it.
 *
 * This file used to hold two things that have been separated, because they
 * are two different kinds of claim and conflating them is what made the
 * old table impossible to reason about.
 *
 * - **How fast a holding is assumed to compound** is a claim about return.
 *   It lives in `forecast-growth.ts`, per sector and per name, with a
 *   sentence and a date against every entry.
 * - **What five years look like on the way there** is a claim about timing:
 *   fast stretches, quiet years, and real drops in the middle. That is
 *   `THEME_RHYTHM` below, and it carries no magnitude at all.
 *
 * The multiples the rest of the app reads are derived from the two, so a
 * rate can be argued with in one place and a rhythm in another, and neither
 * can be changed by accident while editing the other.
 */

import { FORECAST_YEARS } from "@/lib/forecast";
import type { ForecastYear } from "@/lib/forecast";
import {
  growthAnchorFor,
  growthYears,
  sectorTerminalMultiple,
  type ForecastTheme,
} from "@/lib/forecast-growth";

export {
  forecastThemeForTicker,
  growthAnchorFor,
  type ForecastTheme,
} from "@/lib/forecast-growth";

/**
 * What fraction of a path's total move is done by each year.
 *
 * Pure timing. The last entry is always 1, so the rhythm cannot change
 * where a path ends however it is edited, which is the property that keeps
 * this file out of the magnitude argument entirely.
 *
 * Every rhythm except `index` dips in the middle, and that is the whole
 * point of having one: a share price does not rise by the same amount five
 * years running, and a path that does is the single clearest sign nobody
 * reasoned about it. `crypto` dips hardest because that is what those
 * assets actually do. `index` is smooth because a fund holding hundreds of
 * companies has no drama to manufacture, and it is the one theme the
 * re-timing never touches.
 *
 * When this table was split out of the old typed multiples it reproduced
 * every one of them to within 0.18%, so the refactor moved no drawn path
 * by itself. The quiet year was then moved deliberately, which is the one
 * change to timing since, and it is described under the table.
 */
const THEME_RHYTHM: Record<ForecastTheme, number[]> = {
  ai_infra: [0.274, 0.545, 0.795, 0.697, 1],
  crypto: [0.339, 0.625, 0.831, 0.489, 1],
  semi: [0.259, 0.556, 0.8, 0.715, 1],
  ai_power: [0.264, 0.546, 0.796, 0.746, 1],
  space: [0.214, 0.497, 0.774, 0.681, 1],
  fintech: [0.233, 0.522, 0.785, 0.711, 1],
  drones: [0.217, 0.504, 0.777, 0.701, 1],
  software: [0.218, 0.495, 0.773, 0.713, 1],
  healthcare: [0.201, 0.436, 0.746, 0.705, 1],
  other: [0.2, 0.469, 0.761, 0.692, 1],
  index: [0.2, 0.435, 0.63, 0.823, 1],
};

/**
 * Where the quiet year sits, and why it moved.
 *
 * It used to be the third entry. It is the fourth as of 2026-09-14,
 * because the timing view this app holds is that the spending behind the
 * build runs hard for roughly another two years before anything slows:
 * capacity is contracted well ahead of delivery, so the orders covering
 * the near years are largely already placed, and the point at which that
 * stops being true is further out than the next one. So the first three
 * entries climb and the fourth gives some back.
 *
 * **This is positional, not calendar.** `FORECAST_YEARS` rolls every
 * January, so the quiet year is "the fourth year of whatever window is
 * being drawn" rather than a fixed date, and it walks forward with the
 * window. That is the existing behaviour of this table rather than
 * something introduced here, and it is the right default for a shape: a
 * rhythm is about how a build cycle runs, not about a year somebody
 * named. If a fixed calendar year is ever wanted, it needs a real date in
 * `forecast-growth.ts` and not an index here.
 */

export function rhythmFor(theme: ForecastTheme): number[] {
  return THEME_RHYTHM[theme] ?? THEME_RHYTHM.other;
}

/**
 * Turn a terminal multiple into one multiple per year, on a theme's rhythm.
 *
 * Log space, because a price compounds rather than adds: a weight of 0.5
 * means half the total move in log terms, which is the square root of the
 * multiple, not half of it.
 */
function multsFor(theme: ForecastTheme, terminalMultiple: number): number[] {
  const rhythm = rhythmFor(theme);
  if (!(terminalMultiple > 0)) return rhythm.map(() => 1);
  const total = Math.log(terminalMultiple);
  return rhythm.map((w) => Math.exp(w * total));
}

/** Implied annualized return for a kind of business, straight off the
 * growth model's sector ladder. Used as a default so the Compound tab's
 * starting rate reflects what a person actually holds instead of one fixed
 * number for every user. */
export function impliedAnnualReturnForTheme(theme: ForecastTheme): number {
  const out = Math.pow(sectorTerminalMultiple(theme), 1 / growthYears()) - 1;
  return Number.isFinite(out) ? out : 0;
}

/** The same question for one named holding, which is finer: a name with a
 * view of its own on file answers with that rather than with its sector. */
export function impliedAnnualReturnForTicker(ticker: string): number {
  const out = growthAnchorFor(ticker).cagr;
  return Number.isFinite(out) ? out : 0;
}

/** Value-weighted blend across whatever a portfolio actually holds (equity
 * only: pass cash separately via `cash`, since idle cash has no theme).
 * Genuinely different per portfolio, and now per holding, so two portfolios
 * of the same sector mix can still differ. */
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
    const add = (h.value / total) * impliedAnnualReturnForTicker(h.ticker);
    if (Number.isFinite(add)) sum += add;
  }
  return Number.isFinite(sum) ? sum : impliedAnnualReturnForTheme("other");
}

/** Sector-level multiples, kept for callers that have a kind of business
 * and no particular name. Derived, never typed. */
export function themeBaseMults(theme: ForecastTheme): number[] {
  return multsFor(theme, sectorTerminalMultiple(theme));
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
  return pathFromMults(spot, themeBaseMults(theme));
}

/**
 * The same shape for a named holding, which is what every caller that has
 * a ticker should use: it picks up the per-name rate where one is on file
 * and falls back to the sector where it is not.
 */
export function shapedPathForTicker(
  spot: number,
  ticker: string
): Record<ForecastYear, number> {
  const anchor = growthAnchorFor(ticker);
  return pathFromMults(
    spot,
    multsFor(anchor.sector, anchor.terminalMultiple)
  );
}

function pathFromMults(
  spot: number,
  mults: number[]
): Record<ForecastYear, number> {
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
 * shape. Every valid model price is kept exactly as written: this closes
 * gaps and never moves a number the model did supply.
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
/**
 * Re-time a path onto the theme's rhythm without touching where it ends.
 *
 * This is what is left of the reshaping once the magnitude floor is gone,
 * and the split is the whole point: the theme table knows what a plausible
 * five years *looks* like for a kind of business (a fast stretch, a quiet
 * year, sometimes a real drop in the middle), and the model knows where
 * this particular company is going. Taking the shape from one and the
 * destination from the other keeps the anti-straight-line rule without
 * putting the app's opinion back into the number.
 *
 * The arithmetic is a log interpolation. `w` is the fraction of the theme's
 * total move completed by that year, so the output lands exactly on the
 * model's own final multiple no matter what that multiple is. A destination
 * below today's price is simply a negative log move spread over the same
 * rhythm, which is how a declining path comes out declining rather than
 * being quietly turned around.
 */
export function reshapeToThemeRhythm(
  prices: Record<ForecastYear, number>,
  shaped: Record<ForecastYear, number>,
  spot: number
): Record<ForecastYear, number> {
  const last = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const target = prices[last];
  const shapedTerm = shaped[last];
  if (!(spot > 0) || !(target > 0) || !(shapedTerm > 0)) return prices;

  const totalShapeMove = Math.log(shapedTerm / spot);
  // A theme whose five years go nowhere has no rhythm to lend.
  if (!Number.isFinite(totalShapeMove) || Math.abs(totalShapeMove) < 1e-9) {
    return prices;
  }
  const totalMove = Math.log(target / spot);
  if (!Number.isFinite(totalMove)) return prices;

  const out = { ...prices };
  for (const y of FORECAST_YEARS) {
    const step = shaped[y];
    if (!(step > 0)) continue;
    const w = Math.log(step / spot) / totalShapeMove;
    if (!Number.isFinite(w)) continue;
    out[y] = roundPx(Math.max(0.01, spot * Math.exp(w * totalMove)));
  }
  out[last] = roundPx(Math.max(0.01, target));
  return enforcePathRules(out, spot);
}


/**
 * Does this path only ever step by the same amount?
 *
 * The one test both surfaces use, and it lives here beside the reshaper
 * because the pair is meaningless apart: re-timing is allowed only on a
 * path that has no timing of its own. It was a private function in
 * forecast-plan.ts, which is how the research room came to reshape every
 * path it was ever given, including the ones the model had already given
 * a rhythm to.
 */
export function isNearLinearPath(
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
  const variance = yoy.reduce((s, x) => s + (x - mean) ** 2, 0) / yoy.length;
  // Nearly identical YoY each year, which is a straight CAGR line.
  if (variance < 0.0008 && Math.abs(mean) < 0.35) return true;
  // Nearly equal dollar steps.
  const steps: number[] = [];
  for (let i = 1; i < seq.length; i++) steps.push(seq[i]! - seq[i - 1]!);
  const stepMean = steps.reduce((s, x) => s + x, 0) / steps.length;
  const stepVar =
    steps.reduce((s, x) => s + (x - stepMean) ** 2, 0) / steps.length;
  const scale = Math.max(Math.abs(stepMean), spot * 0.02);
  return stepVar < (scale * 0.15) ** 2;
}

/**
 * Raise a path to this app's own growth assumption for that holding.
 *
 * ## What it does
 *
 * `growthAnchorFor` says what this app assumes the name compounds at. If
 * the model's own last year already sits at or above that, the model's
 * number stands: this never caps a path, only lifts one. Otherwise the
 * path is rescaled in log space to land on the assumption, **keeping the
 * model's own rhythm** rather than substituting a theme's, so the quiet
 * years and the drops the model reasoned about survive the lift.
 *
 * ## The shape it refuses to borrow
 *
 * Two cases have no usable rhythm of their own and fall back to the
 * theme's. A path that goes nowhere has no shape to stretch. And a path
 * that points the *other way* from the anchor must not be reused, because
 * rescaling a negative total move onto a positive one turns every dip into
 * a peak: the shape would be inverted, and the reader would be shown a
 * mirror image of the model's reasoning, which is worse than showing them
 * a generic one. That case is exactly the old `liftPathToThemeMagnitude`
 * bug and it is handled rather than reintroduced.
 *
 * ## Why this exists at all
 *
 * It is the same mechanism removed on 2026-08-28, rebuilt on purpose on
 * 2026-09-14. What is different is the part that made the old one
 * indefensible. The old one lifted to a bare per-theme constant, so every
 * company in a group got an identical multiple; this one reads a rate that
 * is per name where a name has been looked at, with a sentence and a date
 * behind it in `forecast-growth.ts`. And the old one was silent: the
 * provenance panel described the path as the model's reasoning while the
 * number was the app's. This one is reported through
 * `ForecastPathAdjustment.anchored` and said out loud on the card.
 */
export function anchorPathToGrowth(
  prices: Record<ForecastYear, number>,
  spot: number,
  ticker: string
): { prices: Record<ForecastYear, number>; anchored: boolean } {
  const last = FORECAST_YEARS[FORECAST_YEARS.length - 1]!;
  const modelTerm = prices[last];
  if (!(spot > 0) || !(modelTerm > 0)) return { prices, anchored: false };

  const anchor = growthAnchorFor(ticker);
  const target = spot * anchor.terminalMultiple;
  if (!(target > 0)) return { prices, anchored: false };

  // Already there or past it. The model's own number wins, uncapped.
  if (modelTerm >= target * 0.999) return { prices, anchored: false };

  const totalTarget = Math.log(target / spot);
  const totalModel = Math.log(modelTerm / spot);
  const usableOwnShape =
    Number.isFinite(totalModel) &&
    Math.abs(totalModel) > 1e-9 &&
    Math.sign(totalModel) === Math.sign(totalTarget);

  const out = { ...prices };
  if (usableOwnShape) {
    for (const y of FORECAST_YEARS) {
      const p = prices[y];
      if (!(p > 0)) continue;
      const w = Math.log(p / spot) / totalModel;
      if (!Number.isFinite(w)) continue;
      out[y] = roundPx(Math.max(0.01, spot * Math.exp(w * totalTarget)));
    }
  } else {
    const rhythm = rhythmFor(anchor.sector);
    for (let i = 0; i < FORECAST_YEARS.length; i++) {
      const y = FORECAST_YEARS[i]!;
      const w = rhythm[i] ?? 1;
      out[y] = roundPx(Math.max(0.01, spot * Math.exp(w * totalTarget)));
    }
  }
  out[last] = roundPx(target);
  return { prices: enforcePathRules(out, spot), anchored: true };
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

### The build this window sits inside

Read the next five years as a period in which the spending behind AI
continues rather than stalls: datacenter capacity is being committed years
before it is built, the chips and the electricity to run it are the
binding constraints rather than the demand, and the software layer on top
is still early in being adopted. Companies genuinely supplying that build,
or genuinely using it to sell more of what they already sell, should show
it in their numbers. That is a reading of what the spending is doing now,
not a promise, so ground it in the specific company every time: what it
sells into the build, who is paying, and what it already earns.

It does not mean a straight climb, and saying so is the useful part. A
stretch of real weakness inside the window is entirely consistent with
this, and is what the shape rules below are for: a year when a lot of
people sell at once, a digestion year after a heavy build, a company whose
capacity arrives before its customers do. Put that in where the company's
own position argues for it rather than as decoration.

Two honesty checks: the path is not smooth (quiet years, drops that come
when a lot of people sell at once, and stretches where the price falls
while the business is fine all happen, and most holdings should show at
least one down or flat year in the middle), and no holding has a
predetermined destination.

### Required dynamics
- Non-linear paths: bull runs and/or consolidation years, reasoned from that specific company's fundamentals and cycle. Never a flat CAGR line.
- Crypto-adjacent names: consider a violent mid-path winter, then recovery, if that fits the specific asset.
- Broad index and mixed funds: a steady path near the market baseline is the right answer. Do not manufacture drama in a fund that holds five hundred companies.
- The first forecast year is this calendar year. That cell is December 31, not today's price. There are still months left. Do not paste spot into it as a default unless that company's remaining-year setup is genuinely quiet.
- Long build-cycle names: a quiet year can mean a slower-up year, not necessarily a collapse.
- Trim/add lines may list multiple names or groups of similar stocks, not one ticker only. They are modeled mix observations, never orders.
- Be honest, in both directions. A company genuinely supplying or using the build should show it, and a company that only sits near the story should not get its numbers. The difference between those two is the most useful thing you can tell the reader, so make the rationale say which one this is and from what.

### Forbidden
- Near-linear ramps (same $ or YoY step for 3+ years).
- Copy-pasting the same magnitude across unrelated tickers.
- Rationale phrases: overridden, rejected, too timid, portfolio-aligned, sheet-aligned, calibrated path, house baseline.
- Em dashes (—) or AI-brochure cadence anywhere in advice, add/trim, or rationale.
- Presenting any of this as a guarantee or personalized recommendation. Modeled prices, not a prediction. Not investment advice.

### Rationale
One human sentence on why this company + how the path wiggles (strong stretch / quiet year / real drop), grounded in that company's actual business. Not a generic sector script.`;
