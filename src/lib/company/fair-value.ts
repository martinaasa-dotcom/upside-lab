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
   * One estimate, twelve months out, and there is deliberately no second
   * one for "today".
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

/**
 * Below this much annual growth the growth-multiple rule stands down.
 *
 * Set above the market's own long-run earnings growth on purpose: the
 * rule only says anything about a company growing faster than the market,
 * and applied to one that is not it produces a multiple far below what
 * such companies actually trade at.
 */
const GROWTH_RULE_FLOOR_PCT = 12;

/**
 * The most this rule of thumb may ever pay for a year's earnings.
 *
 * It was 40, which is where the rule stops describing anything: a company
 * holding 40 times next year's earnings for long is rare enough that no
 * heuristic should assume it, and on Nvidia growing 66% the cap was the
 * only thing setting the number, putting it $291 above the analysts'
 * average. Thirty is already the top of the range large companies actually
 * sustain, and past that the rule is guessing rather than estimating.
 */
const GROWTH_RULE_CEILING = 30;

/**
 * How much extra multiple a point of growth above the market earns.
 *
 * Half a turn. At that rate a company growing twice as fast as the market
 * lands about six turns above it, which is roughly where such companies
 * actually trade, and the cap binds before it can run away. A whole turn
 * per point would put anything growing 40% straight into the cap and make
 * the rule a step function.
 */
const GROWTH_PREMIUM_PER_POINT = 0.5;

function ok(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---------------------------------------------------------------------- *
 * The methods. Each returns null rather than guessing at a missing input.
 * ---------------------------------------------------------------------- */

/** What the analysts covering it think it is worth in a year's time. */
function consensusMethod(f: CompanyFacts): FairValueMethod | null {
  const target = f.analystTargetMean;
  if (!ok(target)) return null;
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
    Nvidia's estimate $106 above what any analyst had published.
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
      ? ` Their own answers run from ${currency(f.analystTargetLow, 2, code)} to ${currency(f.analystTargetHigh, 2, code)}, which is the part an average hides.`
      : "";
  const disagreement =
    agreement < 1
      ? ` They disagree enough that this counts for less here than a settled view would: the gap between the highest and lowest is ${percent(width ?? 0, 0)} of the share price.`
      : "";
  return {
    id: "consensus",
    name: "What Wall Street expects",
    source: "the analysts' average",
    maker: "market",
    price: round2(target),
    assumes: `That the ${n > 0 ? `${n} analyst${n === 1 ? "" : "s"} covering this company` : "analysts covering this company"} have it about right. They are paid to be right and are often wrong together.${spread}${disagreement}`,
    working: `The plain average of the twelve-month price targets published by the ${n > 0 ? n : ""} analyst${n === 1 ? "" : "s"} who cover it.`.replace("  ", " "),
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

/**
 * The multiple a company's growth earns it, anchored on the market's own
 * multiple rather than on the growth rate alone.
 *
 * THE FAULT THIS REPLACES, BECAUSE IT LOOKED PERFECTLY REASONABLE.
 *
 * The old rule was the textbook one: a company compounding earnings at
 * 20% a year is allowed roughly a 20 times multiple. Read literally off a
 * single year's expected growth it produces answers nobody would defend
 * in either direction. Meta, whose next financial year is a heavy
 * investment year and whose expected earnings growth is therefore 12%,
 * came out at 12 times earnings and a fair value of $414 against a share
 * price of $617. The market itself pays 18 times for it. A rule saying a
 * company with 30% net margins, $90 billion of cash and a 30% return on
 * equity is worth twelve times earnings is not conservative, it is a rule
 * that has been handed the wrong input: **one year's expected growth is
 * not a company's sustainable growth rate**, and it is wrong low for a
 * business mid-investment and wrong high for one mid-rebound.
 *
 * What it does now is anchor: a company growing at the same pace as the
 * whole market earns the same multiple as the whole market, and growth
 * above that earns half a turn of multiple per point of extra growth.
 * Both ends of that are the feed's own published figures rather than
 * numbers typed into this app, and the assumption is printed for the
 * reader to argue with.
 *
 * It is deliberately not a bullish adjustment. It is symmetric, it still
 * stands down entirely on a company growing slower than the market
 * (see `GROWTH_RULE_FLOOR_PCT`), and the cap still binds the top.
 */
function growthMethod(
  f: CompanyFacts,
  eps: number | null
): FairValueMethod | null {
  if (!ok(eps)) return null;
  const growth =
    f.epsGrowthNextYear ?? f.epsGrowthThisYear ?? f.revenueGrowth;
  if (typeof growth !== "number" || !Number.isFinite(growth) || growth <= 0) {
    return null;
  }
  const source =
    f.epsGrowthNextYear != null || f.epsGrowthThisYear != null
      ? "the earnings growth analysts expect"
      : "its sales growth";
  const pct = growth * 100;
  /*
    The market's own expected growth, from the feed's index figures, so
    the comparison is against what the market is actually doing rather
    than against a constant typed in here. The fallback is the long-run
    average when the feed carried no index trend this session.
  */
  const marketPct =
    (f.marketLongTermGrowth ?? f.marketEpsGrowthNextYear ?? 0.12) * 100;

  /*
    Below the market's own pace this rule has nothing to say and says
    nothing. Floored at 8 it valued Coca-Cola, growing at about 7%, at
    eight times earnings, which is $26 against a share price of $88: a
    steady company growing with the economy is ordinarily priced near the
    market's multiple for reasons this rule knows nothing about, dividends
    and predictability among them.
  */
  if (pct < Math.max(marketPct, GROWTH_RULE_FLOOR_PCT)) return null;

  const multiple = Math.min(
    MARKET_EARNINGS_MULTIPLE + (pct - marketPct) * GROWTH_PREMIUM_PER_POINT,
    GROWTH_RULE_CEILING
  );
  return {
    id: "growth",
    name: "Priced for the growth it is showing",
    source: "the growth multiple",
    maker: "arithmetic",
    price: round2(eps * multiple),
    assumes: `That a company growing earnings at ${Math.round(pct)}% a year, against ${Math.round(marketPct)}% for the market as a whole, deserves about ${Math.round(multiple)} times a year's earnings. It anchors on the market's own multiple of ${MARKET_EARNINGS_MULTIPLE} and adds half a turn for each point of growth above the market, capped at ${GROWTH_RULE_CEILING}. It is a rule of thumb rather than a law, and it takes one year's expected growth as though it continued.`,
    /*
      The premium is written out only when there is one. A company growing
      at the market's own pace lands on the market's own multiple, and
      "plus half of the 0 points by which its growth beats the market's"
      is a sentence that reads as a bug in the arithmetic rather than as
      the arithmetic working correctly.
    */
    working: `Expected earnings of ${currency(eps, 2, f.currency ?? "USD")} a share multiplied by ${Math.round(multiple)}${
      Math.round(pct - marketPct) < 1
        ? `, the market's own multiple, because its growth of ${Math.round(pct)}% a year is the same pace as the market's. Growth taken from ${source}.`
        : `, which is ${MARKET_EARNINGS_MULTIPLE} plus half of the ${Math.round(pct - marketPct)} points by which its growth beats the market's, taken from ${source}.`
    }`,
    weight: 0.18,
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

/** The model's own reasoned path, one year out. Labelled as a model. */
function modelMethod(
  price: number | null | undefined,
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
      "That a general-purpose language model, reasoning about this company from what it already knows, is worth listening to. It cannot check itself, nothing here corrects it, and it is the one number on this page nobody can verify.",
    working: `The ${when} of the five-year path the model wrote for this company, which is the same path the Growth room uses.`,
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
 * Every method this app can run on this company, blended two ways.
 *
 * `modelYearOne` is the first year of the shared forecast path, which is
 * this calendar year's close rather than exactly twelve months out. That
 * is a real approximation and the copy beside it says so rather than
 * pretending the horizons line up.
 */
export function fairValueRead(
  f: CompanyFacts,
  input: { modelYearOne?: number | null } = {}
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

  /*
    Next year's expected earnings, because that is what every method here
    is measured against and what the market is actually pricing. Reading a
    fast-growing company off last year's profit is the fault that produced
    every unrealistic figure this file used to print.
  */
  const forwardEps = ok(f.epsNextYear)
    ? f.epsNextYear
    : ok(f.epsForward)
      ? f.epsForward
      : ok(f.forwardPe) && ok(f.price)
        ? f.price / f.forwardPe
        : null;

  const estimate = blendFairValue(
    [
      consensusMethod(f),
      growthMethod(f, forwardEps),
      modelMethod(input.modelYearOne, "first year"),
    ].filter((m): m is FairValueMethod => m !== null)
  );

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
