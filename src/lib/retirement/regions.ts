/**
 * WHERE YOU LIVE IS THE FIRST INPUT, AND EVERY FIGURE HERE IS APPROXIMATE
 * AND EDITABLE ON THE PAGE.
 *
 * Retirement arithmetic is the same everywhere and retirement *numbers* are
 * not. A basket of goods that costs GBP 6,500 a year in Britain costs
 * something else in Tallinn and something else again in Zurich, the state
 * hands you a different amount at a different age, and the age you may
 * touch a private pension is set by a parliament rather than by you. A
 * calculator that quietly assumes one country is a calculator that is
 * wrong for everybody else while looking authoritative.
 *
 * Three rules this file keeps, in order of how much they cost when broken.
 *
 * ONE. NOTHING HERE IS PRESENTED AS PRECISE. Each figure is the best
 * public number this repository could name, it is a year or two old the
 * day it is read, and it sits behind an input the reader can change. The
 * product rule that nothing is stated as fact the reader cannot check is
 * met by naming the scheme and the source beside every one of them, not by
 * pretending the number is exact.
 *
 * TWO. THE LIVING STANDARDS ARE DERIVED, NEVER TYPED PER COUNTRY. There is
 * one published basket, the UK's, and every other country's is that basket
 * moved by a price level and a stated exchange rate. A table of 23
 * hand-typed baskets would be 23 numbers nobody can check and which drift
 * apart the first time one of them is edited. `livingStandardFor` shows
 * its whole working, and `regions.test.ts` reproduces it.
 *
 * THREE. THE EXCHANGE RATES ARE FIXED REFERENCE RATES, NOT LIVE ONES.
 * A retirement plan is a thirty year arithmetic and re-pricing its inputs
 * every fifteen seconds because the pound moved would be noise dressed as
 * precision. The rate and the month it was taken are both recorded, so a
 * reader who thinks it is stale can see exactly how stale and change it.
 */

/** The three published UK standards, used as the shape for every region. */
export type LivingStandard = "minimum" | "moderate" | "comfortable";

export type Household = "single" | "couple";

export const LIVING_STANDARDS: readonly LivingStandard[] = [
  "minimum",
  "moderate",
  "comfortable",
];

/**
 * The UK baseline, shaped by Pensions UK (formerly the PLSA) Retirement
 * Living Standards, 2023/24 edition, outside London, and then reset by
 * Martin to what these three tiers actually cost a person day to day: the
 * published figures priced in a car at "moderate" and up, which is exactly
 * the double-count `plan.ts` guards against everywhere else, since a car
 * is its own dial (`carMonthly`) a reader may turn off. Reset to roughly
 * 400/800/1,400 a month per person, GBP, and moved onto every other
 * region from there.
 *
 * Two properties of these figures matter more than the figures themselves
 * and are repeated on the page, because a reader who misses either will
 * plan for the wrong number. They are **after tax**, so they are what
 * lands in your account rather than what you draw. And they **exclude
 * both housing and a car** — nothing here assumes a home owned outright
 * or a car in the driveway, since both are separate dials a reader may
 * set to zero. Rent, any mortgage still running, and a car are added
 * separately in `plan.ts` and the page says so.
 *
 * The couple figure is NOT the published ratio scaled onto the new
 * singles number. The PLSA's own couple-to-single ratios (roughly 1.4 to
 * 1.6) are doing most of their work through housing, which two people
 * share almost entirely; strip housing and a car out, as this basket now
 * does, and what is left (food, going out, health, the rest of daily
 * life) is mostly spent per person. So a couple here is single times
 * roughly 1.8, a modest saving over two singles rather than the housing-
 * sized one the original ratio implied.
 */
export const UK_LIVING_STANDARDS: Record<
  LivingStandard,
  Record<Household, number>
> = {
  minimum: { single: 3_200, couple: 5_800 },
  moderate: { single: 6_500, couple: 11_700 },
  comfortable: { single: 11_300, couple: 20_300 },
};

export const UK_STANDARDS_SOURCE =
  "Shaped by Pensions UK (formerly PLSA) Retirement Living Standards, 2023/24 edition, outside London, reset to a living cost with no housing and no car in any of the three. After tax.";

/**
 * What each standard buys, in plain terms. A reader choosing between three
 * words needs to know what the words mean, and "moderate" means nothing
 * on its own. None of the three includes a car or a home — both are set
 * with their own dials, so a figure here never counts a car twice.
 */
export const STANDARD_BLURB: Record<LivingStandard, string> = {
  minimum:
    "Every basic need covered with a little left for fun: a holiday in your own country, eating out about once a month. No home, no car; both are set with their own dials.",
  moderate:
    "More security and more choice: a foreign holiday once a year, eating out a few times a month. No home, no car; both are set with their own dials.",
  comfortable:
    "Room for spontaneity: more holidays, more spent on eating out and going out. No home, no car; both are set with their own dials.",
};

/** The one-word name, for a heading or a tab. */
export const STANDARD_LABEL: Record<LivingStandard, string> = {
  minimum: "Minimum",
  moderate: "Moderate",
  comfortable: "Comfortable",
};

export type RegionId = string;

export type Region = {
  id: RegionId;
  /** The country, in the reader's words. */
  name: string;
  /** ISO 4217. `currency()` formats from this. */
  currency: string;
  /**
   * Units of this currency per one pound, the reference rate used to move
   * the UK basket into local money. Fixed on purpose. See the file note.
   */
  perGbp: number;
  /**
   * What the same basket of goods costs here, with the UK at 100. The
   * OECD publishes this as a comparative price level for actual individual
   * consumption; these are rounded and a year or so behind.
   */
  priceLevel: number;
  /** Gross annual state pension, in local money, for one person. */
  statePensionAnnual: number;
  /** The scheme it comes from, so the figure can be looked up. */
  statePensionSource: string;
  /** The age it starts. Where a country is mid-reform, the settled age. */
  statePensionAge: number;
  /**
   * The earliest age a private or workplace pension can be touched, where
   * the country sets one. `null` where there is no separate access age and
   * savings are simply savings. This is what creates the years an early
   * retiree has to cover out of ordinary savings, which `plan.ts` calls
   * the bridge.
   */
  privatePensionAge: number | null;
  /** Long-run inflation, which in practice is the central bank's target. */
  inflationPct: number;
  /**
   * Published further years of life at 65, for a man and for a woman, on a
   * period basis.
   *
   * This is the one longevity statistic every country publishes and that
   * anybody can look up, which is exactly why the survival curve is solved
   * from it rather than from a table of coefficients nobody could check.
   * Feed in a number a reader can verify, get back a whole curve. See
   * `longevity.ts` for what is done with it.
   */
  e65Male: number;
  e65Female: number;
};

/*
  The rates were taken together in September 2026 so they are consistent
  with each other, which matters more here than any one of them being
  today's: every basket is derived through them, so a mixed set would make
  two countries incomparable for a reason nothing on the page explains.
*/
export const FX_REFERENCE_MONTH = "September 2026";

/*
  Ordered by how likely a reader of this app is to live there rather than
  alphabetically, so the common cases are reachable without scrolling a
  long select. The list is a list of places, never a ranking of them.
*/
export const REGIONS: readonly Region[] = [
  {
    id: "GB",
    name: "United Kingdom",
    currency: "GBP",
    perGbp: 1,
    priceLevel: 100,
    statePensionAnnual: 11_973,
    statePensionSource: "New State Pension, full rate, 2025/26",
    statePensionAge: 67,
    privatePensionAge: 57,
    inflationPct: 2,
    e65Male: 18.5,
    e65Female: 21.0,
  },
  {
    id: "US",
    name: "United States",
    currency: "USD",
    perGbp: 1.35,
    priceLevel: 110,
    statePensionAnnual: 23_700,
    statePensionSource: "Social Security, average retired worker benefit, 2025",
    statePensionAge: 67,
    privatePensionAge: 60,
    inflationPct: 2,
    e65Male: 18.2,
    e65Female: 20.7,
  },
  {
    id: "EE",
    name: "Estonia",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 76,
    statePensionAnnual: 9_400,
    statePensionSource: "Average old-age pension, 2025",
    statePensionAge: 65,
    privatePensionAge: 55,
    inflationPct: 2,
    e65Male: 16.3,
    e65Female: 21.3,
  },
  {
    id: "DE",
    name: "Germany",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 100,
    statePensionAnnual: 21_200,
    statePensionSource:
      "Gesetzliche Rentenversicherung, 45 years at average earnings",
    statePensionAge: 67,
    privatePensionAge: 62,
    inflationPct: 2,
    e65Male: 18.0,
    e65Female: 21.2,
  },
  {
    id: "FR",
    name: "France",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 99,
    statePensionAnnual: 18_000,
    statePensionSource: "Regime general, average retirement pension",
    statePensionAge: 64,
    privatePensionAge: 62,
    inflationPct: 2,
    e65Male: 19.9,
    e65Female: 23.6,
  },
  {
    id: "NL",
    name: "Netherlands",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 103,
    statePensionAnnual: 18_000,
    statePensionSource: "AOW, single person, gross",
    statePensionAge: 67,
    privatePensionAge: 62,
    inflationPct: 2,
    e65Male: 18.9,
    e65Female: 20.9,
  },
  {
    id: "IE",
    name: "Ireland",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 113,
    statePensionAnnual: 15_044,
    statePensionSource: "State Pension (Contributory), full rate, 2025",
    statePensionAge: 66,
    privatePensionAge: 50,
    inflationPct: 2,
    e65Male: 19.8,
    e65Female: 22.2,
  },
  {
    id: "ES",
    name: "Spain",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 83,
    statePensionAnnual: 20_200,
    statePensionSource: "Average contributory retirement pension, 14 payments",
    statePensionAge: 67,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 19.8,
    e65Female: 23.7,
  },
  {
    id: "IT",
    name: "Italy",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 89,
    statePensionAnnual: 16_000,
    statePensionSource: "INPS, average old-age pension",
    statePensionAge: 67,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 19.9,
    e65Female: 22.7,
  },
  {
    id: "PT",
    name: "Portugal",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 77,
    statePensionAnnual: 9_400,
    statePensionSource: "Seguranca Social, average old-age pension",
    statePensionAge: 66,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 19.3,
    e65Female: 22.6,
  },
  {
    id: "AT",
    name: "Austria",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 101,
    statePensionAnnual: 22_400,
    statePensionSource: "Average old-age pension, 14 payments",
    statePensionAge: 65,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 18.8,
    e65Female: 21.7,
  },
  {
    id: "BE",
    name: "Belgium",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 102,
    statePensionAnnual: 17_000,
    statePensionSource: "Average employee retirement pension",
    statePensionAge: 66,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 19.1,
    e65Female: 22.0,
  },
  {
    id: "FI",
    name: "Finland",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 105,
    statePensionAnnual: 21_600,
    statePensionSource: "Average total pension, earnings related plus national",
    statePensionAge: 65,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 18.7,
    e65Female: 22.2,
  },
  {
    id: "LV",
    name: "Latvia",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 72,
    statePensionAnnual: 6_600,
    statePensionSource: "Average old-age pension, 2025",
    statePensionAge: 65,
    privatePensionAge: 55,
    inflationPct: 2,
    e65Male: 14.9,
    e65Female: 19.8,
  },
  {
    id: "LT",
    name: "Lithuania",
    currency: "EUR",
    perGbp: 1.15,
    priceLevel: 70,
    statePensionAnnual: 7_200,
    statePensionSource: "Average old-age pension, 2025",
    statePensionAge: 65,
    privatePensionAge: 55,
    inflationPct: 2,
    e65Male: 15.4,
    e65Female: 20.3,
  },
  {
    id: "CH",
    name: "Switzerland",
    currency: "CHF",
    perGbp: 1.07,
    priceLevel: 145,
    statePensionAnnual: 30_240,
    statePensionSource: "AHV, maximum single pension, 2025",
    statePensionAge: 65,
    privatePensionAge: 58,
    inflationPct: 1,
    e65Male: 20.4,
    e65Female: 23.0,
  },
  {
    id: "SE",
    name: "Sweden",
    currency: "SEK",
    perGbp: 12.7,
    priceLevel: 102,
    statePensionAnnual: 192_000,
    statePensionSource: "Allman pension, average total",
    statePensionAge: 66,
    privatePensionAge: 55,
    inflationPct: 2,
    e65Male: 20.2,
    e65Female: 22.4,
  },
  {
    id: "NO",
    name: "Norway",
    currency: "NOK",
    perGbp: 12.6,
    priceLevel: 125,
    statePensionAnnual: 280_000,
    statePensionSource: "Folketrygden, average old-age pension",
    statePensionAge: 67,
    privatePensionAge: 62,
    inflationPct: 2,
    e65Male: 19.8,
    e65Female: 21.9,
  },
  {
    id: "DK",
    name: "Denmark",
    currency: "DKK",
    perGbp: 8.6,
    priceLevel: 117,
    statePensionAnnual: 92_000,
    statePensionSource: "Folkepension, single, base plus supplement",
    statePensionAge: 67,
    privatePensionAge: 63,
    inflationPct: 2,
    e65Male: 18.7,
    e65Female: 21.3,
  },
  {
    id: "PL",
    name: "Poland",
    currency: "PLN",
    perGbp: 4.9,
    priceLevel: 60,
    statePensionAnnual: 44_000,
    statePensionSource: "ZUS, average old-age pension",
    statePensionAge: 65,
    privatePensionAge: 60,
    inflationPct: 2.5,
    e65Male: 16.3,
    e65Female: 20.3,
  },
  {
    id: "CZ",
    name: "Czechia",
    currency: "CZK",
    perGbp: 28.2,
    priceLevel: 68,
    statePensionAnnual: 250_000,
    statePensionSource: "Average old-age pension, 2025",
    statePensionAge: 65,
    privatePensionAge: 60,
    inflationPct: 2,
    e65Male: 16.9,
    e65Female: 20.6,
  },
  {
    id: "CA",
    name: "Canada",
    currency: "CAD",
    perGbp: 1.86,
    priceLevel: 100,
    statePensionAnnual: 19_500,
    statePensionSource: "CPP average plus Old Age Security, 2025",
    statePensionAge: 65,
    privatePensionAge: null,
    inflationPct: 2,
    e65Male: 19.4,
    e65Female: 22.2,
  },
  {
    id: "AU",
    name: "Australia",
    currency: "AUD",
    perGbp: 1.89,
    priceLevel: 113,
    statePensionAnnual: 29_900,
    statePensionSource: "Age Pension, single, maximum rate, 2025",
    statePensionAge: 67,
    privatePensionAge: 60,
    inflationPct: 2.5,
    e65Male: 20.0,
    e65Female: 22.7,
  },
];

export const DEFAULT_REGION_ID = "US";

/*
  An unrecognised id falls back to `DEFAULT_REGION_ID`, never to whichever
  region happens to sit first in the list above. Those used to be the same
  region (GB), so this fallback and the one-time default were one bug wearing
  two names: a plan saved before `regionId` existed, or a blob with the field
  dropped by hand, reached `sanitizeInputs` with no `regionId` at all and was
  silently read as British, in the same way a brand-new reader with no plan
  yet used to be. `REGIONS[0]` is one line further down only as a backstop
  for a `DEFAULT_REGION_ID` that has been mistyped, which is a bug in this
  file rather than something a reader's data can trigger.
*/
export function regionById(id: string | null | undefined): Region {
  const found = REGIONS.find((r) => r.id === id);
  if (found) return found;
  return REGIONS.find((r) => r.id === DEFAULT_REGION_ID) ?? REGIONS[0];
}

/**
 * Round a converted local-money figure to a step sized to its own
 * magnitude, so the rounding never claims more precision than the figure
 * it came from has, in either direction. A five-figure living standard
 * rounded to the nearest hundred is honest; a few-hundred car payment
 * rounded the same way moves it by a quarter, which is what a hand-typed
 * `Math.round(local / 100) * 100` did to the UK's own GBP 380 car anchor,
 * printing the field's own default as 400 a page after the note beside it
 * named 380. One shared step, used everywhere a UK figure is moved into
 * another region's money, so the two cannot say two different things.
 */
function roundToLocalStep(local: number): number {
  if (!Number.isFinite(local) || local <= 0) return 0;
  const step = local > 100_000 ? 1_000 : local < 1_000 ? 10 : 100;
  return Math.round(local / step) * step;
}

/**
 * The UK basket moved into another country's prices and money.
 *
 * Rounded to the nearest hundred, because the input it came from is a
 * survey of what people say a decent life costs and printing it to the
 * pound would claim a precision the research does not have.
 */
export function livingStandardFor(
  region: Region,
  standard: LivingStandard,
  household: Household
): number {
  const base = UK_LIVING_STANDARDS[standard][household];
  const local = base * (region.priceLevel / 100) * region.perGbp;
  return roundToLocalStep(local);
}

/** Every standard for a region, in the order they are shown. */
export function livingStandardsFor(
  region: Region,
  household: Household
): Record<LivingStandard, number> {
  return {
    minimum: livingStandardFor(region, "minimum", household),
    moderate: livingStandardFor(region, "moderate", household),
    comfortable: livingStandardFor(region, "comfortable", household),
  };
}

/**
 * The state pension a household actually collects, which is two of them for
 * a couple.
 *
 * The published rate is per person, and the spending baskets are per
 * household: a couple's "moderate" is one basket covering two people. So a
 * couple read against a single person's pension is short by a whole
 * pension, which at a three per cent withdrawal rate is roughly four
 * hundred thousand pounds of pot they do not need. That is not a rounding
 * error, it is the largest single mistake this module could make, and it
 * lands on exactly the reader most likely to be planning seriously.
 *
 * It is a DEFAULT rather than a rule. Only one of a couple may have a full
 * record, and plenty of people have gaps in theirs, so the figure stays a
 * field the reader owns and this only decides what is in it before they
 * touch it.
 */
export function statePensionFor(region: Region, household: Household): number {
  return region.statePensionAnnual * (household === "couple" ? 2 : 1);
}

/**
 * A UK figure ported to a region, for the costs that are not part of the
 * retirement baskets: a child, a car, a year of rent. Same arithmetic, so
 * a reader who has understood one has understood all of them.
 */
export function localiseFromGbp(region: Region, gbp: number): number {
  const local = gbp * (region.priceLevel / 100) * region.perGbp;
  return roundToLocalStep(local);
}

/**
 * UK anchors for the costs a retirement basket leaves out, each with the
 * study it came from. They are ported to the reader's region by the
 * function above and every one of them is editable on the page.
 */
export const UK_COST_ANCHORS = {
  /**
   * Child Poverty Action Group, Cost of a Child 2024: roughly GBP 166,000
   * for a couple to age 18, which is about GBP 9,200 a year, and that is
   * before childcare and before housing. The US equivalent, the USDA's
   * Expenditures on Children by Families, lands in the same place once its
   * 2015 dollars are brought forward, which is why one anchor ported by
   * price level is honest rather than lazy.
   */
  childAnnual: 9_200,
  childSource:
    "Child Poverty Action Group, Cost of a Child 2024. Before childcare and before housing.",
  /** Roughly the average UK personal contract or lease payment. */
  carMonthly: 380,
  carSource: "Typical monthly car lease or finance payment",
  /** A rough national average rent, which varies more than any other line here. */
  rentMonthly: 1_100,
  rentSource: "Rough national average rent for one home",
  /** Roughly the average UK mortgage repayment, annualised. */
  mortgageAnnual: 12_000,
  mortgageSource: "Typical monthly mortgage repayment, annualised",
} as const;

/**
 * WHAT A CHILD, A CAR AND A MORTGAGE COST AT EACH LIVING STANDARD.
 *
 * `UK_COST_ANCHORS` above is one figure per line, which is honest about
 * what this app could find a study for and wrong about what a reader
 * actually spends: somebody living the minimum standard is not paying the
 * same for a child as somebody living comfortably, and the flat anchor
 * quietly assumed they were, on every one of the three lines a reader is
 * most likely to argue with.
 *
 * There is no second study that prices a child, a car or a mortgage
 * separately at each of the three published standards, so this does not
 * invent one. It scales the one anchor this file can cite by the same
 * ratio the published minimum/moderate/comfortable baskets already stand
 * in for a single person (`UK_LIVING_STANDARDS`), which is the same
 * derived-not-typed rule `livingStandardFor` runs on. A car is zero at
 * the minimum standard for a stronger reason than arithmetic: the
 * minimum standard is itself defined without one (see `STANDARD_BLURB`),
 * so scaling the anchor down instead of zeroing it would still be
 * charging for a car nobody in that basket owns.
 *
 * Every figure this returns is still one field away from being
 * overwritten with the reader's own, which is the actual answer to "a
 * child does not cost that here": type the number that is true for you.
 */
export function costAnchorsForStandard(standard: LivingStandard): {
  childAnnual: number;
  carMonthly: number;
  mortgageAnnual: number;
} {
  const ratio =
    UK_LIVING_STANDARDS[standard].single / UK_LIVING_STANDARDS.moderate.single;
  return {
    childAnnual: Math.round((UK_COST_ANCHORS.childAnnual * ratio) / 50) * 50,
    carMonthly:
      standard === "minimum"
        ? 0
        : Math.round((UK_COST_ANCHORS.carMonthly * ratio) / 10) * 10,
    mortgageAnnual: Math.round((UK_COST_ANCHORS.mortgageAnnual * ratio) / 100) * 100,
  };
}
