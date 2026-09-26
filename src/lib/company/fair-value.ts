/**
 * What the arithmetic says one share might be worth, worked out several
 * different ways, and then blended into one number that shows its working.
 *
 * A price on its own answers nothing. The question a person actually has
 * standing in front of a company is whether the price in front of them is
 * a sensible price, and every honest answer to that is somebody's estimate
 * rather than a fact. So this file does not hand back an answer. It hands
 * back **a list of estimates, each with the assumption it rests on**, and a
 * blend of them, so a reader can see where the number came from and which
 * of the methods disagrees with the rest.
 *
 * Five rules, and they are what keeps this from being a recommendation
 * engine wearing a lab coat.
 *
 * **Every method states its assumption in the reader's own words.** A
 * discounted cash flow is not a fact about a company, it is an opinion
 * about growth and a discount rate expressed as a number. If the assumption
 * cannot be said in one plain sentence, the method does not belong here.
 *
 * **Nothing is dropped for being inconvenient, only for being incoherent.**
 * A method whose answer sits more than three times, or less than a third,
 * of what the others say is not a bearish or bullish opinion, it is
 * arithmetic that has stopped describing this company (a company with
 * almost no profit produces an earnings multiple in the thousands). Those
 * are dropped, said out loud, and counted.
 *
 * **The market is one voice among several and never the whole answer.**
 * Its weight follows how efficiently the company is priced and is capped
 * at 0.45, so the blend is what the market, the analysts and the business
 * itself say together, each at a weight printed beside it. The model's
 * own price path is shown and not counted, because it is grown from
 * today's price and cannot say whether today's price is right.
 *
 * **A thin answer says it is thin.** One method surviving is a guess with
 * a decimal point on it, and the reader is told exactly that rather than
 * shown the same confident number they would get from six.
 *
 * **This is never a target and never advice.** The copy says so, the
 * provenance says so, and no caller may reduce this file's output to a
 * single word like cheap or expensive.
 */
import { currency, percent } from "@/lib/format";
import { MARKET_EARNINGS_MULTIPLE } from "@/lib/company/scale";
import { isCryptoLike, isFundLike, type CompanyFacts } from "@/lib/company/facts";
import { normalizeListedPrice } from "@/lib/listing-currency";

/** Where a method's number came from, which decides how it is labelled. */
export type FairValueMaker = "market" | "arithmetic" | "model";

export type FairValueMethod = {
  id: string;
  /** Ordinary words, never the method's textbook name in the label. */
  name: string;
  maker: FairValueMaker;
  /** The estimate, per share, in the listing's own currency. */
  price: number;
  /** The one assumption it rests on, in a sentence a person can argue with. */
  assumes: string;
  /** How the number was actually reached, in one line. */
  working: string;
  /** Share of the blend before dropping and normalising. */
  weight: number;
  /** Set when the method was dropped, saying why. */
  dropped?: string;
  /**
   * The method named in prose, lowercase, so a sentence can say where a
   * figure came from. "The lowest is $678.92, from the growth multiple" is
   * the answer to the question a reader actually has, where "the lowest
   * estimate on this page" points at the page it is printed on.
   */
  source: string;
};

export type FairValueBlend = {
  /** The blended estimate, or null when nothing survived. */
  price: number | null;
  /** Methods that counted, heaviest first. */
  used: FairValueMethod[];
  /** Methods that ran and were thrown out, with the reason. */
  dropped: FairValueMethod[];
  /** How far apart the surviving methods are, as a fraction of the blend. */
  spread: number | null;
  /**
   * How much this deserves to be leaned on: `thin` is one method, `mixed`
   * is two or three, `broad` is four or more. Never a percentage, because
   * a percentage on a confidence reading is a made-up number.
   */
  confidence: "none" | "thin" | "mixed" | "broad";
};

export type FairValueRead = {
  /**
   * One estimate of what the company is worth TODAY (2026-09-26; it was
   * a twelve month figure, and set against today's price that made every
   * company anybody expects to rise read as below its fair value). The
   * analysts' twelve month target is brought back to today at the
   * company's own required return, and the business method prices ten
   * years back to today by construction. There is deliberately no second
   * headline figure.
   *
   * Every method that survives here is a forward method: an analyst's
   * twelve-month target is forward by definition, a multiple of next
   * year's earnings is forward, and the model's path starts a year out.
   * The "on today's earnings" figure that used to sit beside this was the
   * flat market multiple, and it was the wrong number on every company it
   * was shown for. Two headline figures where only one is defensible is
   * worse than one, because the reader has no way to know which to
   * believe.
   */
  estimate: FairValueBlend;
  /** Today's actual share price, for the comparison the reader wants. */
  spot: number | null;
  /** The estimate against today's price, as a fraction. */
  gap: number | null;
};

function ok(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------------------------------------------------------------------- *
 * The methods. Each returns null rather than guessing at a missing input.
 * ---------------------------------------------------------------------- */

/**
 * What the analysts covering it think it is worth, brought back to today.
 *
 * A published target is where they expect the price to be in twelve
 * months, which is a different number from what the share is worth now:
 * a company correctly priced today is expected to be higher in a year by
 * exactly the return its owners require. Set beside today's price
 * undiscounted, every company anybody expects to rise read as sitting
 * below its fair value, which is the fault that put nearly every holding
 * on a real book in the lower bands at once. So the target is discounted
 * one year at this company's own required return (`requiredReturn`), the
 * same rate the business method uses, and the working says so.
 */
function consensusMethod(f: CompanyFacts): FairValueMethod | null {
  const published = f.analystTargetMean;
  if (!ok(published)) return null;
  const { rate } = requiredReturn(f);
  const target = published / (1 + rate);
  const n = f.analystCount ?? 0;
  /*
    Coverage is the whole quality of this input. One analyst is one
    person's spreadsheet; twenty is a real consensus, and the average of
    twenty is the single most useful outside opinion on this page. So the
    weight moves with the count rather than the number being in or out.
  */
  /*
    Weighted above the rule of thumb beside it, deliberately. Forty-nine
    analysts publishing a target is forty-nine people's work on the actual
    company; the growth multiple is one line of arithmetic on a heuristic.
    Where they disagree the blend should lean on the first, and it did not:
    at the old weights the heuristic carried 36% of the answer and pulled
    Nvidia's estimate $106 above what any analyst had published. The
    heuristic is gone (see `businessMethod`), and the projection that
    replaced it is weighted below a real consensus for the same reason.
  */
  const coverage = n >= 10 ? 0.4 : n >= 3 ? 0.3 : n >= 1 ? 0.16 : 0.1;
  /*
    AND HOW MUCH THEY AGREE, WHICH IS THE ONLY HONEST WAY TO WEIGHT THEM.

    The obvious ask is to weight the analysts themselves: more for the ones
    with a good record or a view you share, less for the ones who are
    structurally cautious. Two reasons it is not done here. The feed
    publishes an average, a high, a low and a count, and no names at all, so
    there is nothing to weight one by. And weighting towards the analysts
    who agree with a house view is that house view wearing somebody else's
    research as a costume: it would reach every reader of this app,
    including one who would take the other side, and it is the same thing
    `MARGUS_PERSONA` had removed from it.

    What is measurable, and is the question underneath, is whether these
    people agree with EACH OTHER. Forty targets clustered inside twenty per
    cent is a consensus and the average of it means something. Forty running
    from half the price to double it is a contested name where the average
    is the midpoint of an argument and describes nobody's actual view, so
    the blend leans on it less. That cuts the weight in both directions at
    once, which is what keeps it a measurement rather than an opinion.
  */
  const spreadRead = analystSpread(f);
  const width = spreadRead?.width ?? null;
  const agreement =
    width === null ? 1 : width >= 1 ? 0.6 : width >= 0.5 ? 0.85 : 1;
  const weight = Math.round(coverage * agreement * 100) / 100;
  const code = f.currency ?? "USD";
  const spread =
    ok(f.analystTargetHigh) && ok(f.analystTargetLow)
      ? ` Their targets run from ${currency(f.analystTargetLow, 2, code)} to ${currency(f.analystTargetHigh, 2, code)}.`
      : "";
  const disagreement =
    agreement < 1
      ? ` That spread is ${percent(width ?? 0, 0)} of the price, so this counts for less than a settled view would.`
      : "";
  return {
    id: "consensus",
    name: "What Wall Street expects",
    source: "the analysts' average",
    maker: "market",
    price: round2(target),
    assumes: `That the ${n > 0 ? `${n} analyst${n === 1 ? "" : "s"} covering this company` : "analysts covering this company"} have it about right.${spread}${disagreement}`,
    working: `The plain average of the twelve-month price targets published by the ${n > 0 ? n : ""} analyst${n === 1 ? "" : "s"} who cover it, ${currency(published, 2, code)}, brought back to today at ${percent(rate, 1)} a year, the return an owner of this company would want for waiting that year.`.replace("  ", " "),
    weight,
  };
}

/*
  THERE IS NO "PRICED LIKE THE AVERAGE COMPANY" METHOD, AND THAT IS THE
  SECOND VALUATION TAKEN OUT OF THIS FILE FOR THE SAME REASON.

  It multiplied a year's earnings by the market's long-run multiple of 20.
  The arithmetic was sound and the premise was not: applied to a company
  growing earnings at 104% a year it asks "what would this be worth if it
  were an average company", and then prints the answer as what the company
  is worth. Measured on AMD it produced $151 a share against a price of
  $478, and it dragged the blended figure at the top of the page down to
  $223, which is not a conservative estimate, it is a wrong one. A page
  carrying a number like that does not read as cautious. It reads as
  fabricated, and it takes the credibility of every honest figure beside
  it down too.

  It is not missed, because the same fact is already on the page in the
  form it is actually true in: the figures panel prints this company's
  multiple next to the market's average as a comparison, which is a
  statement about how the company is priced rather than a claim about what
  it is worth. `impliedGrowth` below carries the other half, the growth
  that price implies.

  The general rule, and it is the one the discounted cash flow broke too:
  a method whose premise does not hold for this company must not appear in
  a blend of what the company is worth. Arithmetic being correct is not
  the same as a method applying.
*/

/*
  WHAT A COMPANY IS WORTH TODAY, READ FROM EVERYTHING THIS APP CAN SEE
  (2026-09-26).

  Three voices, weighted by how much each one knows about this company:

  1. WHAT THE MARKET IS PAYING. The price is not the enemy of a fair value,
     it is the best-informed estimate there is for a company thousands of
     professionals trade every day. It carries what no spreadsheet can:
     Tesla's optionality, Apple's staying power, a regulator's mood. So it
     is a method, labelled, and weighted by how efficiently this company is
     priced: heavily for a trillion-dollar name forty analysts follow,
     lightly for a small company nobody covers, where the price is most
     likely to be wrong and fundamentals have the most to say.

  2. WHAT THE ANALYSTS EXPECT, brought back to today.

  3. THE BUSINESS ITSELF (`businessPath`): ten years of revenue and margin,
     in three cases, priced today and calibrated to what the market pays
     today for an ordinary company. It is the voice that notices a
     company the market has mispriced, and it steps aside, greyed with the
     reason, when it lands more than three times away from the other two,
     because then the numbers have stopped describing this company (a
     company valued on what it might become rather than on what it earns).

  The rule this reverses: until today this file said nothing was ever
  nudged towards today's price. Martin reversed it on 2026-09-26 with the
  argument that the market would not pay $372 for Tesla if it were worth
  $187, and that a fair value stuck in the numbers misses the big picture.
  What keeps it honest is the same thing that keeps every other method
  honest: its weight and its reason are on the page.
*/

/*
  THE BASE RATES, AND WHERE THEY COME FROM.

  Every figure below is read off Aswath Damodaran's public data set of
  January 2026 (pages.stern.nyu.edu/~adamodar, "Margins by Sector (US)"
  and "PE Ratios by Sector (US)", 5,994 US companies). None of them is a
  view of any company; each is what the whole market does, dated, and
  checkable by anybody. Revisit them once a year when the set is
  republished.
*/

/**
 * What the whole US market paid for a dollar of next year's profit in
 * January 2026: aggregate market value over trailing profit of profitable
 * companies (26.56), carried a year forward at the market's own expected
 * growth (13.95%). The business method is scaled so a company with the
 * market's own growth and steady margins is worth exactly this.
 */
export const CURRENT_MARKET_FORWARD_MULTIPLE = 26.56 / 1.1395;

/** The market's expected annual earnings growth over five years, January 2026. */
const MARKET_EXPECTED_GROWTH = 0.1395;

/**
 * Across 92 US industries (banks and insurers left out, where gross margin
 * means nothing), the net margin a typical business keeps rises with its
 * gross margin: a firm-weighted fit of net margin on gross margin gives
 * about -2.7% plus 26.5% of the gross margin. A business keeping 75% of a
 * sale as gross profit ordinarily keeps about 17% of it at the end.
 */
const TYPICAL_NET_FROM_GROSS = { intercept: -0.027, slope: 0.265 };
/** The best industries in that set keep about this much, and nobody keeps more for long. */
const TYPICAL_NET_CEILING = 0.3;

/**
 * The kinds of company whose profit the whole market prices at a
 * structurally different multiple, as a share of the market's own 26.56
 * (aggregate value over trailing profit, January 2026). A bank's profit is
 * made on borrowed money and is valued at about half the market's
 * multiple everywhere in the record; pricing it like an ordinary company
 * doubles it. Only these, because only these are both large groups and
 * far from the market; everything else is priced by its own growth and
 * margin rather than by a label.
 */
const INDUSTRY_MULTIPLE_RATIO: { match: RegExp; ratio: number; said: string }[] = [
  { match: /^Banks/i, ratio: 14.17 / 26.56, said: "banks" },
  { match: /^Insurance - Life/i, ratio: 11.82 / 26.56, said: "life insurers" },
  { match: /^Insurance - Property/i, ratio: 11.78 / 26.56, said: "property insurers" },
];

function industryRatio(f: CompanyFacts): { ratio: number; said: string } | null {
  const industry = f.industry ?? "";
  const hit = INDUSTRY_MULTIPLE_RATIO.find((x) => x.match.test(industry));
  return hit ? { ratio: hit.ratio, said: hit.said } : null;
}

/** How many years of the business are projected before the exit multiple. */
const BUSINESS_YEARS = 10;

/**
 * The revenue growth a mature business settles at, nominal. About what the
 * economy grows at plus inflation.
 */
const MATURE_GROWTH = 0.07;

/** The required return on an ordinary large company, before any risk. */
const BASE_RETURN = 0.09;

/**
 * How much of a year's growth above the mature pace survives into the
 * next, by how much the company sells. Base rates, not a view: very few
 * companies selling hundreds of billions a year grow fast for long, and a
 * company selling a billion often does.
 */
function growthPersistence(revenue: number, growth: number): number {
  const base =
    revenue >= 3e11
      ? 0.55
      : revenue >= 1e11
        ? 0.6
        : revenue >= 2e10
          ? 0.66
          : revenue >= 5e9
            ? 0.74
            : revenue >= 1e9
              ? 0.8
              : 0.85;
  // Hypergrowth at scale is the rarest thing in the record and fades hardest.
  return growth > 0.4 && revenue >= 2e10 ? base * 0.85 : base;
}

/** The return an owner would want, and each reason it is above the base. */
export function requiredReturn(f: CompanyFacts): {
  rate: number;
  why: string[];
} {
  let rate = BASE_RETURN;
  const why: string[] = [];
  const cap = f.marketCap;
  if (ok(cap) && cap < 1e10) {
    rate += 0.015;
    why.push("small");
  } else if (ok(cap) && cap < 5e10) {
    rate += 0.0075;
    why.push("mid-sized");
  }
  const losing =
    (typeof f.epsNextYear === "number" && f.epsNextYear < 0) ||
    (typeof f.profitMargin === "number" && f.profitMargin < 0);
  if (losing) {
    rate += 0.02;
    why.push("not yet profitable");
  }
  if (ok(cap)) {
    const netDebt = ((f.totalDebt ?? 0) - (f.totalCash ?? 0)) / cap;
    if (netDebt > 0.5) {
      rate += 0.015;
      why.push("heavily borrowed");
    } else if (netDebt > 0.2) {
      rate += 0.0075;
      why.push("borrowed");
    }
  }
  if (ok(f.fiftyTwoWeekHigh) && ok(f.fiftyTwoWeekLow)) {
    const swing = f.fiftyTwoWeekHigh / f.fiftyTwoWeekLow;
    if (swing > 3) {
      rate += 0.01;
      why.push("very jumpy");
    } else if (swing > 2) {
      rate += 0.005;
      why.push("jumpy");
    }
  }
  return { rate, why };
}

/** The exit multiple for a company still growing at `growth` in year ten. */
function exitMultiple(growth: number, quality: boolean, peak: boolean): number {
  let pe = MARKET_EARNINGS_MULTIPLE + 50 * (growth - MATURE_GROWTH);
  if (quality) pe += 2;
  if (peak) pe -= 3;
  return Math.min(Math.max(pe, 8), 32);
}

type Projection = {
  revenue: number;
  growth: number;
  persistence: number;
  margin: number;
  settled: number;
  reversion: number;
  rate: number;
  roe: number;
  quality: boolean;
  peak: boolean;
};

/** Ten years of one case, in total money, discounted to today. */
function project(p: Projection): {
  value: number;
  growthYearTen: number;
  marginYearTen: number;
  exit: number;
} | null {
  let value = 0;
  let revenue = p.revenue;
  let growth = p.growth;
  let margin = p.margin;
  let earnings = 0;
  for (let t = 1; t <= BUSINESS_YEARS; t++) {
    if (t > 1) {
      growth = MATURE_GROWTH + (p.growth - MATURE_GROWTH) * Math.pow(p.persistence, t - 1);
      revenue *= 1 + growth;
    }
    margin = p.settled + (p.margin - p.settled) * Math.pow(p.reversion, t - 1);
    earnings = revenue * margin;
    // What growth does not need is the owners', as dividends or buybacks.
    const payout = earnings > 0 ? Math.min(Math.max(1 - growth / p.roe, 0), 0.9) : 0;
    value += (payout * earnings) / Math.pow(1 + p.rate, t);
  }
  if (earnings <= 0) return null;
  const after =
    MATURE_GROWTH + (p.growth - MATURE_GROWTH) * Math.pow(p.persistence, BUSINESS_YEARS);
  const exit = exitMultiple(after, p.quality, p.peak);
  value += (earnings * exit) / Math.pow(1 + p.rate, BUSINESS_YEARS);
  return { value, growthYearTen: growth, marginYearTen: margin, exit };
}

/**
 * What one dollar of next year's profit is worth under these rules for a
 * company growing like the market with steady margins, which is what the
 * market pays for exactly that. Every other company is scaled by the same
 * factor, so no constant above can move every company up or down together.
 */
const MARKET_SCALE = (() => {
  const reference = project({
    revenue: 1,
    growth: MARKET_EXPECTED_GROWTH,
    persistence: 0.66,
    margin: 1,
    settled: 1,
    reversion: 1,
    rate: BASE_RETURN,
    roe: 0.2,
    quality: false,
    peak: false,
  });
  return CURRENT_MARKET_FORWARD_MULTIPLE / (reference?.value ?? 1);
})();

/**
 * THE FEED'S FIGURES ARE NOT ALWAYS IN ONE MONEY, EVEN FOR ONE COMPANY.
 *
 * Measured on 26 September 2026: AstraZeneca's London listing is priced in
 * pence with its profit per share in pounds; Novo Nordisk's American
 * listing is priced in dollars with its trailing profit per share in
 * dollars and next year's estimate in Danish kroner; TSMC's accounts are
 * in Taiwan dollars. Each figure the feed also prices as a ratio says which
 * money it is in: the price over the price-to-earnings multiple is the
 * profit per share in the price's own money. So per-share figures are put
 * into the price's money first, then the accounts into per-share money
 * off the one profit both sides carry. Nothing is looked up.
 */
function alignedPerShare(f: CompanyFacts): {
  epsTrailing: number | null;
  epsNextYear: number | null;
} {
  const off = (r: number) => Number.isFinite(r) && r > 0 && (r > 3 || r < 1 / 3);
  let epsTrailing = f.epsTrailing;
  let epsNextYear = f.epsNextYear;
  if (ok(f.price) && ok(f.trailingPe) && ok(epsTrailing)) {
    const k = f.price / f.trailingPe / epsTrailing;
    if (off(k)) {
      epsTrailing *= k;
      if (typeof epsNextYear === "number") epsNextYear *= k;
    }
  }
  if (ok(f.price) && ok(f.forwardPe) && ok(epsNextYear)) {
    // Next year's estimate against the feed's own forward profit, in price money.
    const k = f.price / f.forwardPe / epsNextYear;
    if (Number.isFinite(k) && k > 0 && (k > 3.5 || k < 1 / 3.5)) epsNextYear *= k;
  }
  return { epsTrailing, epsNextYear };
}

/** The last three quarters' revenue growth, as a yearly rate, or null. */
function recentGrowth(f: CompanyFacts): number | null {
  const q = (f.quarters ?? []).map((x) => x.revenue).filter(ok);
  if (q.length < 4) return null;
  const first = q[q.length - 4]!;
  const last = q[q.length - 1]!;
  const rate = Math.pow(last / first, 4 / 3) - 1;
  return Number.isFinite(rate) && rate > -0.5 && rate < 2 ? rate : null;
}

/** How far the company has beaten or missed what analysts expected, when it is consistent. */
function surpriseLean(f: CompanyFacts): number {
  const s = (f.surprises ?? [])
    .map((x) => x.surprise)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (s.length < 3) return 0;
  const allBeat = s.every((x) => x > 0);
  const allMiss = s.every((x) => x < 0);
  if (!allBeat && !allMiss) return 0;
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  // Half of the habit, and never more than a tenth either way.
  return Math.max(-0.1, Math.min(0.1, avg / 2));
}

export type BusinessPath = {
  /** Value per share today, in the listing's money. */
  value: number;
  growthNextYear: number;
  growthYearTen: number;
  marginNextYear: number;
  marginSettled: number;
  marginYearTen: number;
  exitMultiple: number;
  rate: number;
  rateWhy: string[];
  /** Earnings just multiplied at a margin well above what the business keeps. */
  peak: boolean;
  /** A business whose margin has held steady through every year on file. */
  durable: boolean;
  /** The newest quarters, when they moved next year's growth. */
  recentGrowth: number | null;
  /** How much its record of beating or missing leaned next year's profit. */
  surpriseLean: number;
  /** A kind of company the market prices at its own multiple, when this is one. */
  industry: string | null;
  /** The three cases, per share, and the weights they carry. */
  cases: { bear: number; base: number; bull: number };
};

/** Why the business method will not run on this company, in a sentence, or null. */
export function businessStandsDown(f: CompanyFacts): string | null {
  if (f.sector === "Real Estate") {
    return "A property trust's accounting profit is cut by depreciation on buildings that usually gain value, so a value built on that profit understates it. The analysts and the market carry this one.";
  }
  if (ok(f.netIncome) && ok(f.revenue) && f.netIncome > f.revenue) {
    return "It reported more profit than it sold, so the profit is coming from something it holds rather than from the business, and a value built on it would describe the holding.";
  }
  return null;
}

/**
 * Ten years of the business, priced today, or null where the feed has not
 * carried enough to say anything honest.
 */
export function businessPath(f: CompanyFacts): BusinessPath | null {
  if (businessStandsDown(f)) return null;
  const price = f.price;
  const cap = f.marketCap;
  /*
    The feed's own share count, unless the market value says there are
    more of them: a company with two share classes (Alphabet) is counted
    as one class by the feed and valued as both, which would halve its
    earnings per share. The count is preferred otherwise so that nothing
    here moves with today's price.
  */
  const implied = ok(cap) && ok(price) ? cap / price : null;
  const counted = ok(f.sharesOutstanding) ? f.sharesOutstanding : null;
  const shares =
    counted && implied ? (implied > counted * 1.3 ? implied : counted) : (counted ?? implied);
  if (!ok(shares) || !ok(f.revenue)) return null;

  const { epsTrailing, epsNextYear } = alignedPerShare(f);

  // Accounts into per-share money, off the one profit both sides carry.
  let units = 1 / normalizeListedPrice(1, f.currency).amount;
  if (
    typeof epsTrailing === "number" &&
    typeof f.netIncome === "number" &&
    f.netIncome !== 0 &&
    Math.sign(epsTrailing) === Math.sign(f.netIncome)
  ) {
    const ratio = (epsTrailing * shares) / (f.netIncome * units);
    if (Number.isFinite(ratio) && ratio > 0 && (ratio > 3 || ratio < 1 / 3)) units *= ratio;
  }

  const analysts =
    typeof f.revenueGrowthNextYear === "number" && Number.isFinite(f.revenueGrowthNextYear)
      ? f.revenueGrowthNextYear
      : typeof f.revenueGrowth === "number" && Number.isFinite(f.revenueGrowth)
        ? f.revenueGrowth
        : null;
  if (analysts === null) return null;
  /*
    THE NEWEST QUARTERS MOVE THE NUMBER BEFORE THE ANALYSTS DO. A quarter
    lands and the published estimates catch up over weeks; three quarters
    of actual sales, annualised, carry a quarter of the weight next to them
    so a company accelerating or stalling shows here the day it reports.
  */
  const recent = recentGrowth(f);
  const blendedGrowth = recent === null ? analysts : analysts * 0.75 + recent * 0.25;
  const g1 = Math.min(Math.max(blendedGrowth, -0.3), 1.2);

  const lastQuarter = f.quarters?.[f.quarters.length - 1]?.revenue ?? null;
  const runRate =
    (ok(lastQuarter) ? Math.max(f.revenue, lastQuarter * 4) : f.revenue) * units;

  const lean = surpriseLean(f);
  let revenue = runRate * (1 + g1);
  let earnings: number;
  let margin: number;
  const gross = ok(f.grossMargin) && f.grossMargin < 0.95 ? f.grossMargin : null;
  if (typeof epsNextYear === "number" && Number.isFinite(epsNextYear)) {
    // A company that beats every quarter has analysts who are too low, and the other way round.
    earnings = epsNextYear * shares * (epsNextYear > 0 ? 1 + lean : 1 - lean);
    margin = earnings / revenue;
    // A net margin cannot exceed what is left after making the thing.
    const ceiling = gross !== null ? gross * 0.9 : 0.6;
    if (margin > ceiling) {
      margin = ceiling;
      revenue = earnings / margin;
    }
  } else if (typeof f.profitMargin === "number" && Number.isFinite(f.profitMargin)) {
    margin = f.profitMargin;
    earnings = revenue * margin;
  } else {
    return null;
  }
  // So far from a profit that ten years of anything is a guess.
  if (margin < -1.5) return null;

  /*
    WHERE THE MARGIN SETTLES: WHAT A TYPICAL BUSINESS LIKE THIS KEEPS, AND
    HOW MUCH THIS ONE HAS PROVED IT KEEPS MORE.

    The typical figure is the industry fit above, read off the gross
    margin. A company's own history outranks it in proportion to how
    steady that history is: a margin that has held within a narrow band
    for years (a card network, a dominant franchise) is a moat, and pulling
    it down to the average is the mistake that understates exactly the
    companies simple metrics understate. A history that jumped around, or
    that includes losses, says nothing about where it settles.
  */
  const typical =
    gross !== null
      ? Math.min(
          Math.max(TYPICAL_NET_FROM_GROSS.intercept + TYPICAL_NET_FROM_GROSS.slope * gross, 0.02),
          TYPICAL_NET_CEILING
        )
      : null;
  const history = (f.history ?? [])
    .filter((h) => ok(h.revenue) && typeof h.netIncome === "number")
    .map((h) => (h.netIncome as number) / (h.revenue as number));
  const alwaysProfitable = history.length >= 3 && history.every((m) => m > 0);
  const histAvg = alwaysProfitable
    ? history.reduce((a, b) => a + b, 0) / history.length
    : null;
  const spread =
    histAvg !== null
      ? Math.sqrt(history.reduce((a, m) => a + (m - histAvg) ** 2, 0) / history.length) / histAvg
      : null;
  const durable = spread !== null && spread < 0.2 && margin > 0;
  const trustInHistory =
    histAvg === null || spread === null ? 0 : durable ? 0.85 : Math.max(0, 0.6 - spread);
  let settled: number;
  if (typical === null) {
    // A bank or an insurer: gross margin means nothing, so its own record or today's margin.
    settled = histAvg ?? Math.max(margin, 0.05);
  } else if (histAvg !== null) {
    settled = trustInHistory * Math.min(histAvg, 0.5) + (1 - trustInHistory) * typical;
  } else {
    settled = typical;
  }

  const peak =
    (f.epsGrowthThisYear ?? 0) >= 1.5 &&
    margin > settled * 1.3 &&
    !history.some((m) => m <= 0);
  if (peak) settled *= 0.8;
  const netDebt = ((f.totalDebt ?? 0) - (f.totalCash ?? 0)) * units;
  // Heavily borrowed against its sales: interest takes a slice of every year.
  if (netDebt / runRate > 2) settled *= 0.7;

  const reversion =
    margin > settled
      ? peak
        ? 0.65
        : durable
          ? 0.93
          : 0.87 - 0.3 * Math.min(Math.max((margin - 0.3) / 0.4, 0), 1)
      : g1 >= 0.2 && (f.grossMargin ?? 0) >= 0.3
        ? 0.78
        : 0.88;

  // Size in the company's own reporting money, since the buckets are.
  let persistence = growthPersistence(revenue / units, g1);
  if (
    (f.grossMargin ?? 0) >= 0.6 &&
    ((f.returnOnEquity ?? 0) >= 0.2 || (f.profitMargin ?? 0) < 0)
  ) {
    persistence += 0.04;
  }
  if (durable) persistence += 0.03;
  if (peak) persistence -= 0.15;

  const { rate, why } = requiredReturn(f);
  const roe = Math.min(Math.max(f.returnOnEquity ?? 0.15, 0.08), 0.4);
  const quality =
    (f.returnOnEquity ?? 0) >= 0.25 && ((f.grossMargin ?? 0) >= 0.5 || durable);
  const cyclical = f.sector === "Energy" || f.sector === "Basic Materials";

  const base: Projection = {
    revenue,
    growth: g1,
    persistence: Math.min(persistence, 0.92),
    margin,
    settled,
    reversion,
    rate,
    roe,
    quality,
    peak: peak || cyclical,
  };
  /*
    THREE CASES, BECAUSE THE UPSIDE OF A YOUNG COMPANY IS NOT SYMMETRIC.

    A mature company's good and bad decades roughly cancel. A young one's
    do not: if it works it is worth many times what it is if it stalls,
    and pricing only the middle path is what leaves every small company
    with a steep curve looking overpriced. The bull case keeps its growth
    longer and its margin higher, the bear case the opposite, weighted a
    quarter each, and the spread widens with how far the company is from
    settled: growth above the mature pace, or a margin far from where it
    settles. The expected value, not the middle, is the method's answer.
  */
  const distance = Math.min(
    1,
    Math.max(0, g1 - MATURE_GROWTH) / 0.4 + Math.abs(margin - settled) / 0.3
  );
  const reach = 0.03 + 0.05 * distance;
  const cases = {
    bear: project({
      ...base,
      persistence: Math.max(base.persistence - reach * 1.2, 0.3),
      settled: settled * (1 - reach * 2),
    }),
    base: project(base),
    bull: project({
      ...base,
      persistence: Math.min(base.persistence + reach * 1.2, 0.95),
      settled: Math.min(settled * (1 + reach * 2), 0.5),
    }),
  };
  if (!cases.base) return null;
  // A case that ends in losses is worth nothing, not a negative number.
  const worth = (c: ReturnType<typeof project>) => Math.max(c?.value ?? 0, 0);
  const expected =
    0.25 * worth(cases.bear) + 0.5 * worth(cases.base) + 0.25 * worth(cases.bull);
  const industry = industryRatio(f);
  const perShare = (v: number) => (v * MARKET_SCALE * (industry?.ratio ?? 1)) / shares;
  const value = perShare(expected);
  if (!ok(value)) return null;
  return {
    value,
    growthNextYear: g1,
    growthYearTen: cases.base.growthYearTen,
    marginNextYear: margin,
    marginSettled: settled,
    marginYearTen: cases.base.marginYearTen,
    exitMultiple: cases.base.exit,
    rate,
    rateWhy: why,
    peak,
    durable,
    recentGrowth: recent,
    surpriseLean: lean,
    industry: industry?.said ?? null,
    cases: {
      bear: perShare(worth(cases.bear)),
      base: perShare(worth(cases.base)),
      bull: perShare(worth(cases.bull)),
    },
  };
}

/** The business method, as a line in the blend. */
function businessMethod(f: CompanyFacts): FairValueMethod | null {
  const path = businessPath(f);
  if (!path) return null;
  const pct = (n: number) => percent(n, 0);
  const code = f.currency ?? "USD";
  const risk =
    path.rateWhy.length > 0
      ? `${pct(path.rate)} a year, higher than the ordinary ${pct(BASE_RETURN)} because it is ${path.rateWhy.join(", ")}`
      : `${pct(path.rate)} a year, the ordinary rate for a large company`;
  const marginMove =
    path.marginNextYear < path.marginSettled
      ? `climbing from ${pct(path.marginNextYear)} towards ${pct(path.marginSettled)}`
      : path.marginNextYear > path.marginSettled + 0.01
        ? `easing from ${pct(path.marginNextYear)} towards ${pct(path.marginSettled)}${path.durable ? " only slowly, because it has held steady every year on file" : ", because profit that high draws competitors"}`
        : `staying near ${pct(path.marginSettled)}`;
  const news: string[] = [];
  if (path.recentGrowth !== null) {
    news.push(`its last three quarters of sales, growing at ${pct(path.recentGrowth)} a year, carry a quarter of next year's growth`);
  }
  if (path.surpriseLean !== 0) {
    news.push(
      `it has ${path.surpriseLean > 0 ? "beaten" : "missed"} the analysts' estimate every recent quarter, so next year's profit is leaned ${pct(Math.abs(path.surpriseLean))} ${path.surpriseLean > 0 ? "up" : "down"}`
    );
  }
  const losing = path.marginNextYear < 0;
  return {
    id: "business",
    name: "Ten years of the business",
    source: "ten years of the business",
    maker: "arithmetic",
    price: round2(path.value),
    assumes: `That sales growth of ${pct(path.growthNextYear)} next year fades towards ${pct(MATURE_GROWTH)} as the company gets bigger, and that its profit margin moves towards ${pct(path.marginSettled)}, ${path.durable ? "mostly its own steady record" : "what a typical business with its gross margin keeps"}.${
      path.peak
        ? " Its profit just multiplied at a margin well above that, so this treats it as possibly the top of a cycle."
        : ""
    } Priced as a bad, a middle and a good decade, because a young company's good case is worth far more than its bad case costs.`,
    working: `Sales growth of ${pct(path.growthNextYear)} next year, fading to ${pct(path.growthYearTen)} by year ten; profit margin ${marginMove}, reaching ${pct(path.marginYearTen)} by year ten.${news.length > 0 ? ` Newest information: ${news.join("; ")}.` : ""} What it pays out along the way plus year ten's profit at ${Math.round(path.exitMultiple)} times, brought back to today at ${risk}. The three cases come to ${currency(path.cases.bear, 2, code)}, ${currency(path.cases.base, 2, code)} and ${currency(path.cases.bull, 2, code)}, weighted a quarter, a half and a quarter. Scaled so a company growing like the market with steady margins is worth what the market paid for one in January 2026, about ${Math.round(CURRENT_MARKET_FORWARD_MULTIPLE)} times next year's profit (Damodaran's data set)${path.industry ? `, and like ${path.industry}, whose profit the market has always priced at about half that` : ""}.`,
    // Less weight on a company still losing money: every year of it is further from a fact.
    weight: losing ? 0.2 : 0.3,
  };
}

/**
 * How much this company's own price should count, by how efficiently it
 * is priced. Size first, because the biggest companies are the most
 * traded and the most argued over; coverage second, because forty
 * analysts arguing in public is part of what makes a price informed.
 * Never more than 0.45, so the market is the loudest voice on a giant and
 * still never the whole answer.
 */
export function marketWeight(f: CompanyFacts): number {
  if (!ok(f.marketCap)) return 0;
  const bySize = 0.12 + 0.11 * Math.log10(Math.max(f.marketCap / 1e9, 1));
  const n = f.analystCount ?? 0;
  const byCoverage = n >= 20 ? 0.03 : n < 3 ? -0.04 : 0;
  return Math.round(Math.min(Math.max(bySize + byCoverage, 0.08), 0.45) * 100) / 100;
}

/** What the market is paying, as a line in the blend. */
function marketMethod(f: CompanyFacts): FairValueMethod | null {
  if (!ok(f.price)) return null;
  const weight = marketWeight(f);
  if (weight <= 0) return null;
  const code = f.currency ?? "USD";
  const n = f.analystCount ?? 0;
  return {
    id: "market",
    name: "What the market is paying",
    source: "the market's own price",
    maker: "market",
    price: round2(f.price),
    assumes: `That the people trading it every day have seen things these figures cannot, such as what it might become, how long its lead lasts, or a risk nobody has written down yet. It counts for more the bigger and more widely followed the company is${n > 0 ? `, and ${n} analyst${n === 1 ? "" : "s"} follow this one` : ""}.`,
    working: `Today's price of ${currency(f.price, 2, code)}, weighted ${percent(weight, 0)} before the blend is normalised: more for a large, heavily covered company where the price is well argued, less for a small one where it is most likely to be wrong.`,
    weight,
  };
}

/**
 * What the price is assuming, which is the question a valuation is really
 * a proxy for.
 *
 * Rather than tell somebody what a share is worth, this tells them what
 * has to happen for today's price to make sense: the annual earnings
 * growth needed, over five years, to bring the multiple back to what the
 * market ordinarily pays. It is one line of arithmetic on two figures
 * that are solid, it assumes no discount rate and no terminal value, and
 * it is the thing a professional actually asks. It is also the fairest
 * framing a company that looks expensive can get: the price is not wrong,
 * it is a bet, and this is the size of the bet.
 *
 * Deliberately not part of the blend. It is a growth rate, not a price.
 */
export function impliedGrowth(f: CompanyFacts): {
  /** Annual earnings growth the price implies, as a fraction. */
  rate: number;
  years: number;
  /** The earnings figure it was worked out from. */
  basis: "next year" | "this year";
  /** The market's own expected growth, when the feed carried it. */
  marketRate: number | null;
} | null {
  const price = f.price;
  const eps = ok(f.epsNextYear)
    ? f.epsNextYear
    : ok(f.epsThisYear)
      ? f.epsThisYear
      : null;
  if (!ok(price) || !ok(eps)) return null;
  const multiple = price / eps;
  // Already at or below the market's ordinary multiple: the price assumes
  // nothing in particular, and there is no bet to size.
  if (multiple <= MARKET_EARNINGS_MULTIPLE) return null;
  const years = 5;
  const rate = Math.pow(multiple / MARKET_EARNINGS_MULTIPLE, 1 / years) - 1;
  if (!Number.isFinite(rate)) return null;
  return {
    rate,
    years,
    basis: ok(f.epsNextYear) ? "next year" : "this year",
    marketRate: f.marketLongTermGrowth ?? f.marketEpsGrowthNextYear,
  };
}

/**
 * TWELVE MONTHS OUT, ON A PATH WHOSE POINTS ARE CALENDAR YEAR ENDS.
 *
 * The shared forecast path prices the close of this calendar year, then
 * next year's, and so on, and this panel's heading promises what each
 * method puts the share at **in twelve months**. Those are the same thing
 * for about one day a year. Read in September the first point on the path
 * is under four months away, so a model that reasoned a perfectly ordinary
 * year was printed next to analyst targets covering three times as long,
 * and came out looking timid for a reason that has nothing to do with what
 * it actually said.
 *
 * That is the fault this file already records against a method run on
 * trailing earnings: the arithmetic was sound and the horizon was wrong.
 * So the two points either side of the twelve month mark are interpolated
 * between, in log space, because a price path compounds rather than adds.
 *
 * It moves the figure in whichever direction the model's own path goes,
 * which is what keeps it a horizon correction rather than an opinion: a
 * path that falls through next year comes out lower here, not higher.
 *
 * With only this year's close to go on there is nothing to interpolate
 * towards, so the point is handed back as it stands and the caller says
 * which horizon it really is.
 */
export function modelTwelveMonthPrice(
  thisYearEnd: number | null | undefined,
  nextYearEnd: number | null | undefined,
  now: Date = new Date()
): { price: number; exact: boolean } | null {
  if (!ok(thisYearEnd)) return null;
  if (!ok(nextYearEnd)) return { price: thisYearEnd, exact: false };
  const year = now.getFullYear();
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  const elapsed = (now.getTime() - start) / (end - start);
  // Guard the arithmetic rather than trusting a clock: a date outside its
  // own year would extrapolate off the end of the path.
  const frac = Math.min(Math.max(elapsed, 0), 1);
  const price = thisYearEnd * Math.pow(nextYearEnd / thisYearEnd, frac);
  return { price, exact: true };
}

/** The model's own reasoned path, twelve months out. Labelled as a model. */
function modelMethod(
  price: number | null | undefined,
  /** The working line, which names the points on the path it read. */
  when: string
): FairValueMethod | null {
  if (!ok(price)) return null;
  return {
    id: "model",
    name: "What the model reasoned",
    source: "the model's own path",
    maker: "model",
    price: round2(price),
    assumes:
      "That a language model reasoning from what it already knows is worth hearing. Nothing here can check it.",
    working: when,
    weight: 0.18,
  };
}

/* ---------------------------------------------------------------------- *
 * Blending
 * ---------------------------------------------------------------------- */

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? null);
}

/**
 * Weighted average of whatever survived, with the incoherent answers taken
 * out first.
 *
 * The bound is against the median rather than the mean, because one
 * enormous outlier drags a mean far enough to take the sane methods out
 * with it. Three times either way is deliberately wide: this is a filter
 * for arithmetic that has stopped describing the company, not a filter for
 * an opinion we dislike.
 */
export function blendFairValue(methods: FairValueMethod[]): FairValueBlend {
  const runnable = methods.filter((m) => ok(m.price));
  const mid = median(runnable.map((m) => m.price));
  const used: FairValueMethod[] = [];
  const dropped: FairValueMethod[] = [];

  for (const m of runnable) {
    if (mid && runnable.length >= 3 && (m.price > mid * 3 || m.price < mid / 3)) {
      dropped.push({
        ...m,
        dropped:
          "Left out of the blend. It landed more than three times away from what the other methods said, which means the arithmetic has stopped describing this company rather than that it disagrees.",
      });
      continue;
    }
    used.push(m);
  }

  const totalWeight = used.reduce((sum, m) => sum + m.weight, 0);
  if (used.length === 0 || totalWeight <= 0) {
    return { price: null, used: [], dropped, spread: null, confidence: "none" };
  }
  const price =
    used.reduce((sum, m) => sum + m.price * m.weight, 0) / totalWeight;
  const lo = Math.min(...used.map((m) => m.price));
  const hi = Math.max(...used.map((m) => m.price));
  return {
    price: round2(price),
    used: [...used].sort((a, b) => b.weight - a.weight),
    dropped,
    spread: price > 0 ? (hi - lo) / price : null,
    confidence: used.length >= 4 ? "broad" : used.length >= 2 ? "mixed" : "thin",
  };
}

/**
 * Every method this app can run on this company.
 *
 * `modelYearOne` and `modelYearTwo` are the first two points of the shared
 * forecast path, which price the close of this calendar year and of the
 * next. Neither of them is twelve months away, so they are interpolated
 * between rather than being printed as though the horizons lined up: read
 * in September, the first point alone is under four months out and sits in
 * a panel promising a twelve month figure. With only the first point
 * available the method says which horizon it is really quoting.
 */
export function fairValueRead(
  f: CompanyFacts,
  input: {
    modelYearOne?: number | null;
    modelYearTwo?: number | null;
    /** Injectable only so the interpolation can be tested on a fixed day. */
    now?: Date;
  } = {}
): FairValueRead {
  const spot = ok(f.price) ? f.price : null;
  const none: FairValueBlend = {
    price: null,
    used: [],
    dropped: [],
    spread: null,
    confidence: "none",
  };

  /*
    A fund and a coin get no valuation, and this guard is not tidiness.

    Every method here prices a claim on a company's earnings. A fund owns
    hundreds of companies and its price is the sum of theirs by
    construction, so a multiple applied to an index fund is circular. A
    coin has no earnings at all, so there is nothing for any of this to
    divide. Both are answered honestly elsewhere on the page, a fund by
    what it holds and what it costs, a coin by saying there are no
    accounts behind it.
  */
  if (isFundLike(f) || isCryptoLike(f)) {
    return { estimate: none, spot, gap: null };
  }

  const thisYear = (input.now ?? new Date()).getFullYear();
  const modelTwelveMonth = modelTwelveMonthPrice(
    input.modelYearOne,
    input.modelYearTwo,
    input.now
  );
  const model = modelMethod(
    modelTwelveMonth?.price,
    modelTwelveMonth?.exact
      ? `Twelve months from today on the five-year path the model wrote for this company, read between its end of ${thisYear} price of ${currency(input.modelYearOne ?? 0, 2)} and its end of ${thisYear + 1} price of ${currency(input.modelYearTwo ?? 0, 2)}. It is the same path the Growth room uses.`
      : `The end of ${thisYear} price on the five-year path the model wrote for this company, which is the same path the Growth room uses. It is nearer than twelve months, because the rest of the path is not available here.`
  );

  const market = marketMethod(f);
  const consensus = consensusMethod(f);
  let business = businessMethod(f);
  /*
    THE BUSINESS COUNTS FOR LESS WHEN IT ARGUES WITH EVERYBODY.

    The same reasoning the analysts' weight already follows: a projection
    landing more than 1.6 times away from the market and the analysts as
    they are from each other is more likely to be missing something about
    this company than to have found something they all missed, so it
    counts for half. Past three times it is dropped outright by the blend.
  */
  const others = [market, consensus].filter((m): m is FairValueMethod => m !== null);
  if (business && others.length > 0) {
    const mid = Math.sqrt(others.reduce((a, m) => a * m.price, 1) ** (2 / others.length));
    const apart = Math.max(business.price / mid, mid / business.price);
    if (apart > 1.6) {
      business = {
        ...business,
        weight: Math.round(business.weight * 50) / 100,
        assumes: `${business.assumes} It lands ${apart.toFixed(1)} times away from the market and the analysts, so it counts for half.`,
      };
    }
  }
  const blended = blendFairValue(
    [market, consensus, business].filter((m): m is FairValueMethod => m !== null)
  );
  /*
    THE MODEL'S PATH IS SHOWN AND NOT COUNTED (2026-09-26).

    It was a third of the blend's voice, and it cannot answer this
    question: the path is grown from TODAY'S price at this app's own growth
    rate (`anchorPathToGrowth`), so its twelve month point is today's price
    times a return, and a figure built out of today's price can never say
    whether today's price is right. Counted, it pulled every estimate
    towards the price plus this app's growth view for that name, which is
    both a nudge towards the price and a house view reaching every reader
    through a number labelled as fair value. It stays in the list, greyed,
    with the reason, because a method that silently disappears is the
    mistake this file refuses to make.
  */
  const estimate: FairValueBlend = model
    ? {
        ...blended,
        dropped: [
          ...blended.dropped,
          {
            ...model,
            dropped:
              "Shown and not counted. The model's path is grown from today's price, so it is a forecast of where the price goes rather than an estimate of what the company is worth, and it cannot say whether today's price is right.",
          },
        ],
      }
    : blended;

  return {
    estimate,
    spot,
    gap: spot && estimate.price ? (estimate.price - spot) / spot : null,
  };
}

/**
 * The gap said in words, without a verdict in it.
 *
 * Deliberately never "cheap" or "expensive". Those are conclusions, and
 * the whole design of this file is that the reader draws it. What it says
 * instead is what the arithmetic and the price actually are, and how far
 * apart, which is a fact.
 */
export function gapSentence(gap: number | null, blended: number | null): string | null {
  if (gap === null || blended === null) return null;
  const pct = Math.round(Math.abs(gap) * 100);
  if (pct < 5) {
    return "Today's price and this estimate are within a few percent of each other.";
  }
  return gap > 0
    ? `Today's price is about ${pct}% above what these methods add up to.`
    : `Today's price is about ${pct}% below what these methods add up to.`;
}


/* ---------------------------------------------------------------------- *
 * The read at the top of the page
 * ---------------------------------------------------------------------- */

export type ValuePosition = "above" | "inside" | "below" | "unknown";

export type ValueGlance = {
  /** Where today's price sits against every estimate on the page. */
  position: ValuePosition;
  /** The lowest and highest estimate any method produced. */
  low: number | null;
  high: number | null;
  /** One sentence describing the numbers. Never an instruction. */
  read: string;
  /** What the reader should go and argue with, given where it sits. */
  nextQuestion: string;
};

/**
 * The at-a-glance read, and the line it must never cross.
 *
 * A person standing in front of a company wants to know whether the price
 * is a sensible one, and every honest answer to that is somebody's
 * estimate. This app is not an adviser and may not tell anybody to buy or
 * sell, so what it does instead is state, as a fact, **where today's price
 * sits among the estimates it has just shown**, and hand back the question
 * that actually decides it.
 *
 * The distinction is not a legal fig leaf, it is the more useful answer.
 * "Above every estimate here" is checkable against the six methods listed
 * below it and tells the reader exactly what they would be betting on;
 * "sell" tells them nothing and would be wrong for anybody with a
 * different holding period from whoever wrote it.
 *
 * `value-glance.test.ts` fails on an instruction word in any output.
 */
export function valueGlance(read: FairValueRead): ValueGlance {
  /*
    The market's own price is a method in the blend and never an estimate
    to compare the price with: set beside itself it would put every
    company "inside the range" whatever the other methods said.
  */
  const prices = read.estimate.used
    .filter((m) => m.id !== "market")
    .map((m) => m.price);
  const spot = read.spot;
  if (prices.length === 0 || !ok(spot)) {
    return {
      position: "unknown",
      low: null,
      high: null,
      read: "There is not enough in the feed to estimate this one, so the price below stands on its own.",
      nextQuestion:
        "The figures and the articles further down are what there is. They are worth reading before anything else.",
    };
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  /*
    Name whose estimate the edge of the band is. "The lowest estimate on
    this page" points at the page it is printed on and tells a reader
    nothing; "from the analysts' average" tells them whether to argue with
    it, which is the whole design of this room.
  */
  const from = (v: number) => {
    const m = read.estimate.used.find((x) => x.price === v && x.id !== "market");
    return m ? `, from ${m.source}` : "";
  };

  if (spot > high) {
    return {
      position: "above",
      low,
      high,
      read: `Today's price is above every estimate below. The highest is ${currency(high, 2)}${from(high)}.`,
      nextQuestion:
        "So the price is a bet that this company does better than the figures below currently suggest. What has to go right is the thing to read next.",
    };
  }
  if (spot < low) {
    return {
      position: "below",
      low,
      high,
      read: `Today's price is below every estimate below. The lowest is ${currency(low, 2)}${from(low)}.`,
      nextQuestion:
        "Either the market knows something these figures do not, or it has not caught up. The case against, further down, is where to look for the first.",
    };
  }
  /*
    "Inside the range" is only worth saying when the range means something.

    Measured on AMD the methods ran from $151 to $618, which is a factor of
    four, and almost any price is inside a range that wide. Reporting that
    as though it settled something would be the most flattering possible
    reading of a set of methods that plainly disagree, so the width is
    said out loud and the reader is sent to the disagreement rather than
    to a reassurance.
  */
  const wide = low > 0 && high / low >= 2.5;
  return {
    position: "inside",
    low,
    high,
    read: wide
      ? `The methods below disagree by a factor of ${(high / low).toFixed(1)}, from ${currency(low, 2)}${from(low)} to ${currency(high, 2)}${from(high)}, and today's price is somewhere in the middle of that.`
      : `Today's price sits inside the range these methods produce, ${currency(low, 2)} to ${currency(high, 2)}.`,
    nextQuestion: wide
      ? "A range that wide is not a valuation, it is a disagreement, and being inside it settles nothing. The methods are listed below with the assumption each rests on, and the one you find least believable is the one to start with."
      : "So nothing here is obviously mispriced, and which end of that range you believe is the whole question. The assumptions behind each method are listed with it.",
  };
}


/* ---------------------------------------------------------------------- *
 * The three things a professional reads before deciding whether the rest
 * of the page is worth their time. Each is pure arithmetic on figures the
 * feed supplies, each is checkable, and none of them is a recommendation.
 * ---------------------------------------------------------------------- */

/**
 * How much the people who cover it disagree.
 *
 * The single most under-published number in retail finance. Every site
 * prints the average price target and almost none print the spread, which
 * is the part that says what kind of situation this is. Forty analysts
 * clustered within twenty per cent of each other is a consensus, and the
 * average means something. Forty analysts spread from half the price to
 * double it is a contested name where the average is the midpoint of an
 * argument and describes nobody's actual view.
 *
 * It also gives the reader the shape of the outcome honestly: how far to
 * the most pessimistic published view, and how far to the most optimistic.
 */
export function analystSpread(f: CompanyFacts): {
  count: number;
  low: number;
  high: number;
  mean: number;
  /** The spread as a fraction of today's price. */
  width: number | null;
  /** How far today's price is from each end, as fractions. */
  toLow: number | null;
  toHigh: number | null;
  /** Wide enough that the average is the midpoint of a real argument. */
  contested: boolean;
} | null {
  const { analystTargetLow: low, analystTargetHigh: high } = f;
  const mean = f.analystTargetMean;
  const count = f.analystCount ?? 0;
  if (!ok(low) || !ok(high) || !ok(mean) || high <= low) return null;
  const price = ok(f.price) ? f.price : null;
  const width = price ? (high - low) / price : null;
  return {
    count,
    low,
    high,
    mean,
    width,
    toLow: price ? (low - price) / price : null,
    toHigh: price ? (high - price) / price : null,
    // A published range wider than the share price itself means the people
    // who do this for a living cannot agree within a factor of two.
    contested: width !== null && width >= 1,
  };
}

/**
 * The earnings ramp: what it earned, what it is expected to earn this
 * year, and what next year.
 *
 * Three numbers that contain the entire argument about a growth company.
 * Everything else on the page is a comment on this line, and reading it
 * takes about a second: either the profit is arriving or it is not.
 */
export function earningsRamp(f: CompanyFacts): {
  steps: { label: string; eps: number }[];
  /** Total change from the first step to the last, as a fraction. */
  total: number | null;
} | null {
  const steps: { label: string; eps: number }[] = [];
  if (ok(f.epsTrailing)) steps.push({ label: "Last 12 months", eps: f.epsTrailing });
  if (ok(f.epsThisYear)) steps.push({ label: "This year", eps: f.epsThisYear });
  if (ok(f.epsNextYear)) steps.push({ label: "Next year", eps: f.epsNextYear });
  if (steps.length < 2) return null;
  const first = steps[0]!.eps;
  const last = steps[steps.length - 1]!.eps;
  return { steps, total: first > 0 ? (last - first) / first : null };
}
