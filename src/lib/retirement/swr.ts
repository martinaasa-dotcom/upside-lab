/**
 * HOW MUCH OF A POT CAN BE SPENT EACH YEAR WITHOUT IT RUNNING OUT, AND THE
 * REASON THAT IS A DIFFERENT QUESTION FROM WHAT THE POT EARNS.
 *
 * The arithmetic answer is easy: if the pot earns four per cent after
 * inflation and you take four per cent, it lasts forever. That answer is
 * wrong, and the reason it is wrong is the one thing about retirement that
 * almost nobody is told.
 *
 * Returns do not arrive as an average. They arrive in an order. A pot that
 * earns five per cent a year for thirty years and a pot that loses a third
 * in its first two years and then earns more than five for the rest end up
 * in the same place if nobody touches them. Once somebody is *drawing* from
 * them they do not: the money taken out during the fall is sold at the
 * bottom and is never there for the recovery. Two retirements with the same
 * average return and the same spending, one starting in 1966 and one in
 * 1982, end one broke and one rich. Nothing about the average says so.
 *
 * A safe withdrawal rate is the answer to that. It is not a return. It is
 * the largest share of the starting pot that would have survived the *worst*
 * run history has actually produced, which is why it is well below the
 * average return and why the gap between the two is worth naming rather than
 * hiding. This module prints both and calls the gap what it is.
 *
 * WHAT THE FAMOUS FOUR PER CENT ACTUALLY SAYS, AND ITS THREE LIMITS. It
 * comes from Bengen in 1994 and the Trinity study in 1998: a portfolio of
 * American shares and bonds, drawing an inflation linked income, survived
 * every thirty year window in the record at four per cent. Every clause in
 * that sentence is load bearing.
 *
 * THIRTY YEARS. It is a rule for somebody stopping at 65, not for somebody
 * stopping at 50 and planning to 100. Fifty years is not slightly harder
 * than thirty, and the rate has to come down.
 *
 * AMERICAN. The United States had the best equity century of any major
 * market, and it was not knowable in advance that it would. Run the same
 * test on the other developed markets from 1900 and four per cent fails in
 * most of them. A global investor should not use a rate calibrated on the
 * luckiest market.
 *
 * NO FEES. The studies use index returns with nothing taken off. A platform
 * and a fund charging one per cent take roughly one per cent off the safe
 * rate, which is a fifth of it.
 *
 * All three corrections are applied here, all three are shown separately on
 * the page, and all three are editable, because a reader who disagrees with
 * one of them should be able to see exactly what their disagreement costs.
 */

import { finiteNumber } from "@/lib/money";

/**
 * The historical rate by how long the money must last, before the two
 * corrections below. Interpolated between these points.
 *
 * Thirty years is the published figure and the anchor. Everything either
 * side of it is where the same style of study lands when the window is
 * changed: the rate rises steeply as the horizon shortens, because a short
 * horizon is mostly a matter of spending the capital, and flattens out as
 * it lengthens, because past about fifty years a pot either survives
 * indefinitely or it does not.
 */
const HISTORICAL_LADDER: ReadonlyArray<readonly [years: number, pct: number]> = [
  [10, 9.5],
  [15, 6.6],
  [20, 5.2],
  [25, 4.5],
  [30, 4.0],
  [35, 3.7],
  [40, 3.5],
  [50, 3.3],
  [60, 3.2],
  [70, 3.1],
];

export const SWR_SOURCE =
  "Bengen (1994) and the Trinity study (1998) put 4% on a 30 year retirement of US shares and bonds, before fees. The rest of the ladder is the same test run over other horizons.";

/**
 * What using the world's markets rather than America's costs, in
 * percentage points off the rate. Half a point is the rough distance
 * between the American record and the median developed market over the
 * same century.
 */
export const GLOBAL_HAIRCUT_PCT = 0.5;

export const GLOBAL_HAIRCUT_SOURCE =
  "The 4% studies use US history, the best equity record of any major market. Tested across other developed markets from 1900, 4% failed in most of them.";

/** The published rate for a horizon, before fees and before the haircut. */
export function historicalRate(years: number): number {
  const y = Math.max(1, finiteNumber(years, 30));
  const first = HISTORICAL_LADDER[0];
  const last = HISTORICAL_LADDER[HISTORICAL_LADDER.length - 1];
  if (y <= first[0]) {
    /*
      Under ten years this stops being a safe withdrawal rate at all and
      becomes arithmetic: a pot spent down to nothing over a known number
      of years with a known return. `fixedHorizonPot` is the honest answer
      there and the page uses it. This branch only keeps the curve
      continuous for a slider passing through.
    */
    return (first[1] * first[0]) / y;
  }
  if (y >= last[0]) return last[1];
  for (let i = 1; i < HISTORICAL_LADDER.length; i++) {
    const [y0, p0] = HISTORICAL_LADDER[i - 1];
    const [y1, p1] = HISTORICAL_LADDER[i];
    if (y <= y1) {
      const share = (y - y0) / (y1 - y0);
      return p0 + share * (p1 - p0);
    }
  }
  return last[1];
}

export type SwrInput = {
  years: number;
  feePct: number;
  /** Whether to take the non-US correction off. On by default. */
  globalHaircut: boolean;
  /** The reader's own rate, which wins over all of it when set. */
  overridePct?: number | null;
};

export type SwrBreakdown = {
  /** The published starting point. */
  historicalPct: number;
  /** Taken off for using the world rather than America. */
  haircutPct: number;
  /** Taken off for what the platform and the funds charge. */
  feePct: number;
  /** What is left, which is the rate the plan uses. */
  ratePct: number;
  /** Whether the reader typed the rate themselves. */
  isOverride: boolean;
  years: number;
};

/** The floor, below which a rate is not a plan but a refusal to spend. */
const MIN_RATE_PCT = 0.5;

export function safeWithdrawalRate(input: SwrInput): SwrBreakdown {
  const years = Math.max(1, finiteNumber(input.years, 30));
  const historical = historicalRate(years);
  const haircut = input.globalHaircut ? GLOBAL_HAIRCUT_PCT : 0;
  const fee = Math.max(0, finiteNumber(input.feePct, 0));
  const derived = Math.max(MIN_RATE_PCT, historical - haircut - fee);
  const override =
    input.overridePct != null && Number.isFinite(input.overridePct)
      ? Math.min(25, Math.max(0.1, input.overridePct))
      : null;
  return {
    historicalPct: historical,
    haircutPct: haircut,
    feePct: fee,
    ratePct: override ?? derived,
    isOverride: override != null,
    years,
  };
}

/** Whether money is taken at the start of each year or the end. */
export type DrawTiming = "start" | "end";

/**
 * THE POT THAT COVERS A KNOWN NUMBER OF YEARS AND THEN ENDS AT ZERO.
 *
 * Not every plan is forever, and treating every plan as forever is a way of
 * making people save for a problem they do not have. Somebody stopping work
 * at 50 whose pension unlocks at 57 needs seven years of income, exactly
 * seven, and then the question changes into a different question. That
 * stretch is the bridge, and the pot it needs is far smaller than any safe
 * withdrawal rate would suggest, because it is *meant* to run out.
 *
 * This is the present value of an annuity and nothing more, so it is exact
 * rather than historical: money in, money out, at a stated real return.
 */
export function fixedHorizonPot(input: {
  annualDraw: number;
  years: number;
  realReturnPct: number;
  timing: DrawTiming;
}): number {
  const draw = Math.max(0, finiteNumber(input.annualDraw, 0));
  const years = Math.max(0, finiteNumber(input.years, 0));
  const r = finiteNumber(input.realReturnPct, 0) / 100;
  if (draw <= 0 || years <= 0) return 0;
  const base =
    Math.abs(r) < 1e-9
      ? draw * years
      : (draw * (1 - Math.pow(1 + r, -years))) / r;
  const value = input.timing === "start" ? base * (1 + r) : base;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The share of that pot the first year's draw turns out to be.
 *
 * It is the same arithmetic read backwards and it is worth printing,
 * because it is the one figure that makes the bridge legible next to
 * everything else on the page: a seven year bridge implies taking about
 * fifteen per cent of the pot in year one, which would be reckless in a
 * plan meant to last forever and is simply correct in one that is not.
 * Naming it stops a reader comparing it with the safe rate and concluding
 * the page contradicts itself.
 */
export function impliedFirstYearRate(annualDraw: number, pot: number): number {
  if (!(pot > 0)) return 0;
  const rate = (finiteNumber(annualDraw, 0) / pot) * 100;
  return Number.isFinite(rate) ? rate : 0;
}

/**
 * How long a pot lasts at a given draw and return, in years, or null when
 * the answer is forever. The inverse of the function above, for the reader
 * who would rather state the pot and ask about the years.
 */
export function yearsUntilEmpty(input: {
  pot: number;
  annualDraw: number;
  realReturnPct: number;
  timing: DrawTiming;
}): number | null {
  const pot = Math.max(0, finiteNumber(input.pot, 0));
  const draw = Math.max(0, finiteNumber(input.annualDraw, 0));
  const r = finiteNumber(input.realReturnPct, 0) / 100;
  if (draw <= 0) return null;
  if (pot <= 0) return 0;
  const start = input.timing === "start" ? pot / (1 + r) : pot;
  if (Math.abs(r) < 1e-9) return start / draw;
  const growth = draw / r;
  if (start >= growth) return null;
  const years = -Math.log(1 - start / growth) / Math.log(1 + r);
  return Number.isFinite(years) && years > 0 ? years : 0;
}
