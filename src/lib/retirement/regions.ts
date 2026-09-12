/**
 * WHERE YOU LIVE IS THE FIRST INPUT, AND EVERY FIGURE HERE IS APPROXIMATE
 * AND EDITABLE ON THE PAGE.
 *
 * Retirement arithmetic is the same everywhere and retirement *numbers* are
 * not. A basket of goods that costs GBP 31,700 a year in Britain costs
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
 * The UK baseline, from Pensions UK (formerly the PLSA) Retirement Living
 * Standards, 2023/24 edition, outside London.
 *
 * Two properties of these figures matter more than the figures themselves
 * and are repeated on the page, because a reader who misses either will
 * plan for the wrong number. They are **after tax**, so they are what
 * lands in your account rather than what you draw. And they **exclude
 * housing costs**, because the research assumes a home owned outright,
 * which is not most people's retirement. Rent and any mortgage still
 * running are added separately in `plan.ts` and the page says so.
 */
export const UK_LIVING_STANDARDS: Record<
  LivingStandard,
  Record<Household, number>
> = {
  minimum: { single: 13_400, couple: 21_600 },
  moderate: { single: 31_700, couple: 43_900 },
  comfortable: { single: 43_900, couple: 60_600 },
};

export const UK_STANDARDS_SOURCE =
  "Pensions UK (formerly PLSA) Retirement Living Standards, 2023/24 edition, outside London. After tax, and housing costs are not in them.";

/**
 * What each standard buys, in the research's own terms rather than ours.
 * A reader choosing between three words needs to know what the words mean,
 * and "moderate" means nothing on its own.
 */
export const STANDARD_BLURB: Record<LivingStandard, string> = {
  minimum:
    "All your basic needs covered with a little left for fun. A holiday in your own country, eating out about once a month, no car.",
  moderate:
    "More security and more choice. A foreign holiday once a year, eating out a few times a month, and a car.",
  comfortable:
    "Room for spontaneity. More holidays, more spent on eating out and going out, and replacing the car more often.",
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
    e65Male: 17.5,
    e65Female: 20.3,
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
    e65Male: 15.6,
    e65Female: 20.5,
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
    e65Female: 21.1,
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
    e65Male: 19.7,
    e65Female: 23.4,
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
    e65Male: 18.6,
    e65Female: 21.2,
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
    e65Male: 19.0,
    e65Female: 21.6,
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
    e65Male: 19.4,
    e65Female: 23.3,
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
    e65Male: 19.4,
    e65Female: 22.6,
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
    e65Male: 18.1,
    e65Female: 21.7,
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
    e65Male: 18.4,
    e65Female: 21.4,
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
    e65Male: 18.6,
    e65Female: 21.7,
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
    e65Male: 18.3,
    e65Female: 21.9,
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
    e65Male: 13.9,
    e65Female: 18.7,
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
    e65Male: 14.3,
    e65Female: 19.2,
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
    e65Male: 20.0,
    e65Female: 22.8,
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
    e65Male: 19.1,
    e65Female: 21.6,
  },
  {
    id: "NO",
    name: "Norway",
    currency: "NOK",
    perGbp: 13.5,
    priceLevel: 125,
    statePensionAnnual: 280_000,
    statePensionSource: "Folketrygden, average old-age pension",
    statePensionAge: 67,
    privatePensionAge: 62,
    inflationPct: 2,
    e65Male: 19.1,
    e65Female: 21.7,
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
    e65Male: 18.2,
    e65Female: 20.7,
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
    e65Male: 15.6,
    e65Female: 20.0,
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
    e65Male: 16.1,
    e65Female: 19.7,
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
    perGbp: 2.05,
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

export function regionById(id: string | null | undefined): Region {
  const found = REGIONS.find((r) => r.id === id);
  return found ?? REGIONS[0];
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
  if (!Number.isFinite(local) || local <= 0) return 0;
  const step = local > 100_000 ? 1_000 : 100;
  return Math.round(local / step) * step;
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
 * A UK figure ported to a region, for the costs that are not part of the
 * retirement baskets: a child, a car, a year of rent. Same arithmetic, so
 * a reader who has understood one has understood all of them.
 */
export function localiseFromGbp(region: Region, gbp: number): number {
  const local = gbp * (region.priceLevel / 100) * region.perGbp;
  if (!Number.isFinite(local) || local <= 0) return 0;
  return Math.round(local / 100) * 100;
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
} as const;
