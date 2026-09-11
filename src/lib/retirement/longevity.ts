/**
 * HOW LONG THE MONEY HAS TO LAST, WHICH IS NOT THE AVERAGE LIFE EXPECTANCY.
 *
 * Every retirement calculator asks when you will die and most of them
 * answer it with the life expectancy in the news. That number is wrong for
 * this job three separate times over, and each error pushes the same way,
 * towards a plan that runs out.
 *
 * ONE. LIFE EXPECTANCY AT BIRTH IS NOT YOUR LIFE EXPECTANCY. The figure
 * people quote, about 78 in the United States and about 81 across western
 * Europe, is an average over everybody including the people who die young.
 * Somebody who is 31 and reading a retirement calculator has already not
 * died young. What applies to them is life expectancy *conditional on
 * having reached 31*, which is several years higher.
 *
 * TWO. A PUBLISHED LIFE TABLE ASSUMES MEDICINE STOPS HERE. It is a *period*
 * table: it takes the death rate of today's 80 year olds and applies it to
 * a 31 year old when they are 80, half a century from now. Age specific
 * death rates in developed countries have fallen at roughly one to two per
 * cent a year for a century, and official projections carry on assuming
 * they will. A plan that ignores that is a plan that says the next fifty
 * years of medicine will do nothing, which nobody actually believes.
 *
 * THREE, AND THIS IS THE BIG ONE. AN AVERAGE IS THE WRONG STATISTIC FOR
 * THIS DECISION. Half of people outlive their life expectancy. That is what
 * the word means. Planning to the average is planning a coin flip on
 * whether the money outlasts you, and the two sides of that coin do not
 * cost the same: dying with money left over is a rounding error in a life,
 * and running out at 92 is a catastrophe you cannot work your way out of.
 * The asymmetry, not the average, is the argument. So the default here is
 * the age you have a one in twenty chance of reaching, and the reader can
 * see every other percentile beside it and choose their own.
 *
 * THE MODEL. Gompertz and Makeham: the chance of dying in the next year is
 * a small constant, which is accidents and does not change much with age,
 * plus a term that doubles every eight years or so, which is ageing. It has
 * fitted adult mortality in every population anybody has measured since
 * 1825 and it is two parameters rather than a hundred rows of table, which
 * means the whole thing can be shown to the reader and argued with.
 *
 * WHAT IS FITTED AND WHAT IS FIXED. The rate of ageing is fixed, because
 * the striking empirical finding about Gompertz curves is how little that
 * slope varies between countries and eras: what separates a long lived
 * population from a short lived one is the *level* of mortality, not the
 * speed it accelerates. So the slope is a constant here and the level is
 * solved, per country and per sex, from the one longevity figure that is
 * published everywhere and that anybody can look up: how many more years a
 * 65 year old has. Feed in the published number, get back a whole survival
 * curve. That is the reason it is done this way rather than with a baked
 * table of coefficients nobody could check.
 */

import { finiteNumber } from "@/lib/money";

/**
 * The rate of ageing: how fast the death rate accelerates, per year of age.
 * 0.0875 is a doubling roughly every 7.9 years, which is the figure the
 * Gompertz slope keeps landing on across developed populations.
 */
export const GOMPERTZ_SLOPE = 0.0875;

/**
 * The Makeham term: death that has nothing to do with age. Accidents,
 * mostly. It is what stops the model claiming a 30 year old is immortal.
 */
export const MAKEHAM_BACKGROUND = 0.0003;

/**
 * How fast age specific death rates fall, per year, as medicine improves.
 *
 * One per cent a year is deliberately the conservative end of the
 * historical record rather than the middle of it. Age specific mortality in
 * developed countries fell faster than that over most of the twentieth
 * century, and the UK's official long run projection uses about 1.2%. The
 * number is low here because it is a default, and a default that turns out
 * too optimistic costs a reader their plan while one that turns out too
 * pessimistic costs them a surplus.
 */
export const DEFAULT_IMPROVEMENT_PCT = 1;

/** Where the curve stops. Nobody has a checkable survival figure past it. */
export const MAX_MODELLED_AGE = 125;

/**
 * Improvement does not reach the very old, and leaving that out is what
 * made the first version of this model silly.
 *
 * Applied flat, one per cent a year for the seventy five years between a 31
 * year old and their 106th birthday compounds to mortality at every age
 * being cut by more than half, and the curve then put a one in twenty
 * chance on reaching 105. That is not what any official projection says and
 * it is not what the data on the very old says either: the gains of the
 * last century came overwhelmingly from not dying young and then from
 * heart disease and cancer in the sixties and seventies, while the maximum
 * span has barely moved. Actuarial projection models handle this by tapering
 * improvements away at the oldest ages, and that is what this does: the full
 * rate up to 90, falling in a straight line to nothing at 110.
 *
 * The effect is not a detail. It is the difference between a plan to 106
 * and a plan to 101, which at a 3.3% withdrawal rate is a materially
 * different pot, so the taper is on the page as its own line rather than
 * buried as a constant.
 */
export const IMPROVEMENT_FULL_TO_AGE = 90;
export const IMPROVEMENT_ENDS_AT_AGE = 110;

/** How much of the improvement rate still applies at this age. 1 to 0. */
export function improvementTaper(age: number): number {
  if (age <= IMPROVEMENT_FULL_TO_AGE) return 1;
  if (age >= IMPROVEMENT_ENDS_AT_AGE) return 0;
  return (
    (IMPROVEMENT_ENDS_AT_AGE - age) /
    (IMPROVEMENT_ENDS_AT_AGE - IMPROVEMENT_FULL_TO_AGE)
  );
}

export type Sex = "male" | "female" | "average";

/** One point on the curve: the chance of still being alive at this age. */
export type SurvivalPoint = {
  age: number;
  /** 0 to 1, conditional on being alive at the age the reader is now. */
  survival: number;
};

export type LongevityInput = {
  currentAge: number;
  /** Published years remaining at 65, for a man in this country. */
  e65Male: number;
  /** Published years remaining at 65, for a woman in this country. */
  e65Female: number;
  sex: Sex;
  /** Annual fall in age specific death rates, as a percent. */
  improvementPct: number;
};

export type LongevityResult = {
  /** The fitted level term, shown on the page so the fit can be argued with. */
  level: number;
  /** The published figure the level was solved from. */
  e65Used: number;
  curve: SurvivalPoint[];
  /** Average further years of life from the reader's current age. */
  lifeExpectancy: number;
  /** The age reached by half of people like the reader. */
  medianAge: number;
  /**
   * Ages by how likely you are to still be there. The keys are survival
   * probabilities, so `p10` is the age one in ten reach.
   */
  p50: number;
  p25: number;
  p10: number;
  p5: number;
  p1: number;
  /** The age this app plans to unless the reader says otherwise. */
  suggestedPlanningAge: number;
};

/** The published figure for the sex asked for. "average" takes both. */
export function e65For(input: {
  e65Male: number;
  e65Female: number;
  sex: Sex;
}): number {
  const m = finiteNumber(input.e65Male, 18);
  const f = finiteNumber(input.e65Female, 21);
  if (input.sex === "male") return m;
  if (input.sex === "female") return f;
  return (m + f) / 2;
}

/** Death rate at an age, on a period basis, before any improvement. */
function hazardAt(age: number, level: number): number {
  return MAKEHAM_BACKGROUND + level * Math.exp(GOMPERTZ_SLOPE * age);
}

/**
 * Expected further years at 65 for a given level term, on a period basis:
 * no improvement, exactly the basis the published figure is on. This is
 * the function the fit inverts, so it has to match the published number's
 * own assumptions or the fit is meaningless.
 */
function periodExpectancyAt65(level: number): number {
  const step = 1 / 12;
  let cumulative = 0;
  let years = 0;
  for (let age = 65; age < MAX_MODELLED_AGE; age += step) {
    cumulative += hazardAt(age + step / 2, level) * step;
    years += Math.exp(-cumulative) * step;
  }
  return years;
}

/**
 * Solve the level term from the published years remaining at 65.
 *
 * Bisection rather than anything cleverer: expectancy falls monotonically
 * as the level rises, the bracket is known, and forty halvings is exact to
 * far more digits than the input deserves.
 */
export function fitMortalityLevel(e65: number): number {
  const target = Math.min(35, Math.max(5, finiteNumber(e65, 19)));
  let low = 1e-7;
  let high = 1e-2;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(low * high);
    if (periodExpectancyAt65(mid) > target) low = mid;
    else high = mid;
  }
  return Math.sqrt(low * high);
}

/**
 * The survival curve from the reader's age forward, with medicine allowed
 * to keep improving.
 *
 * The improvement is applied to calendar time rather than to age, which is
 * the whole point of it: the death rate an 80 year old faces in fifty
 * years is today's rate for an 80 year old, reduced by fifty years of
 * improvement. Applying it to age instead would say a person gets safer as
 * they get older, which is not what anybody means.
 */
export function survivalCurve(input: {
  currentAge: number;
  level: number;
  improvementPct: number;
}): SurvivalPoint[] {
  const start = Math.min(100, Math.max(0, Math.floor(finiteNumber(input.currentAge, 30))));
  const improvement = Math.min(5, Math.max(0, finiteNumber(input.improvementPct, 0))) / 100;
  const step = 1 / 12;
  const points: SurvivalPoint[] = [{ age: start, survival: 1 }];
  let cumulative = 0;
  let nextWhole = start + 1;
  for (let t = 0; start + t < MAX_MODELLED_AGE; t += step) {
    const age = start + t + step / 2;
    const elapsed = t + step / 2;
    const improved = Math.exp(-improvement * improvementTaper(age) * elapsed);
    cumulative += hazardAt(age, input.level) * improved * step;
    const age2 = start + t + step;
    if (age2 >= nextWhole - 1e-9) {
      points.push({ age: nextWhole, survival: Math.exp(-cumulative) });
      nextWhole += 1;
    }
  }
  return points;
}

/**
 * The age at which survival falls through a probability.
 *
 * Interpolated between the whole years either side, because a plan that
 * jumps a whole year when the improvement slider moves a tenth of a per
 * cent reads as broken rather than as sensitive.
 */
export function ageAtSurvival(
  curve: SurvivalPoint[],
  probability: number
): number {
  const p = Math.min(1, Math.max(0, probability));
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1];
    const here = curve[i];
    if (here.survival <= p) {
      const span = prev.survival - here.survival;
      if (span <= 0) return here.age;
      const share = (prev.survival - p) / span;
      return prev.age + share * (here.age - prev.age);
    }
  }
  return curve[curve.length - 1]?.age ?? MAX_MODELLED_AGE;
}

/** Average further years of life, which is the area under the curve. */
export function expectedYears(curve: SurvivalPoint[]): number {
  let years = 0;
  for (let i = 1; i < curve.length; i++) {
    years += (curve[i].survival + curve[i - 1].survival) / 2;
  }
  return years;
}

/**
 * The percentile this app plans to by default.
 *
 * One in twenty, for the asymmetry in the file note: the cost of the plan
 * being too long is a surplus and the cost of it being too short is
 * destitution at an age where nothing can be done about it. There is no
 * defensible symmetric answer to a question whose two errors cost such
 * different amounts, so the default is deliberately out in the tail and
 * the reader can see the whole curve and move it.
 */
export const PLANNING_SURVIVAL = 0.05;

export function assessLongevity(input: LongevityInput): LongevityResult {
  const e65 = e65For(input);
  const level = fitMortalityLevel(e65);
  const currentAge = Math.min(100, Math.max(0, Math.floor(finiteNumber(input.currentAge, 30))));
  const curve = survivalCurve({
    currentAge,
    level,
    improvementPct: input.improvementPct,
  });
  const p50 = ageAtSurvival(curve, 0.5);
  const suggested = Math.ceil(ageAtSurvival(curve, PLANNING_SURVIVAL));
  return {
    level,
    e65Used: e65,
    curve,
    lifeExpectancy: expectedYears(curve),
    medianAge: p50,
    p50,
    p25: ageAtSurvival(curve, 0.25),
    p10: ageAtSurvival(curve, 0.1),
    p5: ageAtSurvival(curve, 0.05),
    p1: ageAtSurvival(curve, 0.01),
    suggestedPlanningAge: Math.min(MAX_MODELLED_AGE, suggested),
  };
}
