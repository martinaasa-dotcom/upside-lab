/**
 * The retirement module's arithmetic, pinned.
 *
 * These hold the claims the panels make out loud, in the order the module
 * makes them. What they are deliberately NOT doing is asserting today's
 * reference figures: a state pension and a price level move every year and
 * a test that fails when Estonia updates a number is a test that teaches
 * the next person to delete it. What is pinned is the shape of the
 * arithmetic and the properties that, if they broke, would put a wrong
 * number in front of somebody planning their life around it.
 */
import { describe, expect, it } from "vitest";
import {
  assessLongevity,
  ageAtSurvival,
  fitMortalityLevel,
  improvementTaper,
  survivalCurve,
  PLANNING_SURVIVAL,
} from "@/lib/retirement/longevity";
import {
  fixedHorizonPot,
  historicalRate,
  impliedFirstYearRate,
  safeWithdrawalRate,
  yearsUntilEmpty,
  GLOBAL_HAIRCUT_PCT,
} from "@/lib/retirement/swr";
import {
  equityShareAt,
  realReturnAt,
  defaultGlide,
  DEFAULT_RETURN_ASSUMPTIONS,
  portfolioRealReturnPct,
  REAL_RETURN_ASSUMPTIONS,
} from "@/lib/retirement/returns";
import {
  COMPOUND_CASH_YIELD_ANNUAL_PCT,
  COMPOUND_INFLATION_ANNUAL_PCT,
} from "@/lib/compound-play";
import { blendedExpectedAnnualReturn } from "@/lib/forecast-conviction";
import {
  buildPlan,
  defaultInputs,
  earliestRetirement,
  livingCost,
  yearAt,
  retargetRegion,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import { buildMilestones } from "@/lib/retirement/milestones";
import { buildTable } from "@/lib/retirement/table";
import { flexibleYear, DEFAULT_TIERS, tierAmounts } from "@/lib/retirement/tiers";
import {
  CAUTIOUS_CASH_REAL_PCT,
  cashOnlyGlide,
} from "@/lib/retirement/returns";
import { sanitizeInputs } from "@/lib/retirement/state";
import { retirementProvenance } from "@/lib/provenance";
import {
  DEFAULT_REGION_ID,
  REGIONS,
  livingStandardFor,
  localiseFromGbp,
  regionById,
  UK_COST_ANCHORS,
  UK_LIVING_STANDARDS,
} from "@/lib/retirement/regions";

/** A 31 year old in the UK, which is the case the module was built around. */
function subject(over: Partial<RetirementInputs> = {}): RetirementInputs {
  return {
    ...defaultInputs("GB"),
    currentAge: 31,
    retirementAge: 60,
    sex: "male",
    currentPot: 120_000,
    annualContribution: 18_000,
    ...over,
  };
}

const PLAN_AGE = 103;

describe("how long the money has to last", () => {
  it("reproduces the published years remaining at 65 it was fitted to", () => {
    /*
      The whole design rests on this: the input is a number anybody can
      look up and the curve is solved from it. If the fit stops
      reproducing its own anchor, every age printed by this module is
      quietly describing a different population.
    */
    for (const target of [15.6, 17.5, 18.5, 20, 22.8]) {
      const level = fitMortalityLevel(target);
      const curve = survivalCurve({ currentAge: 65, level, improvementPct: 0 });
      let years = 0;
      for (let i = 1; i < curve.length; i++) {
        years += (curve[i].survival + curve[i - 1].survival) / 2;
      }
      expect(years).toBeCloseTo(target, 1);
    }
  });

  it("plans well past the average, because half of people outlive it", () => {
    const r = assessLongevity({
      currentAge: 31,
      e65Male: 18.5,
      e65Female: 21,
      sex: "male",
      improvementPct: 1,
    });
    expect(r.suggestedPlanningAge).toBeGreaterThan(31 + r.lifeExpectancy);
    expect(r.suggestedPlanningAge).toBeGreaterThanOrEqual(r.medianAge + 10);
    // The one in ten age for a man of 31 lands on 100, which is the figure
    // the official cohort projections put in the newspapers.
    expect(r.p10).toBeGreaterThan(97);
    expect(r.p10).toBeLessThan(103);
  });

  it("lets medicine keep improving, and that is worth years", () => {
    const flat = assessLongevity({
      currentAge: 31,
      e65Male: 18.5,
      e65Female: 21,
      sex: "male",
      improvementPct: 0,
    });
    const improving = assessLongevity({
      currentAge: 31,
      e65Male: 18.5,
      e65Female: 21,
      sex: "male",
      improvementPct: 1,
    });
    expect(improving.lifeExpectancy).toBeGreaterThan(flat.lifeExpectancy + 3);
    expect(improving.suggestedPlanningAge).toBeGreaterThan(flat.suggestedPlanningAge);
  });

  it("tapers improvement away at the oldest ages", () => {
    /*
      Without this the model put a one in twenty chance on reaching 105,
      which no projection supports and which materially oversized the pot.
    */
    expect(improvementTaper(80)).toBe(1);
    expect(improvementTaper(100)).toBeCloseTo(0.5, 5);
    expect(improvementTaper(115)).toBe(0);
    const improving = assessLongevity({
      currentAge: 31,
      e65Male: 18.5,
      e65Female: 21,
      sex: "male",
      improvementPct: 1,
    });
    expect(improving.p5).toBeLessThan(105);
  });

  it("falls monotonically, so a rarer age is always a later one", () => {
    const curve = survivalCurve({ currentAge: 31, level: 5e-5, improvementPct: 1 });
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].survival).toBeLessThanOrEqual(curve[i - 1].survival);
    }
    expect(ageAtSurvival(curve, 0.5)).toBeLessThan(ageAtSurvival(curve, 0.05));
    expect(PLANNING_SURVIVAL).toBeLessThan(0.5);
  });
});

describe("the safe withdrawal rate", () => {
  it("keeps the published anchor at thirty years", () => {
    expect(historicalRate(30)).toBeCloseTo(4, 5);
  });

  it("falls as the horizon lengthens, which is the whole early retirement problem", () => {
    expect(historicalRate(50)).toBeLessThan(historicalRate(30));
    expect(historicalRate(30)).toBeLessThan(historicalRate(20));
  });

  it("takes the two corrections off and shows each of them", () => {
    const r = safeWithdrawalRate({ years: 30, feePct: 1, globalHaircut: true });
    expect(r.historicalPct).toBeCloseTo(4, 5);
    expect(r.haircutPct).toBe(GLOBAL_HAIRCUT_PCT);
    expect(r.feePct).toBe(1);
    expect(r.ratePct).toBeCloseTo(4 - GLOBAL_HAIRCUT_PCT - 1, 5);
  });

  it("lets the reader's own rate win, and says that it did", () => {
    const r = safeWithdrawalRate({
      years: 40,
      feePct: 0.25,
      globalHaircut: true,
      overridePct: 3.5,
    });
    expect(r.ratePct).toBe(3.5);
    expect(r.isOverride).toBe(true);
  });
});

describe("a plan that is meant to run out", () => {
  it("matches the present value of an annuity", () => {
    /*
      Seven years at 31,700 and 2%, taken at the end of each year. Worked
      by hand this is 205,162, and a spreadsheet's PV function agrees.
    */
    const pot = fixedHorizonPot({
      annualDraw: 31_700,
      years: 7,
      realReturnPct: 2,
      timing: "end",
    });
    expect(Math.round(pot)).toBe(205_162);
    expect(impliedFirstYearRate(31_700, pot)).toBeCloseTo(15.45, 1);
  });

  it("costs more when the money is taken at the start of the year", () => {
    const end = fixedHorizonPot({ annualDraw: 10_000, years: 10, realReturnPct: 4, timing: "end" });
    const start = fixedHorizonPot({ annualDraw: 10_000, years: 10, realReturnPct: 4, timing: "start" });
    expect(start).toBeCloseTo(end * 1.04, 4);
  });

  it("answers forever when the draw is inside the return", () => {
    expect(
      yearsUntilEmpty({ pot: 1_000_000, annualDraw: 20_000, realReturnPct: 4, timing: "end" })
    ).toBeNull();
    const years = yearsUntilEmpty({
      pot: 100_000,
      annualDraw: 20_000,
      realReturnPct: 0,
      timing: "end",
    });
    expect(years).toBeCloseTo(5, 5);
  });
});

describe("the mix and what it earns", () => {
  it("reads the band the age falls in", () => {
    const glide = defaultGlide(65);
    expect(equityShareAt(30, glide)).toBe(100);
    expect(equityShareAt(60, glide)).toBe(80);
    expect(equityShareAt(70, glide)).toBe(60);
  });

  it("takes fees off the return rather than leaving them for later", () => {
    const withFee = realReturnAt(30, defaultGlide(65), DEFAULT_RETURN_ASSUMPTIONS);
    const without = realReturnAt(30, defaultGlide(65), {
      ...DEFAULT_RETURN_ASSUMPTIONS,
      feePct: 0,
    });
    expect(without - withFee).toBeCloseTo(DEFAULT_RETURN_ASSUMPTIONS.feePct / 100, 10);
  });

  it("only uses the cash figure where nothing at all is invested", () => {
    const cash = realReturnAt(40, cashOnlyGlide(), { ...DEFAULT_RETURN_ASSUMPTIONS, feePct: 0 });
    expect(cash).toBeCloseTo(DEFAULT_RETURN_ASSUMPTIONS.cashPct / 100, 10);
  });

  it("charges no platform fee on a savings account", () => {
    /*
      Left in, this made the module hold two definitions of cash at once:
      the grid zeroed the fee and the Assumptions preset did not, so the
      table and the switch answered differently for one reader.
    */
    const withFee = realReturnAt(40, cashOnlyGlide(), {
      ...DEFAULT_RETURN_ASSUMPTIONS,
      feePct: 1.5,
    });
    expect(withFee).toBeCloseTo(DEFAULT_RETURN_ASSUMPTIONS.cashPct / 100, 10);
  });

  describe("the reader's own holdings, offered as a growth rate", () => {
    it("is exactly Compound's own blend, turned real by the Fisher relation", () => {
      const holdings = [
        { ticker: "NVDA", value: 6000 },
        { ticker: "KO", value: 4000 },
      ];
      const cashBalance = 1000;
      const nominal = blendedExpectedAnnualReturn(holdings, {
        balance: cashBalance,
        annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
      });
      const expectedReal =
        (1 + nominal) / (1 + COMPOUND_INFLATION_ANNUAL_PCT / 100) - 1;
      const got = portfolioRealReturnPct(holdings, cashBalance);
      expect(got).toBeCloseTo(Math.round(expectedReal * 1000) / 10, 5);
    });

    it("comes back lower than the nominal blend it was built from", () => {
      const holdings = [{ ticker: "AAPL", value: 10_000 }];
      const nominalPct =
        blendedExpectedAnnualReturn(holdings, {
          balance: 0,
          annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
        }) * 100;
      const real = portfolioRealReturnPct(holdings, 0);
      expect(real).toBeLessThan(nominalPct);
    });

    it("all cash, no shares, reads as roughly Compound's cash yield turned real", () => {
      const real = portfolioRealReturnPct([], 5000);
      const expected =
        (1 + COMPOUND_CASH_YIELD_ANNUAL_PCT / 100) /
          (1 + COMPOUND_INFLATION_ANNUAL_PCT / 100) -
        1;
      expect(real).toBeCloseTo(Math.round(expected * 1000) / 10, 5);
      expect(real).toBeLessThan(REAL_RETURN_ASSUMPTIONS.equityPct);
    });

    it("never returns something a caller could not render as a percent", () => {
      const real = portfolioRealReturnPct([{ ticker: "MADE-UP", value: NaN }], NaN);
      expect(Number.isFinite(real)).toBe(true);
    });
  });
});

describe("what a year of retirement costs", () => {
  it("drops a child from the bill on the birthday they stop costing", () => {
    const inputs = subject({
      children: [{ id: "a", age: 4 }],
      childAnnualCost: 9_000,
      childUntilAge: 18,
      retirementAge: 40,
    });
    // The child is 17 when the reader is 44, and 18 when they are 45.
    expect(yearAt(inputs, 44, 13).children).toBe(9_000);
    expect(yearAt(inputs, 45, 14).children).toBe(0);
  });

  it("ends a mortgage and never ends rent", () => {
    const mortgaged = subject({ housing: "mortgage", mortgageAnnual: 12_000, mortgageYearsLeft: 10 });
    expect(yearAt(mortgaged, 40, 9).housing).toBe(12_000);
    expect(yearAt(mortgaged, 41, 10).housing).toBe(0);

    const renting = subject({ housing: "renting", rentAnnual: 13_200 });
    expect(yearAt(renting, 95, 64).housing).toBe(13_200);
  });

  it("grosses tax up rather than taking it off, or the plan lands short", () => {
    /*
      The published baskets are after tax: they are what has to arrive. To
      land 30,000 after a 20% charge you draw 37,500, not 24,000. Taking it
      off instead understates the pot by a whole year of spending.
    */
    const inputs = subject({
      spendingMode: "custom",
      customAnnualSpend: 30_000,
      withdrawalTaxPct: 20,
      includeStatePension: false,
      housing: "owned",
      carMonthly: 0,
    });
    expect(yearAt(inputs, 61, 30).fromPot).toBeCloseTo(37_500, 4);
  });

  it("starts the state pension on its own age and not before", () => {
    const inputs = subject({
      includeStatePension: true,
      statePensionAnnual: 12_000,
      statePensionAge: 67,
    });
    expect(yearAt(inputs, 66, 35).income).toBe(0);
    expect(yearAt(inputs, 67, 36).income).toBe(12_000);
  });
});

describe("the pot the plan needs", () => {
  it("asks for more than the exact answer, because returns arrive in an order", () => {
    const plan = buildPlan(subject(), PLAN_AGE);
    expect(plan.required.safeRate).toBeGreaterThan(plan.required.spendDown);
  });

  it("prices the years before the state pension separately from the rest of life", () => {
    const plan = buildPlan(subject(), PLAN_AGE);
    // Retiring at 60 with a pension from 67 leaves seven expensive years.
    expect(plan.firstYearFromPot).toBeGreaterThan(plan.lifelongFromPot);
    expect(plan.required.temporaryPot).toBeGreaterThan(0);
  });

  it("needs a bigger pot to stop earlier, for three reasons at once", () => {
    const early = buildPlan(subject({ retirementAge: 50 }), PLAN_AGE);
    const late = buildPlan(subject({ retirementAge: 65 }), PLAN_AGE);
    expect(early.required.safeRate).toBeGreaterThan(late.required.safeRate);
    expect(early.required.swr.ratePct).toBeLessThan(late.required.swr.ratePct);
    expect(early.retirementYears).toBeGreaterThan(late.retirementYears);
  });

  it("charges rent for life and notices it", () => {
    const owned = buildPlan(subject({ housing: "owned" }), PLAN_AGE);
    const renting = buildPlan(subject({ housing: "renting", rentAnnual: 13_200 }), PLAN_AGE);
    expect(renting.required.safeRate).toBeGreaterThan(owned.required.safeRate * 1.3);
  });

  it("is answered in today's money, so nothing on screen is a future number", () => {
    /*
      A plan whose figures were nominal would grow with the horizon for no
      reason a reader could see. Two identical lives at different distances
      should need a similar pot in real terms, and the only thing that
      moves it is the length of the retirement itself.

      Housing and the car are held off here on purpose: both count their
      years left from today rather than from retirement, so leaving the
      default mortgage and car payment on would give "distant" a mortgage
      that finishes decades before retiring while "soon" carries it years
      into retirement, which is a different life rather than the same one
      further off.
    */
    const soon = buildPlan(
      subject({ currentAge: 55, retirementAge: 65, housing: "owned", carMonthly: 0 }),
      PLAN_AGE
    );
    const distant = buildPlan(
      subject({ currentAge: 25, retirementAge: 65, housing: "owned", carMonthly: 0 }),
      PLAN_AGE
    );
    expect(distant.required.safeRate).toBeCloseTo(soon.required.safeRate, -3);
  });
});

describe("where the reader stands", () => {
  it("does not flatter the retire early answer by holding the target still", () => {
    /*
      The bug this guards is the tempting one: watch the pot pass the
      target for the chosen age and call that the answer. Stopping earlier
      raises the target as the pot rises to meet it, so that reads several
      years early.
    */
    const inputs = subject();
    const plan = buildPlan(inputs, PLAN_AGE);
    const solved = earliestRetirement(inputs, PLAN_AGE);
    expect(solved).not.toBeNull();
    expect(solved!.pot).toBeGreaterThanOrEqual(solved!.required);
    if (plan.fundedAtAge != null) {
      expect(solved!.age).toBeGreaterThanOrEqual(plan.fundedAtAge);
    }
  });

  it("says never rather than guessing when nothing is being saved", () => {
    const broke = subject({ currentPot: 0, annualContribution: 0 });
    expect(earliestRetirement(broke, PLAN_AGE)).toBeNull();
    const plan = buildPlan(broke, PLAN_AGE);
    expect(plan.gap).toBeGreaterThan(0);
    expect(plan.monthlyToClose).toBeGreaterThan(0);
  });

  it("closes the gap with the saving it says it will", () => {
    const inputs = subject({ currentPot: 20_000, annualContribution: 0 });
    const plan = buildPlan(inputs, PLAN_AGE);
    expect(plan.gap).toBeGreaterThan(0);
    const closed = buildPlan(
      { ...inputs, annualContribution: plan.monthlyToClose * 12, contributionGrowthPct: 0 },
      PLAN_AGE
    );
    expect(closed.projectedPot).toBeCloseTo(closed.required.safeRate, -3);
  });
});

describe("the milestone ladder", () => {
  it("climbs, and its top rung is the plan itself", () => {
    const inputs = subject();
    const plan = buildPlan(inputs, PLAN_AGE);
    const rungs = buildMilestones({
      inputs,
      suggestedPlanningAge: PLAN_AGE,
      target: plan.required.safeRate,
      currentPot: inputs.currentPot,
      ledger: plan.ledger,
      retirementAge: inputs.retirementAge,
    });
    expect(rungs.length).toBeGreaterThan(3);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].target).toBeGreaterThanOrEqual(rungs[i - 1].target);
    }
    const plan_ = rungs.find((r) => r.id === "plan");
    expect(plan_?.target).toBe(plan.required.safeRate);
  });

  it("puts coasting below the plan, since growth does the rest", () => {
    const inputs = subject();
    const plan = buildPlan(inputs, PLAN_AGE);
    const rungs = buildMilestones({
      inputs,
      suggestedPlanningAge: PLAN_AGE,
      target: plan.required.safeRate,
      currentPot: inputs.currentPot,
      ledger: plan.ledger,
      retirementAge: inputs.retirementAge,
    });
    const coast = rungs.find((r) => r.id === "coast");
    expect(coast).toBeDefined();
    expect(coast!.target).toBeLessThan(plan.required.safeRate);
  });
});

describe("the grid", () => {
  it("makes stopping earlier dearer on every standard", () => {
    const inputs = subject();
    const rows = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "invested" });
    expect(rows.length).toBeGreaterThan(3);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].byStandard.moderate).toBeLessThan(rows[i - 1].byStandard.moderate);
    }
  });

  it("makes cash cost a multiple of investing, which is the lesson", () => {
    const inputs = subject();
    const invested = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "invested" });
    const cash = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "cash" });
    const i = invested.find((r) => r.retirementAge === 60)!;
    const c = cash.find((r) => r.retirementAge === 60)!;
    expect(c.monthlyToCustom).toBeGreaterThan(i.monthlyToCustom);
  });

  it("diverges in opposite directions, which is why the copy points at the monthly figure", () => {
    /*
      The pot gap narrows as the reader stops later and the saving gap
      widens, because what separates cash from investing is not the target
      but the decades of compounding. Measured on a 31 year old at the
      moderate standard: pot 1.67x at 35 falling to 1.01x at 70, monthly
      1.79x at 35 rising to 2.60x at 70. On the pot alone the lesson
      inverts as you read down the table, which is exactly why the caption
      points at the monthly column instead.
    */
    const inputs = subject({ currentPot: 0, annualContribution: 0 });
    const inv = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "invested" });
    const cash = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "cash" });
    const potX = inv.map((r, i) => cash[i].byStandard.moderate / r.byStandard.moderate);
    const monthlyX = inv.map((r, i) => cash[i].monthlyToCustom / r.monthlyToCustom);

    // Cash is never cheaper, on either measure, at any age.
    for (const x of [...potX, ...monthlyX]) expect(x).toBeGreaterThan(1);

    // The pot gap closes as the horizon shortens; the saving gap opens.
    expect(potX[potX.length - 1]).toBeLessThan(potX[0]);
    expect(monthlyX[monthlyX.length - 1]).toBeGreaterThan(monthlyX[0]);

    // And the saving gap is always the louder of the two.
    for (let i = 0; i < potX.length; i++) {
      expect(monthlyX[i]).toBeGreaterThan(potX[i]);
    }
  });

  it("always includes the age the reader actually chose", () => {
    const rows = buildTable({
      inputs: subject({ retirementAge: 52 }),
      suggestedPlanningAge: PLAN_AGE,
      mode: "invested",
    });
    expect(rows.some((r) => r.retirementAge === 52 && r.isChosen)).toBe(true);
  });
});

describe("spending in layers", () => {
  it("pays the bottom layer first and strips the top in a bad year", () => {
    const bad = flexibleYear({
      pot: 800_000,
      annualSpend: 31_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: -25,
      tiers: DEFAULT_TIERS,
    });
    expect(bad.slices[0].fill).toBeCloseTo(1, 5);
    expect(bad.slices[bad.slices.length - 1].funded).toBe(0);
    expect(bad.spend).toBeLessThan(31_000);
  });

  it("fills every layer in a good year and refuses to spend the surplus", () => {
    const good = flexibleYear({
      pot: 2_000_000,
      annualSpend: 31_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: 16,
      tiers: DEFAULT_TIERS,
    });
    expect(good.spend).toBeCloseTo(31_000, 4);
    expect(good.unspent).toBeGreaterThan(0);
  });

  it("flags a year that cannot even cover the essentials", () => {
    const dire = flexibleYear({
      pot: 100_000,
      annualSpend: 31_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: -40,
      tiers: DEFAULT_TIERS,
    });
    expect(dire.essentialsShort).toBe(true);
  });

  it("splits the whole of the spending and no more", () => {
    const total = tierAmounts(40_000, DEFAULT_TIERS).reduce((s, t) => s + t.full, 0);
    expect(total).toBeCloseTo(40_000, 6);
  });
});

describe("where you live", () => {
  it("defaults a brand new plan to the US, never the UK", () => {
    expect(DEFAULT_REGION_ID).toBe("US");
    expect(defaultInputs().regionId).toBe("US");
  });

  it("falls back an unrecognised id to the default region, not to whichever region sits first in the list", () => {
    expect(REGIONS[0]?.id).not.toBe(DEFAULT_REGION_ID);
    expect(regionById(undefined).id).toBe(DEFAULT_REGION_ID);
    expect(regionById(null).id).toBe(DEFAULT_REGION_ID);
    expect(regionById("not-a-real-region").id).toBe(DEFAULT_REGION_ID);
    // A blob saved before `regionId` existed, or with the field dropped
    // by hand, must not read back as British.
    expect(sanitizeInputs({}).regionId).toBe(DEFAULT_REGION_ID);
  });

  it("derives every basket from the one published set, never a typed table", () => {
    const gb = regionById("GB");
    expect(livingStandardFor(gb, "moderate", "single")).toBe(
      UK_LIVING_STANDARDS.moderate.single
    );
    for (const region of REGIONS) {
      for (const household of ["single", "couple"] as const) {
        const min = livingStandardFor(region, "minimum", household);
        const mod = livingStandardFor(region, "moderate", household);
        const comf = livingStandardFor(region, "comfortable", household);
        expect(min).toBeGreaterThan(0);
        expect(mod).toBeGreaterThan(min);
        expect(comf).toBeGreaterThan(mod);
      }
    }
  });

  it("makes a dearer country cost more for the same life", () => {
    const ch = livingStandardFor(regionById("CH"), "moderate", "single");
    const gbInChf = UK_LIVING_STANDARDS.moderate.single * regionById("CH").perGbp;
    expect(ch).toBeGreaterThan(gbInChf * 1.3);
  });

  it("rounds a small anchor as tightly as the figure it came from", () => {
    /*
      The UK's own car payment anchor is GBP 380. Ported onto the UK's own
      prices (priceLevel 100, perGbp 1) that is a no-op, so the field's
      default should be exactly the figure the note beside it names. A flat
      round-to-the-nearest-hundred moved it to 400, printing two different
      numbers for the same anchor a few inches apart on the page.
    */
    expect(localiseFromGbp(regionById("GB"), UK_COST_ANCHORS.carMonthly)).toBe(
      UK_COST_ANCHORS.carMonthly
    );
    // A five-figure living standard still rounds to the nearest hundred.
    expect(livingStandardFor(regionById("GB"), "minimum", "single") % 100).toBe(0);
  });

  it("carries the reader's own money across a change of country untouched", () => {
    const before = subject({ currentPot: 120_000, annualContribution: 18_000 });
    const after = retargetRegion(before, "DE");
    expect(after.currentPot).toBe(120_000);
    expect(after.annualContribution).toBe(18_000);
    expect(after.statePensionAnnual).toBe(regionById("DE").statePensionAnnual);
    expect(after.regionId).toBe("DE");
  });

  it("ports an untouched mortgage, rent, car and child cost onto the new country", () => {
    // subject() is built on defaultInputs("GB"), so every one of these is
    // still the GB anchor and all four should move.
    const before = subject();
    const after = retargetRegion(before, "DE");
    const de = regionById("DE");
    expect(after.mortgageAnnual).toBe(
      localiseFromGbp(de, UK_COST_ANCHORS.mortgageAnnual)
    );
    expect(after.rentAnnual).toBe(
      localiseFromGbp(de, UK_COST_ANCHORS.rentMonthly * 12)
    );
    expect(after.carMonthly).toBe(localiseFromGbp(de, UK_COST_ANCHORS.carMonthly));
    expect(after.childAnnualCost).toBe(
      localiseFromGbp(de, UK_COST_ANCHORS.childAnnual)
    );
  });

  it("leaves a mortgage, rent, car payment and child cost the reader typed alone", () => {
    /*
      This used to overwrite all four with the new region's generic anchor
      whatever the reader had put in them: somebody who typed their real
      mortgage payment, or simply picked the wrong country first and
      corrected it, had that figure silently replaced with a stranger's.
    */
    const before = subject({
      mortgageAnnual: 9_999,
      rentAnnual: 15_000,
      carMonthly: 275,
      childAnnualCost: 11_500,
    });
    const after = retargetRegion(before, "DE");
    expect(after.mortgageAnnual).toBe(9_999);
    expect(after.rentAnnual).toBe(15_000);
    expect(after.carMonthly).toBe(275);
    expect(after.childAnnualCost).toBe(11_500);
  });

  it("gives every region a currency, a pension and an age that make sense", () => {
    for (const region of REGIONS) {
      expect(region.currency).toMatch(/^[A-Z]{3}$/);
      expect(region.statePensionAnnual).toBeGreaterThan(0);
      expect(region.statePensionAge).toBeGreaterThanOrEqual(60);
      expect(region.statePensionAge).toBeLessThanOrEqual(70);
      expect(region.priceLevel).toBeGreaterThan(30);
      expect(region.perGbp).toBeGreaterThan(0);
      if (region.privatePensionAge != null) {
        expect(region.privatePensionAge).toBeLessThanOrEqual(region.statePensionAge);
      }
    }
  });

  it("has no two regions sharing an id", () => {
    expect(new Set(REGIONS.map((r) => r.id)).size).toBe(REGIONS.length);
  });
});

describe("guards", () => {
  it("survives nonsense without producing a number", () => {
    const junk = subject({
      currentAge: Number.NaN,
      retirementAge: Number.NaN,
      currentPot: Number.POSITIVE_INFINITY,
      annualContribution: -5,
      customAnnualSpend: Number.NaN,
      spendingMode: "custom",
    });
    const plan = buildPlan(junk, PLAN_AGE);
    expect(Number.isFinite(plan.required.safeRate)).toBe(true);
    expect(Number.isFinite(plan.projectedPot)).toBe(true);
    expect(Number.isFinite(plan.monthlyToClose)).toBe(true);
    expect(plan.planningAge).toBeGreaterThan(plan.years.length > 0 ? plan.years[0].age : 0);
  });

  it("never plans to an age before retirement", () => {
    const plan = buildPlan(subject({ retirementAge: 70, planningAge: 40 }), PLAN_AGE);
    expect(plan.planningAge).toBeGreaterThan(70);
  });

  it("reads a custom spend rather than the basket when told to", () => {
    expect(livingCost(subject({ spendingMode: "custom", customAnnualSpend: 42_000 }))).toBe(
      42_000
    );
  });
});

describe("the longevity anchors", () => {
  it("gives every region a published figure that makes a sane curve", () => {
    for (const region of REGIONS) {
      expect(region.e65Male).toBeGreaterThan(10);
      expect(region.e65Male).toBeLessThan(28);
      expect(region.e65Female).toBeGreaterThan(region.e65Male);
      const r = assessLongevity({
        currentAge: 31,
        e65Male: region.e65Male,
        e65Female: region.e65Female,
        sex: "average",
        improvementPct: 1,
      });
      // Nobody's plan should come out shorter than their own median, and
      // nobody's should land past the edge of the modelled range.
      expect(r.suggestedPlanningAge).toBeGreaterThan(r.medianAge);
      expect(r.suggestedPlanningAge).toBeLessThan(120);
    }
  });
});


describe("a pot that earns nothing is not judged on a safe withdrawal rate", () => {
  /*
    The bug these hold cost the grid its credibility rather than a few
    per cent. A safe withdrawal rate exists to survive the worst ORDER
    returns arrive in, and cash has no order to get wrong, so applying it
    to a cash pot borrows a number from a different problem. On the
    canonical 43 year plan the ladder handed back 2.94% where zero real
    return supports exactly 1/43, which is 2.33%, and the cash answer came
    out BELOW the invested one, directly under a panel telling the reader
    cash costs a multiple of investing.
  */
  const asCash = (over: Partial<RetirementInputs> = {}) =>
    subject({
      glide: cashOnlyGlide(),
      returns: { ...DEFAULT_RETURN_ASSUMPTIONS, cashPct: 0, feePct: 0 },
      ...over,
    });

  it("switches basis when nothing at all is invested", () => {
    expect(buildPlan(subject(), PLAN_AGE).required.basis).toBe("safeRate");
    expect(buildPlan(asCash(), PLAN_AGE).required.basis).toBe("spendDown");
  });

  it("answers a cash plan with the sum of every year, exactly", () => {
    const plan = buildPlan(asCash(), PLAN_AGE);
    const summed = plan.years.reduce((total, y) => total + y.fromPot, 0);
    expect(plan.required.target).toBeCloseTo(summed, 4);
    expect(plan.required.target).toBe(plan.required.spendDown);
  });

  it("makes cash dearer than investing, which is what the page claims", () => {
    const invested = buildPlan(subject(), PLAN_AGE);
    const cash = buildPlan(asCash(), PLAN_AGE);
    expect(cash.required.target).toBeGreaterThan(invested.required.target);
  });

  it("carries the same reversal into every cell of the grid", () => {
    const inputs = subject();
    const invested = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "invested" });
    const cash = buildTable({ inputs, suggestedPlanningAge: PLAN_AGE, mode: "cash" });
    expect(cash.length).toBe(invested.length);
    for (let i = 0; i < cash.length; i++) {
      expect(cash[i].byStandard.moderate).toBeGreaterThan(
        invested[i].byStandard.moderate
      );
      expect(cash[i].monthlyToCustom).toBeGreaterThanOrEqual(
        invested[i].monthlyToCustom
      );
    }
  });

  it("always names the figure it was judged on", () => {
    for (const inputs of [subject(), asCash()]) {
      const { required } = buildPlan(inputs, PLAN_AGE);
      expect(required.target).toBe(required[required.basis]);
    }
  });
});

describe("guaranteed income is the part of the stack the market cannot reach", () => {
  const tiers = DEFAULT_TIERS;
  const spend = 31_000;

  it("adds to the budget rather than being netted out of the spending", () => {
    const without = flexibleYear({
      pot: 500_000,
      annualSpend: spend,
      withdrawalRatePct: 3.2,
      marketReturnPct: 5,
      tiers,
    });
    const with_ = flexibleYear({
      pot: 500_000,
      annualSpend: spend,
      guaranteedIncome: 12_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: 5,
      tiers,
    });
    expect(with_.budget - without.budget).toBeCloseTo(12_000, 6);
    expect(with_.guaranteed).toBe(12_000);
    expect(with_.fromPot).toBeCloseTo(without.fromPot, 6);
    // The layers are shares of what is SPENT, so they do not move when
    // income does. Only how much of them gets funded changes.
    expect(with_.slices[0].full).toBeCloseTo(without.slices[0].full, 6);
  });

  it("keeps the essentials covered through a crash when the pension covers them", () => {
    const essentials = tierAmounts(spend, tiers)[0].full;
    const year = flexibleYear({
      pot: 500_000,
      annualSpend: spend,
      guaranteedIncome: essentials,
      withdrawalRatePct: 3.2,
      marketReturnPct: -60,
      tiers,
    });
    expect(year.essentialsShort).toBe(false);
    expect(year.slices[0].fill).toBeCloseTo(1, 5);
  });

  it("still strips the top layers first when the market falls", () => {
    /*
      The pot is chosen so the bad year genuinely bites: at -30% the
      budget is 27,680 against 31,000 of spending, while the good year
      still funds every layer. A larger pot funds everything at both ends
      and the test passes without testing anything.
    */
    const good = flexibleYear({
      pot: 700_000,
      annualSpend: spend,
      guaranteedIncome: 12_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: 16,
      tiers,
    });
    const bad = flexibleYear({
      pot: 700_000,
      annualSpend: spend,
      guaranteedIncome: 12_000,
      withdrawalRatePct: 3.2,
      marketReturnPct: -30,
      tiers,
    });
    const top = tiers.length - 1;
    expect(bad.slices[top].funded).toBeLessThan(good.slices[top].funded);
    expect(bad.slices[0].funded).toBeCloseTo(good.slices[0].funded, 6);
  });
});


describe("the panel that says where a number came from is never approximately right", () => {
  const forPlan = (inputs: RetirementInputs) => {
    const plan = buildPlan(inputs, PLAN_AGE);
    return {
      plan,
      prov: retirementProvenance({
        regionName: "United Kingdom",
        standardsSource: "s",
        returnsSource: "r",
        swrSource: "w",
        haircutSource: "h",
        statePensionSource: "p",
        e65: 19.75,
        planningAge: PLAN_AGE,
        improvementPct: 1,
        swrPct: plan.required.swr.ratePct,
        realReturnPct: plan.realReturnPct,
        basis: plan.required.basis,
      }),
    };
  };
  const words = (p: ReturnType<typeof forPlan>["prov"]) =>
    [
      ...p.inputs.map((i) => `${i.what} ${i.detail ?? ""}`),
      ...(p.steps ?? []),
      ...(p.sources ?? []).map((x) => `${x.name} ${x.what}`),
      ...(p.blindSpots ?? []),
    ]
      .join(" ")
      .toLowerCase();

  it("describes a withdrawal rate only where one is used", () => {
    /*
      The bug: a cash plan is answered by spending down to zero and no rate
      is applied to it, yet this panel printed "the rate the pot is drawn
      at, 2.69% a year" and two steps about surviving the worst run in the
      record. It was describing machinery that reader's plan never ran.
    */
    const invested = forPlan(subject());
    expect(words(invested.prov)).toContain("withdrawal rate");
    expect(words(invested.prov)).toContain("the rate the pot is drawn at");

    const cash = forPlan(
      subject({
        glide: cashOnlyGlide(),
        returns: { ...DEFAULT_RETURN_ASSUMPTIONS, cashPct: CAUTIOUS_CASH_REAL_PCT },
      })
    );
    expect(cash.plan.required.basis).toBe("spendDown");
    expect(words(cash.prov)).not.toContain("the rate the pot is drawn at");
    expect(words(cash.prov)).not.toContain("bengen");
    expect(words(cash.prov)).toContain("no safe withdrawal rate is applied");
  });

  it("does not charge a cash plan a platform fee it never pays", () => {
    const cash = forPlan(
      subject({
        glide: cashOnlyGlide(),
        returns: { ...DEFAULT_RETURN_ASSUMPTIONS, cashPct: CAUTIOUS_CASH_REAL_PCT },
      })
    );
    expect(words(cash.prov)).not.toContain("fees already taken off");
    expect(words(cash.prov)).toContain("nobody pays one on a savings account");
  });

  it("still answers the three things every provenance panel owes", () => {
    for (const inputs of [
      subject(),
      subject({
        glide: cashOnlyGlide(),
        returns: { ...DEFAULT_RETURN_ASSUMPTIONS, cashPct: CAUTIOUS_CASH_REAL_PCT },
      }),
    ]) {
      const { prov } = forPlan(inputs);
      expect(prov.inputs.length).toBeGreaterThan(3);
      expect(prov.sources?.length ?? 0).toBeGreaterThan(3);
      expect(prov.blindSpots?.length ?? 0).toBeGreaterThan(3);
      expect(prov.maker).toBe("arithmetic");
    }
  });
});

describe("one cautious cash rate, read by the grid and the preset alike", () => {
  it("gives the same answer from both doors", () => {
    /*
      Before the constant, the grid zeroed cash's return and the
      Assumptions preset used its long run 0.9% average, so one reader got
      two answers to "what if I do not invest" from one page, and on the
      preset path cash came out needing LESS than investing.
    */
    const inputs = subject();
    const fromPreset = buildPlan(
      {
        ...inputs,
        glide: cashOnlyGlide(),
        returns: { ...inputs.returns, cashPct: CAUTIOUS_CASH_REAL_PCT },
      },
      PLAN_AGE
    );
    const fromGrid = buildTable({
      inputs,
      suggestedPlanningAge: PLAN_AGE,
      mode: "cash",
    }).find((row) => row.retirementAge === inputs.retirementAge);

    expect(fromGrid).toBeDefined();
    expect(fromPreset.required.target).toBeCloseTo(fromGrid!.custom, 4);
    expect(fromPreset.realReturnPct).toBe(0);
  });

  it("keeps cash dearer than investing from the preset too", () => {
    const inputs = subject();
    const invested = buildPlan(inputs, PLAN_AGE);
    const cash = buildPlan(
      {
        ...inputs,
        glide: cashOnlyGlide(),
        returns: { ...inputs.returns, cashPct: CAUTIOUS_CASH_REAL_PCT },
      },
      PLAN_AGE
    );
    expect(cash.required.target).toBeGreaterThan(invested.required.target);
  });
});

describe("a plan survives the round trip through a browser", () => {
  it("comes back exactly as it went in", () => {
    const original = subject({
      regionId: "EE",
      sex: "male",
      children: [
        { id: "a", age: 3 },
        { id: "b", age: 7 },
      ],
      housing: "renting",
      rentAnnual: 14_400,
      carMonthly: 400,
      carForever: true,
      planningAge: 99,
      swrOverridePct: 3.1,
      globalHaircut: false,
      glide: [
        { fromAge: 0, equityPct: 25 },
        { fromAge: 40, equityPct: 100 },
      ],
    });
    const back = sanitizeInputs(JSON.parse(JSON.stringify(original)));
    expect(back).toEqual(original);
  });

  it("takes anything at all without throwing", () => {
    for (const junk of [
      null,
      undefined,
      42,
      "nonsense",
      [],
      { regionId: 999, children: "no", glide: {}, returns: null },
      { currentAge: Number.NaN, planningAge: Number.POSITIVE_INFINITY },
    ]) {
      const out = sanitizeInputs(junk);
      expect(Number.isFinite(out.currentAge)).toBe(true);
      expect(out.glide.length).toBeGreaterThan(0);
      expect(Array.isArray(out.children)).toBe(true);
      expect(Number.isFinite(buildPlan(out, PLAN_AGE).required.target)).toBe(true);
    }
  });
});
