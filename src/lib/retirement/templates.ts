/**
 * EIGHT LIVES, SO THE FIRST ANSWER COSTS ONE PRESS.
 *
 * The rest of this module is a plan with forty inputs behind it, and every
 * one of them earns its place: a mortgage that ends in year six and a child
 * who stops costing money at 18 are the difference between a plan that
 * survives and one that only looks like it does. That is also exactly why
 * nobody ever sees any of it. A reader who arrives at forty fields has to
 * answer questions they have never been asked before, in an order somebody
 * else chose, before the page will tell them anything at all, and what they
 * do instead is close the tab.
 *
 * So a template is a whole plausible life, filled in at once. Press one and
 * every figure below it is answered: the ages, the household, the house, the
 * children and their ages, what is already saved, what goes in each year.
 * None of it is a claim about the reader. It is a starting point they can
 * see the shape of, which is the only useful thing to hand somebody who does
 * not yet know what the question costs.
 *
 * WHAT A TEMPLATE MAY AND MAY NOT DECIDE. It sets the things most people
 * would answer roughly the same way in that life, and it never touches the
 * two levers that decide the answer more than anything else: what the money
 * earns, and the withdrawal rate it is judged at. Those stay at the audited
 * defaults for every template, so a reader comparing two of them is seeing
 * the difference between two lives rather than the difference between two
 * sets of market assumptions.
 *
 * EVERY FIGURE IS IN POUNDS HERE AND IN THE READER'S MONEY ON SCREEN. The
 * anchors are UK figures for the same reason the cost anchors in
 * `regions.ts` are: one basket ported by price level is checkable, and
 * twenty-three hand-typed tables are twenty-three numbers that drift apart
 * on the first edit.
 */

import { defaultInputs, type Child, type Housing, type RetirementInputs } from "@/lib/retirement/plan";
import {
  costAnchorsForStandard,
  livingStandardFor,
  localiseFromGbp,
  regionById,
  statePensionFor,
  type Household,
  type LivingStandard,
} from "@/lib/retirement/regions";
import { defaultGlide } from "@/lib/retirement/returns";

export type RetirementTemplateId =
  | "starting-out"
  | "getting-going"
  | "two-of-you"
  | "family-years"
  | "renting-on"
  | "peak-earning"
  | "nearly-there"
  | "stop-early";

/**
 * One life, in the few figures that describe it.
 *
 * Money is in pounds and ported to the reader's country when the template
 * is applied. Ages are ages. `retireAt` is null for the ordinary case of
 * stopping when the state pension starts, which is a different age in every
 * country and so cannot be written down here.
 */
export type RetirementTemplate = {
  id: RetirementTemplateId;
  /** The name on the card, in the fewest words that identify the life. */
  label: string;
  /** One line saying who this is, so nobody has to press it to find out. */
  blurb: string;
  currentAge: number;
  /** Null means stop when the state pension starts. */
  retireAt: number | null;
  household: Household;
  standard: LivingStandard;
  housing: Housing;
  /** Years of mortgage left at today's date, when there is one. */
  mortgageYearsLeft: number;
  /** The ages the children are now. Empty for most of these. */
  childAges: number[];
  /** Already invested for this, in pounds. */
  potGbp: number;
  /** Goes in each year, in pounds. */
  contributionGbp: number;
  /** A car payment a month, in pounds. Zero for most. */
  carMonthlyGbp: number;
  carYearsLeft: number;
};

/**
 * The eight, in the order they are drawn, which is roughly the order a life
 * runs in with the aspirational one last.
 *
 * They are chosen to span the shapes the arithmetic actually treats
 * differently rather than to span incomes: somebody with nothing saved and
 * forty years of compounding, somebody carrying children through their
 * first decade, somebody who will still be paying rent at 80, and somebody
 * stopping fifteen years before a state pension will pay them anything. A
 * reader who does not see themselves exactly will still find the one whose
 * shape is theirs, and the essentials above the row fix the rest.
 */
export const RETIREMENT_TEMPLATES: readonly RetirementTemplate[] = [
  {
    id: "starting-out",
    label: "Just starting out",
    blurb: "Early twenties, barely begun, and forty years of compounding ahead.",
    currentAge: 24,
    retireAt: null,
    household: "single",
    standard: "moderate",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 5_000,
    contributionGbp: 4_800,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "getting-going",
    label: "Getting going",
    blurb: "Thirties, saving properly for the first time, no children yet.",
    currentAge: 32,
    retireAt: null,
    household: "single",
    standard: "moderate",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 25_000,
    contributionGbp: 6_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "two-of-you",
    label: "Two of you",
    blurb: "A couple, both earning, no children, saving hard while it is easy.",
    currentAge: 38,
    retireAt: null,
    household: "couple",
    standard: "comfortable",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 120_000,
    contributionGbp: 14_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "family-years",
    label: "Family years",
    blurb: "Two children at home, a mortgage running, the dearest decade there is.",
    currentAge: 40,
    retireAt: null,
    household: "couple",
    standard: "moderate",
    housing: "mortgage",
    mortgageYearsLeft: 18,
    childAges: [8, 5],
    potGbp: 75_000,
    contributionGbp: 7_200,
    carMonthlyGbp: 300,
    carYearsLeft: 3,
  },
  {
    id: "renting-on",
    label: "Renting for good",
    blurb: "No house coming, so the rent is still there at 80. The biggest line on the page.",
    currentAge: 45,
    retireAt: null,
    household: "single",
    standard: "moderate",
    housing: "renting",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 130_000,
    contributionGbp: 12_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "peak-earning",
    label: "Peak earning",
    blurb: "Fifties, children grown, the most you will ever be able to put away.",
    currentAge: 50,
    retireAt: null,
    household: "couple",
    standard: "comfortable",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 380_000,
    contributionGbp: 20_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "nearly-there",
    label: "Nearly there",
    blurb: "Close enough to count the years, and still time to change the answer.",
    currentAge: 58,
    retireAt: null,
    household: "couple",
    standard: "comfortable",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 700_000,
    contributionGbp: 20_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
  {
    id: "stop-early",
    label: "Stop early",
    blurb: "Out at 50, which means paying for yourself for years before any pension starts.",
    currentAge: 35,
    retireAt: 50,
    household: "single",
    standard: "moderate",
    housing: "owned",
    mortgageYearsLeft: 0,
    childAges: [],
    potGbp: 80_000,
    contributionGbp: 24_000,
    carMonthlyGbp: 0,
    carYearsLeft: 0,
  },
];

/**
 * The life a reader who has never been here before opens on.
 *
 * The room used to open on zeroes: nothing saved, nothing going in, a pot
 * short by the whole target and an earliest retirement age of "n/a". Every
 * figure on it was correct and the page read as a verdict on somebody who
 * had not typed anything yet, which is a strange thing to hand a person
 * three seconds after they arrive. A plausible mid-thirties life instead
 * puts a real answer, a real ladder and a real earliest age on screen at
 * once, with the card it came from lit and a line saying so, which is both
 * kinder and far more use: it shows what the page DOES.
 *
 * It is only ever used when there is no stored plan. A returning reader's
 * own figures are never replaced by one of these.
 */
export const DEFAULT_TEMPLATE_ID: RetirementTemplateId = "getting-going";

export function templateById(
  id: string | null | undefined
): RetirementTemplate | null {
  return RETIREMENT_TEMPLATES.find((t) => t.id === id) ?? null;
}

/**
 * A whole plan from one press.
 *
 * It is built on `defaultInputs` rather than patched over whatever the
 * reader had before, which is the point of a template: pressing one is
 * asking for a clean life, not for a few of its fields laid over the
 * remains of the last one. Anything a template does not name keeps the
 * audited default, so the market assumptions are identical across all
 * eight and the only thing that differs between two of them is the life.
 */
export function templateInputs(
  template: RetirementTemplate,
  regionId: string
): RetirementInputs {
  const region = regionById(regionId);
  const base = defaultInputs(region.id);
  const retirementAge = template.retireAt ?? region.statePensionAge;
  const children: Child[] = template.childAges.map((age, i) => ({
    id: `template-child-${i}`,
    age,
  }));
  /*
    A child and a mortgage cost different amounts at each standard (see
    `costAnchorsForStandard`), so a template answers with its own
    standard's figures rather than always the moderate ones `base` opens
    on. The car stays `carMonthlyGbp` alone, zero for most of these eight
    lives on purpose (a life without a car in it), rather than falling
    back to a standard's anchor.
  */
  const costs = costAnchorsForStandard(template.standard);

  return {
    ...base,
    currentAge: template.currentAge,
    retirementAge,
    household: template.household,
    spendingMode: "standard",
    standard: template.standard,
    customAnnualSpend: livingStandardFor(region, template.standard, template.household),
    statePensionAnnual: statePensionFor(region, template.household),
    housing: template.housing,
    mortgageAnnual: localiseFromGbp(region, costs.mortgageAnnual),
    mortgageYearsLeft:
      template.housing === "mortgage" ? template.mortgageYearsLeft : base.mortgageYearsLeft,
    children,
    childAnnualCost: localiseFromGbp(region, costs.childAnnual),
    currentPot: localiseFromGbp(region, template.potGbp),
    annualContribution: localiseFromGbp(region, template.contributionGbp),
    carMonthly: localiseFromGbp(region, template.carMonthlyGbp),
    carYearsLeft: template.carMonthlyGbp > 0 ? template.carYearsLeft : base.carYearsLeft,
    /*
      The glide is a function of the age somebody stops, so a template that
      moves that age has to move the glide with it. Left alone, "Stop early"
      would be sold a plan that keeps eighty per cent in shares until the
      year the state pension starts, fifteen years after the reader has
      stopped earning.
    */
    glide: defaultGlide(retirementAge),
  };
}

/**
 * WHICH POT A FIRST VISIT OPENS ON, WHEN THE READER HAS NOT CHOSEN A LIFE.
 *
 * Two features arrived in this room within an hour of each other and both
 * were right. One opens the room on a plausible life rather than on zeroes,
 * because a page whose every figure is zero reads as a verdict on somebody
 * who has typed nothing. The other starts the pot on what the reader
 * actually holds, which is the one thing this module can do that a
 * spreadsheet cannot. They merged cleanly and disagreed: the pre-fill only
 * ever wrote into an untouched zero, and the opening template's pot is not
 * zero, so a reader with real holdings was shown a made-up figure instead
 * and the better feature was silently dead for exactly the person it was
 * written for.
 *
 * A FACT BEATS A GUESS. The template exists to answer the things nobody can
 * know about this reader; their pot is the one thing this app does know, so
 * it wins whenever there is one.
 *
 * A TEMPLATE THE READER PRESSED IS NOT THIS CASE and must not call here. A
 * press is a deliberate request for that life, and its pot is part of the
 * shape: "Nearly there" carrying somebody's real two thousand pounds is not
 * nearly there, and the tuned arithmetic behind every one of these lives
 * collapses. The field's own note offers the real figure as one press, which
 * is the right weight for a life somebody chose.
 */
export function openingPot(
  templatePot: number,
  portfolioValue: number | null
): number {
  return portfolioValue != null && portfolioValue > 0
    ? Math.round(portfolioValue)
    : templatePot;
}
