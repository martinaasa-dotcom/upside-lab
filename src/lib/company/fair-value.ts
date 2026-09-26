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
 * **The model is one voice among several and never the loudest.** Its
 * weight is fixed and modest, and it is labelled as a model wherever it
 * appears, because it is the only input here that cannot be checked.
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
  THE GROWTH MULTIPLE IS GONE, AND WHAT REPLACED IT IS TEN YEARS OF THE
  BUSINESS PRICED TODAY (2026-09-26).

  The rule it replaces paid a multiple for growth and then applied that
  multiple to NEXT year's earnings, which already contain next year's
  growth, so the growth was paid for twice. Capped at 30 it put Nvidia at
  $470 against a price of $225 and an analysts' average of $328, Broadcom
  at $581 above the highest price it had traded at all year, and Micron,
  whose earnings are at the top of a memory cycle, at $4,785. Read the
  other way, the same cap priced every young company growing fast on thin
  profits as if it would stay thin: Rocket Lab came out at $1.37.

  So the number now comes from the one question every one of those cases
  was really asking: what will this business earn over the next ten years,
  and what is that worth today. It is answered in revenue and margin
  separately, because they are different claims that go wrong in different
  ways, and every piece of it is a published habit of real businesses
  rather than a view of this company:

  - GROWTH FADES, AND HOW FAST DEPENDS ON SIZE. Next year's revenue growth
    is the analysts' own, and each year after it moves back towards the
    ordinary pace of a mature business (`MATURE_GROWTH`). A company selling
    a billion dollars a year has room to keep growing for a decade, and one
    selling three hundred billion does not, so persistence is set by
    revenue (`growthPersistence`). That is what lets a small company with a
    terrible multiple and a steep curve be worth more than its price.

  - MARGINS MOVE TOWARDS WHAT A BUSINESS LIKE THIS KEEPS. The settled
    margin is read off the company's gross margin (what is left after
    making the thing caps what can ever be left at the end) and, where it
    has been profitable every year on file, its own history. A company
    losing money climbs towards it, which is the margin potential of a
    young business; a company earning far above it is pulled back down,
    faster the further above it sits, because extraordinary profit is
    what competitors come for. That is what stops a record year being
    capitalised as though it were forever.

  - A PROFIT THAT JUST MULTIPLIED IS TREATED AS POSSIBLY A PEAK. A company
    whose earnings more than doubled this year, at a margin well above
    what its business keeps, is priced as the top of a cycle may look:
    faster reversion, a lower settled margin and a lower multiple at the
    end. It never fires on a company that has only just become profitable,
    since a first profit is not the top of anything.

  - WHAT IT PAYS OUT ALONG THE WAY COUNTS. A business growing at g with a
    return on equity of ROE needs to keep g/ROE of its profit to fund the
    growth, and the rest is the owners' whether it arrives as dividends or
    buybacks. A mature company is mostly worth its payouts; a fast grower
    is worth almost nothing but its future.

  - RISK IS THE RATE, AND IT IS SAID. A small company, one losing money,
    one carrying heavy debt, and one whose price has swung wildly are each
    worth less for the same earnings, through a higher required return
    (`requiredReturn`), which is printed in the working.

  - IT IS MEASURED AGAINST THE MARKET, NOT AGAINST A NUMBER TYPED HERE.
    The whole method is scaled so that a company growing at the market's
    pace with steady margins lands on exactly the market's own multiple
    (`marketScale`). Every constant above could be argued with, and this is
    what stops any of them moving every company up or down together: they
    only ever move a company relative to the market. It is the same anchor
    the growth rule used, and it is symmetric: nothing here favours growth
    or disfavours it beyond what the arithmetic of growth is worth.

  There is still no discounted cash flow, for the reason this file gives:
  the feed's free cash flow is after interest and is wrong by a factor of
  two. This discounts earnings, which the feed carries from the analysts.
*/

/** How many years of the business are projected before the exit multiple. */
const BUSINESS_YEARS = 10;

/**
 * The revenue growth a mature business settles at, nominal. About what the
 * economy grows at plus inflation, and what the market's own multiple is
 * paying for.
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

/** The share each piece of the required return adds, said in the working. */
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

/**
 * Ten years of `earnings` growing at a constant mature pace, paid out at the
 * rate that pace allows, exited at the market's multiple, at the ordinary
 * return. What the market's own multiple is worth under these same rules.
 */
function marketScale(): number {
  const roe = 0.2;
  let value = 0;
  let earnings = 1;
  for (let t = 1; t <= BUSINESS_YEARS; t++) {
    if (t > 1) earnings *= 1 + MATURE_GROWTH;
    value += ((1 - MATURE_GROWTH / roe) * earnings) / Math.pow(1 + BASE_RETURN, t);
  }
  value += (earnings * MARKET_EARNINGS_MULTIPLE) / Math.pow(1 + BASE_RETURN, BUSINESS_YEARS);
  return MARKET_EARNINGS_MULTIPLE / value;
}
const MARKET_SCALE = marketScale();

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
};

/**
 * Ten years of the business, priced today, or null where the feed has not
 * carried enough to say anything honest.
 */
export function businessPath(f: CompanyFacts): BusinessPath | null {
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

  const growthIn =
    typeof f.revenueGrowthNextYear === "number" && Number.isFinite(f.revenueGrowthNextYear)
      ? f.revenueGrowthNextYear
      : typeof f.revenueGrowth === "number" && Number.isFinite(f.revenueGrowth)
        ? f.revenueGrowth
        : null;
  if (growthIn === null) return null;
  const g1 = Math.min(Math.max(growthIn, -0.3), 1.2);

  /*
    Where revenue runs now. The last quarter times four when it is larger
    than the last twelve months, because a company growing fast has already
    left its trailing year behind.
  */
  /*
    THE ACCOUNTS AND THE SHARE PRICE ARE NOT ALWAYS IN THE SAME MONEY.

    An LSE listing is priced in pence and reports in pounds, and a foreign
    listing traded in dollars reports in its home currency, so a profit
    per share multiplied by the share count can be a hundred times the
    company's own reported profit. The last year's profit is on both sides
    of that line, per share and in total, so the ratio between them is the
    exchange between the two monies and every accounts figure is carried
    across by it. Nothing is looked up, and a listing where the two agree
    multiplies by exactly one.
  */
  // Pence against pounds is known outright; anything else is read off the profit.
  let units = 1 / normalizeListedPrice(1, f.currency).amount;
  if (
    typeof f.epsTrailing === "number" &&
    typeof f.netIncome === "number" &&
    f.netIncome !== 0 &&
    Math.sign(f.epsTrailing) === Math.sign(f.netIncome)
  ) {
    const ratio = (f.epsTrailing * shares) / (f.netIncome * units);
    if (Number.isFinite(ratio) && ratio > 0 && (ratio > 3 || ratio < 1 / 3)) units *= ratio;
  }
  const lastQuarter = f.quarters?.[f.quarters.length - 1]?.revenue ?? null;
  const runRate =
    (ok(lastQuarter) ? Math.max(f.revenue, lastQuarter * 4) : f.revenue) * units;

  let revenue = runRate * (1 + g1);
  let earnings: number;
  let margin: number;
  if (typeof f.epsNextYear === "number" && Number.isFinite(f.epsNextYear)) {
    earnings = f.epsNextYear * shares;
    margin = earnings / revenue;
    // A net margin cannot exceed what is left after making the thing.
    const ceiling = ok(f.grossMargin) ? f.grossMargin * 0.9 : 0.6;
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

  let settled = ok(f.grossMargin)
    ? Math.min(Math.max(f.grossMargin * 0.42, 0.03), 0.32)
    : 0.1;
  const history = (f.history ?? [])
    .filter((h) => ok(h.revenue) && typeof h.netIncome === "number")
    .map((h) => (h.netIncome as number) / (h.revenue as number));
  const alwaysProfitable = history.length >= 3 && history.every((m) => m > 0);
  if (alwaysProfitable) {
    const avg = history.reduce((a, b) => a + b, 0) / history.length;
    settled = 0.5 * settled + 0.5 * Math.min(Math.max(avg, 0.02), 0.4);
  }
  const peak =
    (f.epsGrowthThisYear ?? 0) >= 1.5 &&
    margin > settled * 1.3 &&
    !history.some((m) => m <= 0);
  if (peak && ok(f.grossMargin)) {
    // Its gross margin is at the top of the cycle too.
    settled = Math.min(settled, f.grossMargin * 0.8 * 0.42);
  }
  const netDebt = ((f.totalDebt ?? 0) - (f.totalCash ?? 0)) * units;
  // Heavily borrowed against its sales: interest takes a slice of every year.
  if (netDebt / runRate > 2) settled *= 0.7;

  const reversion =
    margin > settled
      ? peak
        ? 0.65
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
  if (peak) persistence -= 0.15;

  const { rate, why } = requiredReturn(f);
  const roe = Math.min(Math.max(f.returnOnEquity ?? 0.15, 0.08), 0.4);

  let value = 0;
  let marginT = margin;
  let growthT = g1;
  let earningsT = earnings;
  for (let t = 1; t <= BUSINESS_YEARS; t++) {
    if (t > 1) {
      growthT = MATURE_GROWTH + (g1 - MATURE_GROWTH) * Math.pow(persistence, t - 1);
      revenue *= 1 + growthT;
    }
    marginT = settled + (margin - settled) * Math.pow(reversion, t - 1);
    earningsT = revenue * marginT;
    const payout =
      earningsT > 0 ? Math.min(Math.max(1 - growthT / roe, 0), 0.9) : 0;
    value += (payout * earningsT) / Math.pow(1 + rate, t);
  }
  if (earningsT <= 0) return null;

  const growthAfter =
    MATURE_GROWTH + (g1 - MATURE_GROWTH) * Math.pow(persistence, BUSINESS_YEARS);
  const quality = (f.returnOnEquity ?? 0) >= 0.25 && (f.grossMargin ?? 0) >= 0.5;
  const cyclical = f.sector === "Energy" || f.sector === "Basic Materials";
  const multiple = exitMultiple(growthAfter, quality, peak || cyclical);
  value += (earningsT * multiple) / Math.pow(1 + rate, BUSINESS_YEARS);

  const perShare = (value * MARKET_SCALE) / shares;
  if (!ok(perShare)) return null;
  return {
    value: perShare,
    growthNextYear: g1,
    growthYearTen: growthT,
    marginNextYear: margin,
    marginSettled: settled,
    marginYearTen: marginT,
    exitMultiple: multiple,
    rate,
    rateWhy: why,
    peak,
  };
}

/** The business method, as a line in the blend. */
function businessMethod(f: CompanyFacts): FairValueMethod | null {
  const path = businessPath(f);
  if (!path) return null;
  const pct = (n: number) => percent(n, 0);
  const risk =
    path.rateWhy.length > 0
      ? `${pct(path.rate)} a year, higher than the ordinary ${pct(BASE_RETURN)} because it is ${path.rateWhy.join(", ")}`
      : `${pct(path.rate)} a year, the ordinary rate for a large company`;
  const marginMove =
    path.marginNextYear < path.marginSettled
      ? `climbing from ${pct(path.marginNextYear)} towards the ${pct(path.marginSettled)} a business like this keeps`
      : path.marginNextYear > path.marginSettled + 0.01
        ? `falling back from ${pct(path.marginNextYear)} towards the ${pct(path.marginSettled)} a business like this keeps, because profit that high draws competitors`
        : `staying near ${pct(path.marginSettled)}`;
  const losing = path.marginNextYear < 0;
  return {
    id: "business",
    name: "Ten years of the business",
    source: "ten years of the business",
    maker: "arithmetic",
    price: round2(path.value),
    assumes: `That sales growth of ${pct(path.growthNextYear)} next year fades towards ${pct(MATURE_GROWTH)} as the company gets bigger, and that its profit margin moves towards what its kind of business usually keeps.${
      path.peak
        ? " Its profit just multiplied at a margin well above that, so this treats it as possibly the top of a cycle."
        : ""
    } A projection, not a law.`,
    working: `Sales growth of ${pct(path.growthNextYear)} next year, fading to ${pct(path.growthYearTen)} by year ten; profit margin ${marginMove}, reaching ${pct(path.marginYearTen)} by year ten. What it pays out along the way plus year ten's profit at ${Math.round(path.exitMultiple)} times, brought back to today at ${risk}. Scaled so a company growing at the market's pace with steady margins is worth exactly the market's ${MARKET_EARNINGS_MULTIPLE} times earnings.`,
    // Less weight on a company still losing money: every year of it is further from a fact.
    weight: losing ? 0.2 : 0.3,
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

  const blended = blendFairValue(
    [consensusMethod(f), businessMethod(f)].filter(
      (m): m is FairValueMethod => m !== null
    )
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
  const prices = read.estimate.used.map((m) => m.price);
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
    const m = read.estimate.used.find((x) => x.price === v);
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
