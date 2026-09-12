/**
 * THE PLAN ITSELF: WHAT A YEAR OF YOUR RETIREMENT ACTUALLY COSTS, YEAR BY
 * YEAR, AND THE POT THAT PAYS FOR IT.
 *
 * Almost every retirement calculator makes the same simplification and it
 * is the one that matters: it takes a single annual spending figure and
 * multiplies. A real retirement is not one number repeated. The state
 * pension starts eleven years in and halves what the pot has to find. A
 * mortgage runs out in year six. A child stops being expensive at 18 and,
 * if you stop work at 45, that is most of your first decade. A car lease
 * either ends or it never does. Flattening all of that into one average
 * gets the total roughly right and the *shape* completely wrong, and the
 * shape is what decides whether the plan survives, because the years that
 * break a retirement are the early ones.
 *
 * So this walks the years. Every year of the plan gets its own cost and its
 * own income, and the pot is what covers the difference.
 *
 * TWO ANSWERS, DELIBERATELY, AND THE GAP BETWEEN THEM IS THE POINT.
 *
 * THE FIRST is exact arithmetic: the present value, at the return the
 * reader chose, of every year's shortfall. It ends at precisely zero on the
 * last day of the plan. It is the smallest honest answer and it is correct
 * if returns arrive at the assumed rate. They will not.
 *
 * THE SECOND funds the part of the spending that never goes away at a safe
 * withdrawal rate, which is a rate built to survive the worst run history
 * has produced, and funds everything temporary out of capital on top. That
 * split is not a flourish. A mortgage with six years left and a lifetime of
 * groceries are different financial objects: one is a debt with a known end
 * and the other is a liability with no end at all, and financing the second
 * one out of a rate that assumes average returns is the mistake that
 * empties pots.
 *
 * The two numbers differ by a lot. That difference is the price of not
 * knowing what order your returns will arrive in, and this module prints it
 * rather than picking one and hiding the other.
 *
 * EVERYTHING IS IN TODAY'S MONEY. Returns are real returns, so a figure on
 * screen is what it would buy now. See `returns.ts` for why.
 */

import { finiteNumber, MAX_SAFE_MONEY } from "@/lib/money";
import {
  DEFAULT_RETURN_ASSUMPTIONS,
  defaultGlide,
  glideIsCashOnly,
  realReturnAt,
  type GlideSegment,
  type ReturnAssumptions,
} from "@/lib/retirement/returns";
import {
  DEFAULT_REGION_ID,
  livingStandardFor,
  localiseFromGbp,
  regionById,
  statePensionFor,
  UK_COST_ANCHORS,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  DEFAULT_IMPROVEMENT_PCT,
  PLANNING_SURVIVAL,
  type Sex,
} from "@/lib/retirement/longevity";
import {
  safeWithdrawalRate,
  type SwrBreakdown,
} from "@/lib/retirement/swr";

/** How the reader's home is paid for, which the published baskets leave out. */
export type Housing = "owned" | "mortgage" | "renting";

/** A child, by how old they are now. Everything else follows from that. */
export type Child = {
  id: string;
  age: number;
};

export type RetirementInputs = {
  regionId: string;
  household: Household;
  sex: Sex;
  currentAge: number;
  retirementAge: number;

  /** Null means take the age the survival curve suggests. */
  planningAge: number | null;
  /** The survival chance the suggested age is read off. */
  planningSurvival: number;
  improvementPct: number;

  /** Take the published basket, or type your own figure. */
  spendingMode: "standard" | "custom";
  standard: LivingStandard;
  /** After tax, in today's money, housing not included. */
  customAnnualSpend: number;

  housing: Housing;
  /** What the mortgage costs a year, and how many years of it are left. */
  mortgageAnnual: number;
  mortgageYearsLeft: number;
  /** Rent never ends, which is the whole reason it is asked separately. */
  rentAnnual: number;

  children: Child[];
  childAnnualCost: number;
  /** The age a child stops costing this. 18, or 21 through university. */
  childUntilAge: number;

  carMonthly: number;
  /** Years of car payments left. Ignored when `carForever` is on. */
  carYearsLeft: number;
  /** Somebody who always leases always has a car payment. */
  carForever: boolean;

  /** What is invested now. Pre-filled from the reader's own holdings. */
  currentPot: number;
  /** Anything else earmarked for this that is not in the portfolio. */
  otherSavings: number;
  /** What goes in each year, in today's money. */
  annualContribution: number;
  /** How much that rises each year above inflation. */
  contributionGrowthPct: number;
  /**
   * Whether the children and car lines come out of what is saved as well
   * as out of retirement spending. Off by default, because the reader was
   * asked what they save *after* their costs and counting it twice would
   * quietly halve their plan.
   */
  costsReduceSaving: boolean;

  includeStatePension: boolean;
  statePensionAnnual: number;
  statePensionAge: number;
  /** A workplace pension, rent from a property, anything guaranteed. */
  otherIncomeAnnual: number;
  otherIncomeFromAge: number;

  /** What the taxman takes from money drawn out of the pot. */
  withdrawalTaxPct: number;

  glide: GlideSegment[];
  returns: ReturnAssumptions;
  swrOverridePct: number | null;
  globalHaircut: boolean;
};

/** What one year of retirement costs and where it comes from. */
export type PlanYear = {
  age: number;
  /** Ordinary living, from the basket or the reader's own figure. */
  living: number;
  /** Rent, or a mortgage that has not finished. */
  housing: number;
  children: number;
  car: number;
  /** Everything above, added up. */
  spend: number;
  /** State pension plus anything else guaranteed. */
  income: number;
  /** What the pot has to find after tax is grossed up. */
  fromPot: number;
};

export type RequiredPot = {
  /** Exact present value of every year's shortfall. Ends at zero. */
  spendDown: number;
  /** Lifelong spending at the safe rate, temporary costs out of capital. */
  safeRate: number;
  /** The lifelong part, the one the safe rate is applied to. */
  lifelongFromPot: number;
  /** The pot the temporary years need on top. */
  temporaryPot: number;
  swr: SwrBreakdown;
  /**
   * Which of the two figures the plan is actually judged against.
   *
   * "safeRate" for anything invested. "spendDown" for a pot that earns a
   * certain nothing, where a safe withdrawal rate is not a conservative
   * choice but a meaningless one. The note beside `basis` in `buildPlan`
   * has the measurement.
   */
  basis: "safeRate" | "spendDown";
  /** The figure named by `basis`, so callers never re-derive it. */
  target: number;
};

export type LedgerRow = {
  age: number;
  startPot: number;
  growth: number;
  /** Positive while working, negative once drawing. */
  flow: number;
  endPot: number;
  /** True from the retirement age on. */
  retired: boolean;
};

export type PlanResult = {
  planningAge: number;
  retirementYears: number;
  yearsToRetirement: number;
  /** Every year of retirement, costed. */
  years: PlanYear[];
  /** The steady state: what the pot funds once nothing temporary is left. */
  lifelongFromPot: number;
  /** The first full year of retirement, which is the one people feel. */
  firstYearFromPot: number;
  required: RequiredPot;
  /** What the current pot plus the planned saving reaches by retirement. */
  projectedPot: number;
  /** What the current pot alone reaches, with nothing more added. */
  projectedFromTodayOnly: number;
  /** Short by this much, or over by it when negative. */
  gap: number;
  /** What has to go in each month to close the gap. */
  monthlyToClose: number;
  /** The age the plan is actually funded at, or null if never on this path. */
  fundedAtAge: number | null;
  /** Every year from now to the end, for the chart. */
  ledger: LedgerRow[];
  /** True where the pot never reaches zero before the planning age. */
  lasts: boolean;
  /** The age it empties, where it does. */
  emptyAtAge: number | null;
  /** The one blended real return the plan behaves like, as a percent. */
  realReturnPct: number;
  currency: string;
};

const MAX_AGE = 125;

function clampAge(n: unknown, fallback: number): number {
  const v = Math.round(finiteNumber(n, fallback));
  return Math.min(MAX_AGE, Math.max(0, v));
}

function clampMoney(n: unknown): number {
  const v = finiteNumber(n, 0);
  return Math.min(MAX_SAFE_MONEY, Math.max(0, v));
}

/** The ordinary living cost, before housing and dependants. */
export function livingCost(inputs: RetirementInputs): number {
  if (inputs.spendingMode === "custom") return clampMoney(inputs.customAnnualSpend);
  return livingStandardFor(
    regionById(inputs.regionId),
    inputs.standard,
    inputs.household
  );
}

/**
 * What a single year costs, at an age, and what income meets it.
 *
 * `yearsFromNow` and `age` are both needed and are not the same thing: a
 * mortgage has a number of years left counting from today, while a child
 * stops costing money at an age of their own. Collapsing the two is the
 * bug this signature exists to prevent.
 */
export function yearAt(
  inputs: RetirementInputs,
  age: number,
  yearsFromNow: number
): PlanYear {
  const living = livingCost(inputs);

  let housing = 0;
  if (inputs.housing === "renting") {
    housing = clampMoney(inputs.rentAnnual);
  } else if (inputs.housing === "mortgage") {
    housing =
      yearsFromNow < Math.max(0, finiteNumber(inputs.mortgageYearsLeft, 0))
        ? clampMoney(inputs.mortgageAnnual)
        : 0;
  }

  const until = Math.max(0, finiteNumber(inputs.childUntilAge, 18));
  const perChild = clampMoney(inputs.childAnnualCost);
  let children = 0;
  for (const child of inputs.children) {
    const childAgeThen = finiteNumber(child.age, 0) + yearsFromNow;
    if (childAgeThen >= 0 && childAgeThen < until) children += perChild;
  }

  const carAnnual = clampMoney(inputs.carMonthly) * 12;
  const car = inputs.carForever
    ? carAnnual
    : yearsFromNow < Math.max(0, finiteNumber(inputs.carYearsLeft, 0))
      ? carAnnual
      : 0;

  const spend = living + housing + children + car;

  let income = 0;
  if (inputs.includeStatePension && age >= clampAge(inputs.statePensionAge, 67)) {
    income += clampMoney(inputs.statePensionAnnual);
  }
  if (age >= clampAge(inputs.otherIncomeFromAge, 999)) {
    income += clampMoney(inputs.otherIncomeAnnual);
  }

  /*
    Tax is grossed up rather than taken off, and the difference is not
    cosmetic. The baskets are after tax figures: they are what has to land
    in the account. To land 30,000 after a 15% charge you have to draw
    30,000 / 0.85, not 30,000 less 15%, which is 4,500 a year short and
    compounds into a pot that is wrong by more than a year of spending.
  */
  const shortfall = Math.max(0, spend - income);
  const taxRate = Math.min(75, Math.max(0, finiteNumber(inputs.withdrawalTaxPct, 0))) / 100;
  const fromPot = taxRate > 0 ? shortfall / (1 - taxRate) : shortfall;

  return { age, living, housing, children, car, spend, income, fromPot };
}

/** The age the plan runs to: the reader's own, or the curve's suggestion. */
export function planningAgeFor(
  inputs: RetirementInputs,
  suggested: number
): number {
  if (inputs.planningAge != null && Number.isFinite(inputs.planningAge)) {
    return clampAge(inputs.planningAge, suggested);
  }
  return clampAge(suggested, 100);
}

/**
 * Run the whole thing.
 *
 * `suggestedPlanningAge` comes in rather than being worked out here because
 * the survival curve is expensive next to this and the room already holds
 * one; recomputing it on every keystroke of the spending field would make
 * the page stutter for an answer that has not changed.
 */
export function buildPlan(
  inputs: RetirementInputs,
  suggestedPlanningAge: number
): PlanResult {
  const region = regionById(inputs.regionId);
  const currentAge = clampAge(inputs.currentAge, 30);
  const retirementAge = Math.max(currentAge, clampAge(inputs.retirementAge, 65));
  const planningAge = Math.max(
    retirementAge + 1,
    planningAgeFor(inputs, suggestedPlanningAge)
  );
  const yearsToRetirement = retirementAge - currentAge;
  const retirementYears = planningAge - retirementAge;

  const years: PlanYear[] = [];
  for (let age = retirementAge; age < planningAge; age++) {
    years.push(yearAt(inputs, age, age - currentAge));
  }

  const swr = safeWithdrawalRate({
    years: retirementYears,
    feePct: inputs.returns.feePct,
    globalHaircut: inputs.globalHaircut,
    overridePct: inputs.swrOverridePct,
  });

  /*
    The lifelong figure is the last year of the plan rather than the
    smallest year in it. By the final year every mortgage has finished,
    every child is grown, and every pension has started, so it is the
    steady state by construction. The minimum would look equivalent and is
    not: a single cheap year in the middle, say the one after the mortgage
    ends and before the car is replaced, would be mistaken for the rest of
    the reader's life and would undercut the pot for thirty years after it.
  */
  const lifelong = years.length > 0 ? years[years.length - 1].fromPot : 0;
  const firstYear = years.length > 0 ? years[0].fromPot : 0;

  const realAtRetirement = realReturnAt(retirementAge, inputs.glide, inputs.returns);

  let spendDownPot = 0;
  let temporaryPot = 0;
  for (let i = 0; i < years.length; i++) {
    const discount = Math.pow(1 + realAtRetirement, i);
    if (!Number.isFinite(discount) || discount <= 0) continue;
    spendDownPot += years[i].fromPot / discount;
    temporaryPot += (years[i].fromPot - lifelong) / discount;
  }

  const lifelongPot = swr.ratePct > 0 ? (lifelong / swr.ratePct) * 100 : 0;
  const safeRatePot = Math.max(0, lifelongPot + temporaryPot);

  /*
    A SAFE WITHDRAWAL RATE IS A STATEMENT ABOUT SEQUENCE RISK, SO IT DOES
    NOT APPLY TO A POT THAT EARNS A CERTAIN NOTHING.

    This was a real bug rather than a nicety, and it was loud. The whole
    point of that rate is to survive the worst ORDER returns could arrive
    in; cash has no order to get wrong. Applied to a pot held entirely in
    cash it is simply a number from another problem, and on a 43 year
    retirement it is far too generous: zero real return supports exactly
    1/43, which is 2.33% a year, while the ladder was handing back 2.94%.

    Measured on the canonical plan, the cash answer came out at 754,797
    against the 932,072 a cash pot actually needs, 19% short, and lower
    than the invested answer sitting next to it, while the panel's own
    copy told the reader cash costs a multiple of investing. A table that
    contradicts the sentence above it costs more than a wrong number.

    So a cash-only plan is judged on the spend-down figure, which at zero
    return is just the sum of every year's need and is exact. This lives
    here rather than in the table because it is a fact about the money,
    not about one panel: the milestones and the earliest-retirement solver
    read the same target and would otherwise disagree with the grid.
  */
  const basis = glideIsCashOnly(inputs.glide) ? "spendDown" : "safeRate";
  const spendDownFigure = Math.max(0, spendDownPot);
  const target = basis === "spendDown" ? spendDownFigure : safeRatePot;

  const required: RequiredPot = {
    spendDown: spendDownFigure,
    safeRate: safeRatePot,
    lifelongFromPot: lifelong,
    temporaryPot,
    swr,
    basis,
    target,
  };

  const startPot = clampMoney(inputs.currentPot) + clampMoney(inputs.otherSavings);
  const growthPct = finiteNumber(inputs.contributionGrowthPct, 0) / 100;

  const ledger: LedgerRow[] = [];
  let pot = startPot;
  let potFromTodayOnly = startPot;
  let fundedAtAge: number | null = null;
  let emptyAtAge: number | null = null;

  for (let age = currentAge; age < planningAge; age++) {
    const yearsFromNow = age - currentAge;
    const r = realReturnAt(age, inputs.glide, inputs.returns);
    const retired = age >= retirementAge;
    const start = pot;
    const growth = start * r;
    let flow: number;

    if (retired) {
      const y = yearAt(inputs, age, yearsFromNow);
      flow = -y.fromPot;
    } else {
      const raw =
        clampMoney(inputs.annualContribution) * Math.pow(1 + growthPct, yearsFromNow);
      let contribution = Number.isFinite(raw) ? raw : 0;
      if (inputs.costsReduceSaving) {
        const y = yearAt(inputs, age, yearsFromNow);
        contribution -= y.children + y.car;
      }
      flow = contribution;
      potFromTodayOnly = potFromTodayOnly * (1 + r);
    }

    pot = Math.min(MAX_SAFE_MONEY, start + growth + flow);
    if (pot < 0) {
      pot = 0;
      if (emptyAtAge == null && retired) emptyAtAge = age + 1;
    }
    if (fundedAtAge == null && !retired && pot >= target && target > 0) {
      fundedAtAge = age + 1;
    }
    ledger.push({ age, startPot: start, growth, flow, endPot: pot, retired });
  }

  const atRetirement = ledger.find((row) => row.age === retirementAge - 1);
  const projectedPot =
    yearsToRetirement <= 0 ? startPot : (atRetirement?.endPot ?? startPot);
  const projectedFromTodayOnly =
    yearsToRetirement <= 0 ? startPot : potFromTodayOnly;

  const gap = target - projectedPot;

  /*
    What has to be added each month to close the gap: the future value of a
    stream of equal real payments, solved backwards. A flat payment rather
    than one rising with the reader's own growth assumption, because this
    is the number somebody sets a standing order to and a standing order is
    a flat number.
  */
  let monthlyToClose = 0;
  if (gap > 0 && yearsToRetirement > 0) {
    /*
      Walked backwards so each year's compounding is carried rather than
      recomputed: one pound put in at `age` is worth the product of every
      return between then and retirement. Forwards this is a loop inside a
      loop, which on a forty year plan re-multiplies the same rates eight
      hundred times for an answer the walk already has in hand.
    */
    let factor = 0;
    let compounded = 1;
    for (let age = retirementAge - 1; age >= currentAge; age--) {
      factor += compounded;
      compounded *= 1 + realReturnAt(age, inputs.glide, inputs.returns);
    }
    monthlyToClose = factor > 0 ? gap / factor / 12 : 0;
  }

  const lasts = emptyAtAge == null;

  return {
    planningAge,
    retirementYears,
    yearsToRetirement,
    years,
    lifelongFromPot: lifelong,
    firstYearFromPot: firstYear,
    required,
    projectedPot,
    projectedFromTodayOnly,
    gap,
    monthlyToClose: Math.max(0, monthlyToClose),
    fundedAtAge,
    ledger,
    lasts,
    emptyAtAge,
    realReturnPct: realAtRetirement * 100,
    currency: region.currency,
  };
}

/** Sensible opening inputs for a region, before the reader touches anything. */
export function defaultInputs(regionId: string = DEFAULT_REGION_ID): RetirementInputs {
  const region = regionById(regionId);
  const retirementAge = region.statePensionAge;
  return {
    regionId: region.id,
    household: "single",
    sex: "average",
    currentAge: 30,
    retirementAge,
    planningAge: null,
    planningSurvival: PLANNING_SURVIVAL,
    improvementPct: DEFAULT_IMPROVEMENT_PCT,
    spendingMode: "standard",
    standard: "moderate",
    customAnnualSpend: livingStandardFor(region, "moderate", "single"),
    housing: "mortgage",
    mortgageAnnual: localiseFromGbp(region, UK_COST_ANCHORS.mortgageAnnual),
    mortgageYearsLeft: 20,
    rentAnnual: localiseFromGbp(region, UK_COST_ANCHORS.rentMonthly * 12),
    children: [],
    childAnnualCost: localiseFromGbp(region, UK_COST_ANCHORS.childAnnual),
    childUntilAge: 18,
    carMonthly: localiseFromGbp(region, UK_COST_ANCHORS.carMonthly),
    carYearsLeft: 3,
    carForever: false,
    currentPot: 0,
    otherSavings: 0,
    annualContribution: 0,
    contributionGrowthPct: 1,
    costsReduceSaving: false,
    includeStatePension: true,
    statePensionAnnual: statePensionFor(region, "single"),
    statePensionAge: region.statePensionAge,
    otherIncomeAnnual: 0,
    otherIncomeFromAge: region.statePensionAge,
    withdrawalTaxPct: 0,
    glide: defaultGlide(retirementAge),
    returns: { ...DEFAULT_RETURN_ASSUMPTIONS },
    swrOverridePct: null,
    globalHaircut: true,
  };
}

/** Move every money figure in the inputs onto a new region's prices. */
export function retargetRegion(
  inputs: RetirementInputs,
  regionId: string
): RetirementInputs {
  const next = regionById(regionId);
  const fresh = defaultInputs(regionId);
  const wasStandard = inputs.spendingMode === "standard";
  return {
    ...inputs,
    regionId: next.id,
    statePensionAnnual: statePensionFor(next, inputs.household),
    statePensionAge: next.statePensionAge,
    otherIncomeFromAge:
      inputs.otherIncomeFromAge === regionById(inputs.regionId).statePensionAge
        ? next.statePensionAge
        : inputs.otherIncomeFromAge,
    customAnnualSpend: wasStandard
      ? livingStandardFor(next, inputs.standard, inputs.household)
      : inputs.customAnnualSpend,
    childAnnualCost: fresh.childAnnualCost,
    rentAnnual: fresh.rentAnnual,
    mortgageAnnual: fresh.mortgageAnnual,
    carMonthly: fresh.carMonthly,
    /*
      What the reader already has and already saves is deliberately left
      alone. Those are their own figures in their own money, and silently
      multiplying somebody's portfolio by an exchange rate because they
      changed a country picker would be this app rewriting a number it was
      told rather than one it derived.
    */
  };
}

/**
 * One person or two, and the two figures that follow from it.
 *
 * A household is not one field. It decides what a year of living costs,
 * because the published baskets have a figure for each, and it decides how
 * many state pensions arrive, because the published rate is per person.
 * Changed on its own it moved only the first, so a couple was priced on a
 * couple's spending against one person's pension.
 *
 * BOTH ARE ONLY MOVED WHILE THEY ARE STILL THIS APP'S OWN DEFAULTS. A
 * reader who has typed their own spending figure or their own pension
 * statement keeps it, because those are their numbers and a household
 * toggle has no business rewriting one.
 */
export function retargetHousehold(
  inputs: RetirementInputs,
  household: Household
): RetirementInputs {
  const region = regionById(inputs.regionId);
  const spendUntouched = inputs.spendingMode === "standard";
  const pensionUntouched =
    Math.round(inputs.statePensionAnnual) ===
    Math.round(statePensionFor(region, inputs.household));
  return {
    ...inputs,
    household,
    customAnnualSpend: spendUntouched
      ? livingStandardFor(region, inputs.standard, household)
      : inputs.customAnnualSpend,
    statePensionAnnual: pensionUntouched
      ? statePensionFor(region, household)
      : inputs.statePensionAnnual,
  };
}

/**
 * Move the age somebody stops, and move the glide with it.
 *
 * The mix of shares and bonds is a function of the retirement age: the
 * default eases out of shares ten years before it and lands at sixty per
 * cent in the year itself. So an age changed on its own leaves a plan
 * holding eighty per cent in shares through a retirement that has already
 * started, or de-risking a decade before anybody needed it, and neither is
 * something the reader asked for by typing a different number in an age box.
 *
 * A GLIDE THE READER BUILT IS LEFT ALONE. Only one that is still exactly
 * the default for the old age is moved, because the whole point of the
 * bands in Assumptions is that somebody can say what they want, and
 * rewriting that from an unrelated control is worse than a stale default.
 */
export function retargetRetirementAge(
  inputs: RetirementInputs,
  retirementAge: number
): RetirementInputs {
  const was = defaultGlide(inputs.retirementAge);
  const untouched =
    inputs.glide.length === was.length &&
    inputs.glide.every(
      (seg, i) =>
        Math.round(seg.fromAge) === Math.round(was[i].fromAge) &&
        Math.round(seg.equityPct) === Math.round(was[i].equityPct)
    );
  return {
    ...inputs,
    retirementAge,
    glide: untouched ? defaultGlide(retirementAge) : inputs.glide,
  };
}

/**
 * THE EARLIEST AGE THIS PLAN COULD ACTUALLY STOP, WHICH IS A FIXED POINT
 * RATHER THAN A THRESHOLD.
 *
 * The obvious way to answer "when could I retire" is to watch the pot climb
 * and report the year it passes the target. That is wrong, and wrong in the
 * flattering direction, which is the worst way for a number about somebody's
 * money to be wrong.
 *
 * The target is not a fixed line. Retiring five years earlier means five
 * more years of spending, five fewer years of saving, and a longer horizon,
 * which pulls the safe withdrawal rate down and so raises the pot needed. It
 * also means more years before the state pension arrives, which the pot has
 * to cover alone. So as the pot rises towards the line, the line is rising
 * to meet it. Comparing a climbing pot against a target computed for a
 * different retirement age can easily report an age several years too early.
 *
 * So both sides move together here: for each candidate age, the pot as it
 * would actually be at that age, against the target for stopping at exactly
 * that age. The first age where the pot wins is the answer.
 */
export function earliestRetirement(
  inputs: RetirementInputs,
  suggestedPlanningAge: number
): { age: number; pot: number; required: number } | null {
  const currentAge = clampAge(inputs.currentAge, 30);
  const lastAge = Math.min(MAX_AGE - 1, Math.max(currentAge + 1, 80));
  const growthPct = finiteNumber(inputs.contributionGrowthPct, 0) / 100;

  let pot = clampMoney(inputs.currentPot) + clampMoney(inputs.otherSavings);
  for (let age = currentAge; age <= lastAge; age++) {
    const required = buildPlan(
      { ...inputs, retirementAge: age },
      suggestedPlanningAge
    ).required.target;
    if (required > 0 && pot >= required) return { age, pot, required };

    const r = realReturnAt(age, inputs.glide, inputs.returns);
    const yearsFromNow = age - currentAge;
    const raw =
      clampMoney(inputs.annualContribution) * Math.pow(1 + growthPct, yearsFromNow);
    let contribution = Number.isFinite(raw) ? raw : 0;
    if (inputs.costsReduceSaving) {
      const y = yearAt(inputs, age, yearsFromNow);
      contribution -= y.children + y.car;
    }
    pot = Math.max(0, Math.min(MAX_SAFE_MONEY, pot * (1 + r) + contribution));
  }
  return null;
}
