/**
 * WHAT IS IN THIS PLAN THAT THE ESSENTIALS DO NOT SHOW.
 *
 * The simplest level of this room asks for eight figures and answers with a
 * pot. Everything else in the plan is still there and still in that pot: a
 * mortgage with eleven years to run, two children who stop costing money at
 * 18, a car payment, a state pension arriving at 67. A template puts those
 * in, and a reader coming back to a plan they filled in properly has their
 * own.
 *
 * A PAGE THAT STATES A FIGURE MUST NOT HIDE WHAT WENT INTO IT. That is this
 * repository's oldest rule and the detail levels are the one thing in this
 * room that could quietly break it: folding away the CONTROL for a cost is
 * fine, and folding away the fact that the cost exists is not, because the
 * reader is then arguing with a number whose inputs they cannot see. So the
 * simple level prints this line: every part of the plan that costs or pays
 * money and is not one of the eight figures above it, in the reader's own
 * words and their own money, with the control one press away.
 *
 * It is deliberately only the things a reader would be surprised by. The
 * return, the withdrawal rate and the planning age are assumptions rather
 * than facts about this person's life, they are identical for everybody who
 * has not gone looking, and the provenance mark beside the headline already
 * answers for all three.
 */

import type { RetirementInputs } from "@/lib/retirement/plan";

/** How a money figure is written. Passed in so this file stays pure. */
export type MoneyWriter = (amount: number) => string;

/**
 * The phrases, in the order a reader would want them: what the home costs,
 * who depends on them, what else goes out, and what comes in.
 *
 * Empty when the plan really is only the eight figures above, in which case
 * the caller prints nothing rather than a sentence saying there is nothing,
 * which is scaffolding with no reader.
 */
export function planExtras(
  inputs: RetirementInputs,
  money: MoneyWriter
): string[] {
  const out: string[] = [];

  if (inputs.housing === "mortgage" && inputs.mortgageAnnual > 0) {
    out.push(
      inputs.mortgageYearsLeft > 0
        ? `a mortgage of ${money(inputs.mortgageAnnual)} a year with ${Math.round(inputs.mortgageYearsLeft)} years left`
        : `a mortgage of ${money(inputs.mortgageAnnual)} a year`
    );
  } else if (inputs.housing === "renting" && inputs.rentAnnual > 0) {
    /*
      Said out loud as never ending, because that is the whole reason rent
      is asked separately from a mortgage and it is the single largest line
      a renting reader carries.
    */
    out.push(`rent of ${money(inputs.rentAnnual)} a year, which never ends`);
  }

  const kids = inputs.children.length;
  if (kids > 0 && inputs.childAnnualCost > 0) {
    out.push(
      `${kids === 1 ? "one child" : `${kids} children`} at ${money(inputs.childAnnualCost)} a year each until they are ${Math.round(inputs.childUntilAge)}`
    );
  }

  if (inputs.carMonthly > 0) {
    out.push(
      inputs.carForever
        ? `a car payment of ${money(inputs.carMonthly)} a month that never ends`
        : `a car payment of ${money(inputs.carMonthly)} a month for ${Math.round(inputs.carYearsLeft)} more years`
    );
  }

  if (inputs.otherSavings > 0) {
    out.push(`${money(inputs.otherSavings)} of other savings for this`);
  }

  if (inputs.includeStatePension && inputs.statePensionAnnual > 0) {
    out.push(
      `a state pension of ${money(inputs.statePensionAnnual)} a year from ${Math.round(inputs.statePensionAge)}`
    );
  }

  if (inputs.otherIncomeAnnual > 0) {
    out.push(
      `${money(inputs.otherIncomeAnnual)} a year of other guaranteed income from ${Math.round(inputs.otherIncomeFromAge)}`
    );
  }

  if (inputs.withdrawalTaxPct > 0) {
    out.push(`${inputs.withdrawalTaxPct}% tax on what you draw out`);
  }

  return out;
}

/**
 * The phrases as one sentence.
 *
 * The English comma and a final "and", because a list of four things
 * separated by commas alone reads as a fragment, and this sits in a
 * paragraph rather than in a table.
 */
export function planExtrasSentence(
  inputs: RetirementInputs,
  money: MoneyWriter
): string | null {
  const parts = planExtras(inputs, money);
  if (parts.length === 0) return null;
  if (parts.length === 1) return `This plan also counts ${parts[0]}.`;
  const last = parts[parts.length - 1];
  return `This plan also counts ${parts.slice(0, -1).join(", ")} and ${last}.`;
}

/**
 * THE ONE LINE THAT MOVES WHEN A TEMPLATE IS PRESSED.
 *
 * The eight lives sit low enough on a phone that the headline panel is off
 * the top of the screen while somebody is pressing them, and a control that
 * changes something you cannot see reads as a control that does nothing. So
 * the card carries its own result, on the same screen as the cards, and it
 * is a sentence rather than a second headline: the figure with the two
 * things that make it mean anything, the age it is for and the age this
 * saving would actually reach.
 *
 * It states arithmetic and never an instruction. "Could stop at 68" is a
 * fact about a pot crossing a target; anything in the shape of "you should"
 * belongs to nobody here, and `retirement-room.test.ts` fails on one.
 */
export function quickResultLine(input: {
  target: number;
  retirementAge: number;
  /** The solved earliest age, or null when this saving never reaches it. */
  earliestAge: number | null;
  money: MoneyWriter;
}): string {
  const { money, target, retirementAge, earliestAge } = input;
  const head = `${money(target)} to stop at ${Math.round(retirementAge)}`;
  if (earliestAge == null) {
    return `${head}. What this plan saves does not reach that, so the earliest age is further out than the tables below go.`;
  }
  if (Math.round(earliestAge) <= Math.round(retirementAge)) {
    return `${head}, and on this saving the pot gets there by ${Math.round(earliestAge)}.`;
  }
  return `${head}, and on this saving the pot gets there at ${Math.round(earliestAge)}.`;
}
