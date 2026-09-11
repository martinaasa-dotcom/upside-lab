/**
 * THE LADDER, WHICH IS THE PART THAT KEEPS SOMEBODY COMING BACK.
 *
 * A retirement number is a single figure decades away, and a single figure
 * decades away is the least motivating object in personal finance. Somebody
 * who is 31 and has been told they need 900,000 learns one thing from it,
 * which is that they do not have 900,000. It says nothing about whether
 * they are doing well, nothing about what changes next, and nothing they
 * could feel the effect of this month.
 *
 * What does all three is the ladder underneath that figure. The pot that
 * covers the years between stopping work and the state pension arriving is
 * a real, reachable, much smaller number. The pot whose growth alone gets
 * you there without another penny saved is a genuine event with a date on
 * it, and it arrives years before the headline one. Each of these is a
 * threshold that is crossed on a particular day, and knowing which one is
 * next is the difference between a target and a game.
 *
 * WHAT MAKES THIS HONEST RATHER THAN A PROGRESS BAR. Every rung is the same
 * arithmetic as the headline answer with one input changed, run through the
 * same function, so no rung can drift from the plan it sits under. And the
 * date on each one is read off the reader's own projection rather than
 * estimated, so a rung's date moves the moment they change what they save.
 */

import { finiteNumber } from "@/lib/money";
import {
  buildPlan,
  livingCost,
  yearAt,
  type RetirementInputs,
} from "@/lib/retirement/plan";
import { realReturnAt } from "@/lib/retirement/returns";
import { livingStandardFor, regionById } from "@/lib/retirement/regions";
import { DEFAULT_TIERS } from "@/lib/retirement/tiers";

export type Milestone = {
  id: string;
  label: string;
  /** What crossing it actually means, in one sentence. */
  blurb: string;
  target: number;
  /** Where the reader is now against it, 0 to 1 and capped at 1. */
  progress: number;
  reached: boolean;
  /** The age the projection crosses it, or null if not on this path. */
  ageReached: number | null;
  yearsAway: number | null;
};

function potWithSpend(
  inputs: RetirementInputs,
  suggestedPlanningAge: number,
  annualSpend: number
): number {
  return buildPlan(
    { ...inputs, spendingMode: "custom", customAnnualSpend: annualSpend },
    suggestedPlanningAge
  ).required.target;
}

/**
 * The pot that covers only the years before the state pension starts.
 *
 * This is the bridge, and it is the rung most people have never heard of
 * and most need. Somebody stopping at 52 in a country whose pension starts
 * at 67 has fifteen years to fund entirely themselves and then a very
 * different problem. Those fifteen years are meant to run the money down,
 * so they are priced as a present value and not at a safe rate: a safe rate
 * on a stretch that is supposed to end is asking somebody to fund forever
 * a thing that lasts fifteen years.
 */
export function bridgePot(
  inputs: RetirementInputs,
  retirementAge: number,
  untilAge: number
): number {
  const currentAge = Math.round(finiteNumber(inputs.currentAge, 30));
  const r = realReturnAt(retirementAge, inputs.glide, inputs.returns);
  let pot = 0;
  let i = 0;
  for (let age = retirementAge; age < untilAge; age++, i++) {
    const year = yearAt(inputs, age, age - currentAge);
    const discount = Math.pow(1 + r, i);
    if (Number.isFinite(discount) && discount > 0) pot += year.fromPot / discount;
  }
  return Math.max(0, pot);
}

export function buildMilestones(input: {
  inputs: RetirementInputs;
  suggestedPlanningAge: number;
  /** The plan's own answer, so the headline rung cannot disagree with it. */
  target: number;
  currentPot: number;
  ledger: { age: number; endPot: number }[];
  retirementAge: number;
}): Milestone[] {
  const { inputs, suggestedPlanningAge, target, currentPot, ledger } = input;
  const region = regionById(inputs.regionId);
  const currentAge = Math.round(finiteNumber(inputs.currentAge, 30));
  const spend = livingCost(inputs);

  const rows: { id: string; label: string; blurb: string; target: number }[] = [];

  if (input.retirementAge < inputs.statePensionAge && inputs.includeStatePension) {
    rows.push({
      id: "bridge",
      label: "The bridge",
      blurb: `Enough to cover the years from ${input.retirementAge} to ${inputs.statePensionAge}, when the state pension starts. These years are meant to be spent down, so this is far smaller than it looks.`,
      target: bridgePot(inputs, input.retirementAge, inputs.statePensionAge),
    });
  }

  const essentialsShare =
    (DEFAULT_TIERS[0]?.sharePct ?? 58) /
    DEFAULT_TIERS.reduce((sum, t) => sum + t.sharePct, 0);
  rows.push({
    id: "essentials",
    label: "Essentials for life",
    blurb:
      "The bottom layer of your spending, the part you would never cut, funded for the rest of your life. Nothing above it yet, but the floor is under you.",
    target: potWithSpend(inputs, suggestedPlanningAge, spend * essentialsShare),
  });

  const minimum = livingStandardFor(region, "minimum", inputs.household);
  rows.push({
    id: "minimum",
    label: "The minimum standard",
    blurb:
      "Every basic need met, with a little left over for the things that make a week worth having. Not the plan, but no longer a worry.",
    target: potWithSpend(inputs, suggestedPlanningAge, minimum),
  });

  rows.push({
    id: "plan",
    label: "Your plan",
    blurb:
      "The life you actually described, funded at a rate built to survive the worst run markets have produced.",
    target,
  });

  const comfortable = livingStandardFor(region, "comfortable", inputs.household);
  if (comfortable > spend * 1.05) {
    rows.push({
      id: "comfortable",
      label: "The comfortable standard",
      blurb:
        "More holidays, more spent on going out, and replacing the car without thinking about it.",
      target: potWithSpend(inputs, suggestedPlanningAge, comfortable),
    });
  }

  /*
    Coasting: the pot that gets to the target on its own growth, with
    nothing else ever added. It is worked backwards through the same
    per-age returns the projection uses rather than through one average
    rate, or it would disagree with the ledger it is drawn against, and a
    rung whose date is one year off from the chart beside it is worse than
    no rung.
  */
  let compounded = 1;
  for (let age = currentAge; age < input.retirementAge; age++) {
    compounded *= 1 + realReturnAt(age, inputs.glide, inputs.returns);
  }
  if (compounded > 1.01 && input.retirementAge > currentAge) {
    rows.push({
      id: "coast",
      label: "Coasting",
      blurb: `What you already have grows into your plan on its own by ${input.retirementAge}, with nothing more ever added. From here, saving is optional.`,
      target: target / compounded,
    });
  }

  return rows
    .filter((row) => row.target > 0 && Number.isFinite(row.target))
    .sort((a, b) => a.target - b.target)
    .map((row) => {
      const crossed = ledger.find((r) => r.endPot >= row.target);
      const ageReached = crossed ? crossed.age + 1 : null;
      return {
        ...row,
        progress: Math.min(1, row.target > 0 ? currentPot / row.target : 0),
        reached: currentPot >= row.target,
        ageReached,
        yearsAway: ageReached != null ? Math.max(0, ageReached - currentAge) : null,
      };
    });
}

/** The rung the reader is working on: the first one not yet reached. */
export function nextMilestone(milestones: Milestone[]): Milestone | null {
  return milestones.find((m) => !m.reached) ?? null;
}
