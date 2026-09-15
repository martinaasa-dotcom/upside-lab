/**
 * WHAT THE MONEY EARNS, IN REAL TERMS, AND WHY EVERY FIGURE IN THIS MODULE
 * IS IN TODAY'S MONEY.
 *
 * The single most common way a retirement projection lies to somebody is by
 * answering in future money. A calculator that says you will have two
 * million at 65 has said almost nothing, because two million in forty years
 * buys what nine hundred thousand buys now, and the reader has no way to
 * make that adjustment in their head while looking at a number with six
 * zeros on it. So everything in this module compounds *real* returns, the
 * return after inflation, and every figure on screen is in money the reader
 * can price against their own weekly shop. Inflation is not ignored here.
 * It is taken off at the start rather than added on at the end.
 *
 * THE NUMBERS ARE THE LONG RUN GLOBAL ONES, NOT AMERICAN ONES. A century of
 * American equity returns is the most flattering series in the dataset and
 * the most quoted, and using it is survivor bias with a citation. The
 * Dimson, Marsh and Staunton series covers most markets from 1900, including
 * the ones that went to zero, and the world index is what an ordinary global
 * tracker actually tries to hold. That is why the defaults here are lower
 * than the ten per cent the American figure produces, and the gap is the
 * point rather than pessimism.
 *
 * FEES COME OFF THE RETURN AND THEY ARE NOT A ROUNDING ERROR. Everything
 * else on this page is a forecast. The fee is the one number in the whole
 * model that is known in advance and is entirely in the reader's hands, and
 * over forty years the difference between 0.15% and 1.5% is most of a
 * decade of retirement. It gets its own input for that reason.
 */

import {
  COMPOUND_CASH_YIELD_ANNUAL_PCT,
  COMPOUND_INFLATION_ANNUAL_PCT,
} from "@/lib/compound-play";
import { blendedExpectedAnnualReturn } from "@/lib/forecast-conviction";
import { finiteNumber } from "@/lib/money";

/**
 * Real returns, after inflation, from the long run global series. The
 * source is stated on the page beside each one.
 */
export const REAL_RETURN_ASSUMPTIONS = {
  /** World equities, real, 1900 to date. A global tracker's own benchmark. */
  equityPct: 5.1,
  /** World government bonds, real, over the same period. */
  bondPct: 1.7,
  /** Deposits and bills, real. Roughly nothing, which is the finding. */
  cashPct: 0.9,
} as const;

export const RETURNS_SOURCE =
  "Global Investment Returns Yearbook, world indices 1900 to date, after inflation. Global shares 5.1% a year, government bonds 1.7%, cash 0.9%.";

/** A plain global index fund on a cheap platform, all in. */
export const DEFAULT_FEE_PCT = 0.25;

/**
 * WHAT A PLAN ASSUMES CASH EARNS WHEN THE READER IS NOT INVESTING: NOTHING,
 * AFTER INFLATION.
 *
 * The long run figure above is 0.9% real and it is the honest average. It is
 * the wrong number to PLAN on, and the reason is the same one that decides
 * the withdrawal rate a few files over: everything else in this module is
 * priced at its bad case, so cash has to be too, or the comparison is an
 * expected case standing beside a worst case and it inverts. Measured
 * before this existed, the Assumptions preset priced cash at 0.9% and came
 * out needing LESS than investing, while the grid zeroed it and came out
 * needing more, for the same reader, on the same page.
 *
 * Cash's bad case is not a crash, it is a decade of inflation eating the
 * nominal return, and that is exactly zero real. So the grid and the
 * "Nothing invested" preset both use this, from one constant, and the panel
 * says which figure it is using rather than leaving the reader to wonder
 * why two screens disagree. A reader who would rather plan on the long run
 * average can still type it into the field.
 */
export const CAUTIOUS_CASH_REAL_PCT = 0;

/**
 * A band of the reader's life and what share of it is in shares.
 *
 * The rest is assumed to be bonds. Two bands is the ordinary shape, more
 * than shares and bonds is a level of detail nothing downstream could use
 * honestly, and one number for a whole life is what every other calculator
 * does and is the thing this exists to replace: somebody who is all shares
 * at 31 and half bonds at 70 is not earning one average return, and the
 * order those two stretches arrive in changes the answer.
 */
export type GlideSegment = {
  /** The age this mix starts at. The first segment starts at any age. */
  fromAge: number;
  /** 0 to 100. The remainder is bonds. */
  equityPct: number;
};

/**
 * What a plain long term investor does and what the research supports:
 * all in shares while the horizon is long, easing into bonds over the
 * decade before stopping work, and staying there. The last band matters
 * more than it looks, because a pot that has to last forty years after
 * retirement cannot be in cash: the bond and cash figures above are the
 * argument for that, not an opinion about markets.
 */
export function defaultGlide(retirementAge: number): GlideSegment[] {
  const ease = Math.max(25, Math.round(retirementAge) - 10);
  return [
    { fromAge: 0, equityPct: 100 },
    { fromAge: ease, equityPct: 80 },
    { fromAge: Math.round(retirementAge), equityPct: 60 },
  ];
}

/** Everything in shares, forever. Offered because some people do it. */
export function allEquityGlide(): GlideSegment[] {
  return [{ fromAge: 0, equityPct: 100 }];
}

/** No investing at all. The comparison that makes the rest legible. */
export function cashOnlyGlide(): GlideSegment[] {
  return [{ fromAge: 0, equityPct: 0 }];
}

export type ReturnAssumptions = {
  equityPct: number;
  bondPct: number;
  cashPct: number;
  feePct: number;
};

export const DEFAULT_RETURN_ASSUMPTIONS: ReturnAssumptions = {
  equityPct: REAL_RETURN_ASSUMPTIONS.equityPct,
  bondPct: REAL_RETURN_ASSUMPTIONS.bondPct,
  cashPct: REAL_RETURN_ASSUMPTIONS.cashPct,
  feePct: DEFAULT_FEE_PCT,
};

/** The share held in shares at an age, from the bands. */
export function equityShareAt(age: number, glide: GlideSegment[]): number {
  if (glide.length === 0) return 100;
  const sorted = [...glide].sort((a, b) => a.fromAge - b.fromAge);
  let current = sorted[0].equityPct;
  for (const seg of sorted) {
    if (age >= seg.fromAge) current = seg.equityPct;
    else break;
  }
  return Math.min(100, Math.max(0, finiteNumber(current, 100)));
}

/**
 * The real return at an age, as a fraction, after fees.
 *
 * A holding of nothing but bonds is still an invested holding, so the cash
 * figure only ever applies where the reader has said they are not investing
 * at all. Blending cash in at every mix would quietly make every plan worse
 * than the mix the reader chose.
 */
export function realReturnAt(
  age: number,
  glide: GlideSegment[],
  assumptions: ReturnAssumptions
): number {
  const equity = equityShareAt(age, glide) / 100;
  const eq = finiteNumber(assumptions.equityPct, 0) / 100;
  const bond = finiteNumber(assumptions.bondPct, 0) / 100;
  const cash = finiteNumber(assumptions.cashPct, 0) / 100;
  const fee = Math.max(0, finiteNumber(assumptions.feePct, 0)) / 100;
  /*
    NOBODY PAYS A PLATFORM CHARGE ON A SAVINGS ACCOUNT, so the fee does not
    come off a cash-only plan.

    Left in, it made the module hold two different definitions of "cash" at
    once: the grid's column zeroed the fee and the Assumptions preset did
    not, so the same reader got one answer from the table and another from
    the switch, with nothing on the page explaining the gap. Two systems
    that must agree and do not is worse than either being wrong.
  */
  if (glideIsCashOnly(glide)) return cash;
  return equity * eq + (1 - equity) * bond - fee;
}

/**
 * WHAT THE READER'S OWN HOLDINGS ARE EXPECTED TO EARN, TURNED INTO A REAL
 * RETURN.
 *
 * The Compound tab already does the one useful thing here: it blends what
 * each ticker's sector has typically returned into a single rate, weighted
 * by what the reader actually holds (`blendedExpectedAnnualReturn`). Making
 * this module recompute that idea from a second set of assumptions is how
 * two screens looking at the same portfolio start disagreeing, so this
 * calls the same function rather than inventing a sibling.
 *
 * It comes back NOMINAL where this whole module is real, so it is
 * converted once, by the Fisher relation, using the same inflation figure
 * Compound already assumes for its own "what this buys" comparison
 * (`COMPOUND_INFLATION_ANNUAL_PCT`) rather than asking for a second
 * inflation number nobody typed in.
 *
 * A PORTFOLIO'S OWN BLEND IS A FIVE YEAR VIEW, AND A RETIREMENT PLAN IS A
 * FORTY YEAR ONE, SO IT IS CAPPED.
 *
 * `blendedExpectedAnnualReturn` reads the forecast growth assumptions,
 * which are deliberately about a specific stretch of years: the rate on an
 * AI infrastructure name is an argument about a build cycle that the
 * ladder itself only claims to describe over the forecast window. Nothing
 * about it survives being compounded for a lifetime, and this module
 * compounds everything it is given for a lifetime.
 *
 * Measured when the per-name rates landed: an all-NBIS portfolio blended
 * to **41.5% nominal, which reached this page as 37.4% REAL**, against the
 * 5.1% the audited world-index figure above uses. Over forty years those
 * differ by a factor in the hundreds of thousands, so the page would have
 * told that reader they could stop working immediately. An AI-heavy mix
 * landed at 33% real and an ordinary mixed portfolio at 12.8%.
 *
 * The comment that used to sit here said this was "an offer, never a
 * default", which stopped being true when `RetirementSheet` began applying
 * it as the opening equity assumption for anybody arriving with a
 * portfolio. That is a reasonable thing for it to do and it is why the cap
 * is not optional: an offer a reader chooses is theirs, and a default
 * nobody chose has to be defensible on its own.
 *
 * `PORTFOLIO_RATE_CEILING_PCT` is real, not nominal. Ten per cent real is
 * already about double the 5.1% above and half again the best sustained
 * real return any major market has managed over a century, so it is a
 * ceiling on what this page will assume rather than a figure anybody is
 * predicting.
 *
 * **It binds on more than the extreme cases, and that is intended rather
 * than a side effect.** Measured across portfolio shapes, real, after the
 * cap: all NBIS 37.4 to 10, an AI-heavy mix 33.0 to 10, and an ordinary
 * growth-tilted book of one chip name, one large software name and half in
 * an index fund 12.8 to 10. Left alone: big tech plus an index fund at
 * 8.5, an index fund alone at 6.8, and an index fund beside a laggard at
 * 6.0, which is under the index because the per-name table is allowed to
 * go down. So anything meaningfully tilted toward growth is clipped, and
 * the reader can raise it themselves if they disagree.
 *
 * It is a ceiling rather than a taper because a reader can see and edit
 * the number either way, and a silently faded rate is one they cannot
 * check.
 */
export const PORTFOLIO_RATE_CEILING_PCT = 10;
export function portfolioRealReturnPct(
  holdings: Array<{ ticker: string; value: number }>,
  cashBalance: number
): number {
  /*
    The cash yield is Compound's own assumption, not a second one typed in
    here, so the blend this reads is exactly the one "Your rate" on that tab
    would show for the same holdings.
  */
  const nominal = blendedExpectedAnnualReturn(holdings, {
    balance: cashBalance,
    annualReturnPct: COMPOUND_CASH_YIELD_ANNUAL_PCT,
  });
  const inflation = finiteNumber(COMPOUND_INFLATION_ANNUAL_PCT, 0) / 100;
  const real = (1 + nominal) / (1 + inflation) - 1;
  if (!Number.isFinite(real)) return REAL_RETURN_ASSUMPTIONS.equityPct;
  return Math.min(PORTFOLIO_RATE_CEILING_PCT, Math.round(real * 1000) / 10);
}

/** Nothing in shares at any age, which is the one case that means cash. */
export function glideIsCashOnly(glide: GlideSegment[]): boolean {
  return glide.length > 0 && glide.every((s) => s.equityPct <= 0);
}

/**
 * The one blended real return that a whole plan behaves like, used where a
 * single figure has to be printed. It is the average over the years the
 * money is actually invested, weighted by nothing, because weighting it by
 * balance would make the printed rate disagree with the rate the simulation
 * used and a reader who noticed would be right to stop trusting the page.
 */
export function averageRealReturn(
  fromAge: number,
  toAge: number,
  glide: GlideSegment[],
  assumptions: ReturnAssumptions
): number {
  const from = Math.floor(fromAge);
  const to = Math.max(from + 1, Math.ceil(toAge));
  let total = 0;
  let n = 0;
  for (let age = from; age < to; age++) {
    total += realReturnAt(age, glide, assumptions);
    n++;
  }
  return n > 0 ? total / n : 0;
}
