/**
 * THE GRID: WHAT STOPPING AT EACH AGE WOULD COST, ALL ON ONE SCREEN.
 *
 * Everything else in this module answers the reader's own question with
 * their own numbers, which is right and is also the thing that makes a
 * calculator hard to learn from. One answer tells you nothing about the
 * shape of the problem. A reader who sees only that they need 840,000 at 60
 * cannot tell whether working three more years would change that a lot or a
 * little, whether the standard above theirs is out of reach or nearly
 * affordable, or how much of the whole thing is the state pension.
 *
 * A grid answers all of those at a glance, and the two facts it teaches are
 * the two that change behaviour.
 *
 * THE FIRST IS THAT STOPPING EARLIER COSTS TWICE. It adds years of spending
 * to the end and takes years of saving off the front, and because the
 * horizon lengthens the safe rate comes down as well, so the same life
 * needs a bigger pot. Three effects, all pushing the same way, and nobody
 * predicts the size of it before they see the rows next to each other.
 *
 * THE SECOND IS WHAT INVESTING IS ACTUALLY FOR. The cash column is not a
 * strawman: it is what somebody who keeps their savings in a savings
 * account genuinely has to put away. That comparison is the most useful
 * thing this module can show a person who has not started, and it is worth
 * more than any argument about it, which is why it is a toggle on a table
 * rather than a paragraph.
 *
 * THE TWO COLUMNS DIVERGE IN OPPOSITE DIRECTIONS AND THAT IS THE PART TO
 * LOOK AT. Measured on a 31 year old at the moderate standard, cash
 * against invested: the POT needed runs 1.67x at 35 down to 1.01x at 70,
 * while the MONTHLY SAVING runs the other way, 1.79x at 35 up to 2.60x at
 * 70. Stopping at 70 needs practically the same pot either way and still
 * costs two and a half times as much a month to get there, because what
 * separates them is not the target, it is the decades of compounding doing
 * the saving for you. So the copy points at the monthly figure rather than
 * at the pot: on the pot alone the lesson inverts as the reader looks down
 * the table, and on the monthly figure it only gets stronger.
 *
 * The cash column is also priced on its own terms rather than through the
 * invested machinery: a cash pot is judged on spending down to zero, not
 * on a safe withdrawal rate, because that rate exists to survive the worst
 * ORDER of returns and cash has no order to get wrong. `buildPlan` makes
 * that choice itself, so every cell here, the milestones and the
 * earliest-retirement solver read one target and cannot disagree.
 *
 * Every cell is the same `buildPlan` the rest of the module uses with one
 * input changed. No cell has arithmetic of its own, so no cell can disagree
 * with the answer above it.
 */

import { finiteNumber } from "@/lib/money";
import {
  buildPlan,
  livingCost,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import {
  livingStandardFor,
  regionById,
  type LivingStandard,
} from "@/lib/retirement/regions";
import {
  CAUTIOUS_CASH_REAL_PCT,
  cashOnlyGlide,
} from "@/lib/retirement/returns";

export type TableRow = {
  retirementAge: number;
  /** Years between now and stopping, which is the saving window. */
  yearsSaving: number;
  /** Years the money then has to last. */
  yearsDrawing: number;
  /** The rate used for that horizon, as a percent. */
  swrPct: number;
  /** The pot needed for each published standard. */
  byStandard: Record<LivingStandard, number>;
  /** The pot needed for what the reader actually typed. */
  custom: number;
  /** Saving needed each month to reach the reader's own target. */
  monthlyToCustom: number;
  /** True where this is the age the reader has chosen. */
  isChosen: boolean;
};

export type TableMode = "invested" | "cash";

/** The ages offered, plus the reader's own wherever it falls. */
export function tableAges(
  currentAge: number,
  chosenAge: number
): number[] {
  const first = Math.max(Math.ceil(finiteNumber(currentAge, 30) / 5) * 5, 30);
  const ages = new Set<number>();
  for (let age = first; age <= 70; age += 5) ages.add(age);
  const chosen = Math.round(finiteNumber(chosenAge, 65));
  if (chosen >= finiteNumber(currentAge, 30)) ages.add(chosen);
  return [...ages].sort((a, b) => a - b);
}

/**
 * Strip every return out of the inputs.
 *
 * The cash row is not "the same plan with a lower return". It is a plan
 * with no return at all and no fee either, because nobody pays a platform
 * charge on a savings account, and leaving the fee in would make the cash
 * column lose money in real terms and overstate its own case. A savings
 * account roughly keeps up with inflation over long periods and that is
 * the fairest version of it.
 */
function asCash(inputs: RetirementInputs): RetirementInputs {
  return {
    ...inputs,
    glide: cashOnlyGlide(),
    /*
      Zero real, which is the CAUTIOUS reading of cash and is chosen so
      this column is comparable with the one beside it.

      The invested column is a safe withdrawal rate: what would have
      survived the worst run in the record. Pricing cash at its long run
      average instead would put an expected case next to a worst case, and
      the comparison inverts, with cash appearing to need a smaller pot
      than investing. Cash's own bad run is a decade of high inflation
      eating the nominal return, which is exactly zero real, so this is
      the matching assumption rather than a rigged one. The Assumptions
      panel lets a reader price cash at whatever they like on their own
      plan; this one column holds it at the cautious figure and says so.
    */
    returns: { ...inputs.returns, cashPct: CAUTIOUS_CASH_REAL_PCT },
    swrOverridePct: null,
  };
}

export function buildTable(input: {
  inputs: RetirementInputs;
  suggestedPlanningAge: number;
  mode: TableMode;
}): TableRow[] {
  const base = input.mode === "cash" ? asCash(input.inputs) : input.inputs;
  const region = regionById(base.regionId);
  const currentAge = Math.round(finiteNumber(base.currentAge, 30));
  const chosen = Math.round(finiteNumber(input.inputs.retirementAge, 65));
  const customSpend = livingCost(input.inputs);

  return tableAges(currentAge, chosen).map((retirementAge) => {
    const at = (annualSpend: number) =>
      buildPlan(
        {
          ...base,
          retirementAge,
          spendingMode: "custom",
          customAnnualSpend: annualSpend,
        },
        input.suggestedPlanningAge
      );

    const own = at(customSpend);
    const byStandard = {
      minimum: at(livingStandardFor(region, "minimum", base.household)).required
        .target,
      moderate: at(livingStandardFor(region, "moderate", base.household)).required
        .target,
      comfortable: at(livingStandardFor(region, "comfortable", base.household))
        .required.target,
    };

    return {
      retirementAge,
      yearsSaving: Math.max(0, retirementAge - currentAge),
      yearsDrawing: Math.max(0, own.planningAge - retirementAge),
      swrPct: own.required.swr.ratePct,
      byStandard,
      custom: own.required.target,
      monthlyToCustom: own.monthlyToClose,
      isChosen: retirementAge === chosen,
    };
  });
}
