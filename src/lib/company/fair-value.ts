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
import { currency } from "@/lib/format";
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
  /** What the arithmetic makes it worth on today's figures. */
  today: FairValueBlend;
  /** Where the same methods, run forward, put it a year out. */
  ahead: FairValueBlend;
  /** Today's actual share price, for the comparison the reader wants. */
  spot: number | null;
  /** Spot against the blend, as a fraction. Positive means dearer. */
  gapToday: number | null;
  gapAhead: number | null;
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
  const weight = n >= 10 ? 0.35 : n >= 3 ? 0.28 : n >= 1 ? 0.15 : 0.1;
  const code = f.currency ?? "USD";
  const spread =
    ok(f.analystTargetHigh) && ok(f.analystTargetLow)
      ? ` Their own answers run from ${currency(f.analystTargetLow, 2, code)} to ${currency(f.analystTargetHigh, 2, code)}, which is the part an average hides.`
      : "";
  return {
    id: "consensus",
    name: "What Wall Street expects",
    maker: "market",
    price: round2(target),
    assumes: `That the ${n > 0 ? `${n} analyst${n === 1 ? "" : "s"} covering this company` : "analysts covering this company"} have it about right. They are paid to be right and are often wrong together.${spread}`,
    working: `The plain average of the twelve-month price targets published by the ${n > 0 ? n : ""} analyst${n === 1 ? "" : "s"} who cover it.`.replace("  ", " "),
    weight,
  };
}

/**
 * What it would be worth if the market paid it the ordinary price for
 * profit, on the profit it is actually expected to make.
 *
 * The horizon is the whole argument here, and getting it wrong is what
 * made the first version of this file produce nonsense. Run on **last
 * year's** profit, a company whose earnings are about to double comes out
 * at a fraction of its share price with nothing wrong in the arithmetic:
 * the profit being paid for has not happened yet, so of course last year's
 * does not justify the price. Measured on AMD in September 2026 that was
 * the difference between an estimate of $78 and one of $309 a share.
 *
 * So the profit figure is the analysts' own estimate for the year in
 * question, and the label says which year it is. Trailing earnings are
 * used only when there is no estimate, and then only for the "today"
 * blend, where they are the honest answer to "what does it earn now".
 */
function earningsMethod(
  f: CompanyFacts,
  input: { eps: number | null; horizon: "today" | "ahead"; basis: string }
): FairValueMethod | null {
  const { eps, horizon, basis } = input;
  if (!ok(eps)) return null;
  return {
    id: `earnings-${horizon}`,
    name: "Priced like the average company",
    maker: "arithmetic",
    price: round2(eps * MARKET_EARNINGS_MULTIPLE),
    assumes: `That this company deserves the same price for its profit as the market pays on average, about ${MARKET_EARNINGS_MULTIPLE} times a year's earnings. A company growing faster than the market usually trades above that and a shrinking one below, so read this as the market's own yardstick rather than as a target.`,
    working: `${basis}, ${currency(eps, 2, f.currency ?? "USD")} a share, multiplied by ${MARKET_EARNINGS_MULTIPLE}.`,
    weight: 0.22,
  };
}

/**
 * The same idea with the growth put back in: a company compounding
 * earnings at 20% a year is allowed roughly a 20 times multiple. The
 * oldest rule of thumb in the business, and it is a rule of thumb, which
 * the copy says out loud.
 *
 * The growth figure is **earnings** growth where the feed has an estimate
 * and sales growth only as a fallback, because the multiple being set is a
 * multiple of earnings and the two can differ by a lot in a company whose
 * margins are moving.
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
    This rule of thumb is a growth-company rule and it stands down on a
    company that is not one, rather than flooring.

    Floored at 8, it valued Coca-Cola, growing earnings at about 7% a
    year, at eight times earnings, which is $26 against a share price of
    $88 and is not an estimate anybody would defend. A steady company
    growing in line with the economy is ordinarily priced near the
    market's own multiple for reasons this rule knows nothing about:
    dividends, predictability, and the fact that it will still be here.
    Saying nothing is the right answer, and the market-multiple method
    beside it is the one built for exactly this company.
  */
  if (pct < GROWTH_RULE_FLOOR_PCT) return null;
  const multiple = Math.min(pct, 40);
  return {
    id: "growth",
    name: "Priced for the growth it is showing",
    maker: "arithmetic",
    price: round2(eps * multiple),
    assumes: `That a company growing earnings at ${Math.round(pct)}% a year deserves about ${Math.round(multiple)} times a year's earnings. It is an old rule of thumb rather than a law, it is capped at 40 times because nothing sustains more than that for long, and it assumes the growth keeps up.`,
    working: `Expected earnings of ${currency(eps, 2, f.currency ?? "USD")} a share multiplied by ${Math.round(multiple)}, taken from ${source} and held between 8 and 40.`,
    weight: 0.2,
  };
}

/**
 * THERE IS NO DISCOUNTED CASH FLOW HERE, AND THAT IS A DECISION.
 *
 * One was built, shipped in the first draft of this file, and taken out
 * again, because it was confidently wrong rather than merely uncertain
 * and the reason is in the data rather than in the method.
 *
 * The only cash figure this feed supplies is `freeCashflow`, which it
 * computes after interest and debt service. That is not what anybody else
 * means by free cash flow and it is wrong by a factor of two or three on
 * ordinary companies: measured in September 2026, Nvidia reported
 * $41.8 billion of it against $134.4 billion of operating cash flow, and
 * Coca-Cola $5.2 billion against $16.3 billion. Projecting ten years off a
 * starting number that far out and then discounting it produces a figure
 * with a great deal of arithmetic behind it and no relationship to the
 * company. It valued Coca-Cola at $11 a share against a price of $88.
 *
 * There was a second bug on top of it worth recording, because it is the
 * one somebody re-adding this will hit: a stream that has already paid its
 * interest is an equity stream, so adding net cash and subtracting debt on
 * top of it counts the balance sheet twice. Coca-Cola was being charged
 * $40 billion of debt it had already serviced.
 *
 * The honest fix needs capital spending, which this feed no longer carries
 * (`cashflowStatementHistory` comes back empty, and the library says so).
 * So the method is out until there is an input worth running it on, and
 * what replaced it is `impliedGrowth` below: the same question asked
 * backwards, from figures that are solid.
 */

/**
 * What the price is assuming, which is the question a valuation is really
 * a proxy for.
 *
 * Rather than tell somebody what a share is worth, this tells them what
 * has to happen for today's price to make sense: the annual earnings
 * growth needed, over five years, to bring the multiple down to what the
 * market ordinarily pays. It is one line of arithmetic on two figures that
 * are solid, it makes no assumption about a discount rate or a terminal
 * value, and it is the thing a professional actually asks. It is also the
 * fairest possible framing for a company that looks expensive: the price
 * is not wrong, it is a bet, and this is the size of the bet.
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
  // Already at or below the market's ordinary multiple: the price is
  // assuming nothing in particular, and there is no bet to size.
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

  /*
    A fund and a coin get no valuation, and this guard is not tidiness.

    Every method here prices a claim on a company's earnings. A fund owns
    hundreds of companies and its price is the sum of theirs by
    construction, so "priced like the average company" applied to an index
    fund is circular: measured on SPY it produced an estimate of $619
    against a price of $770, which reads as a judgement about the S&P 500
    and is really just the feed's own blended multiple divided by twenty.
    A coin has no earnings at all, so there is nothing for any of this to
    divide. Both are answered honestly elsewhere on the page, a fund by
    what it holds and what it costs, a coin by saying there are no
    accounts behind it.
  */
  if (isFundLike(f) || isCryptoLike(f)) {
    const none: FairValueBlend = {
      price: null,
      used: [],
      dropped: [],
      spread: null,
      confidence: "none",
    };
    return {
      today: none,
      ahead: none,
      spot,
      gapToday: null,
      gapAhead: null,
    };
  }
  const epsTrailing = ok(f.epsTrailing)
    ? f.epsTrailing
    : ok(f.trailingPe) && ok(f.price)
      ? f.price / f.trailingPe
      : null;
  const epsForward = ok(f.epsForward)
    ? f.epsForward
    : ok(f.forwardPe) && ok(f.price)
      ? f.price / f.forwardPe
      : null;

  /*
    Which profit figure each blend is entitled to, and this is the whole
    correctness of the file.

    "Today" is what the company is worth on what it earns now, so it uses
    this year's expected earnings, falling back to the last twelve months
    where no estimate exists. "A year out" is what it is worth on what it
    is expected to earn then, so it uses next year's estimate. Running
    both off trailing earnings, which is what this did first, prices a
    company whose profits are about to double as though they were not, and
    the arithmetic looks perfectly sound the whole way down.
  */
  const nowEps = ok(f.epsThisYear) ? f.epsThisYear : epsTrailing;
  const nowBasis = ok(f.epsThisYear)
    ? "The earnings analysts expect this year"
    : "Earnings over the last twelve months";
  const aheadEps = ok(f.epsNextYear)
    ? f.epsNextYear
    : ok(f.epsForward)
      ? f.epsForward
      : epsForward;
  const aheadBasis = ok(f.epsNextYear)
    ? "The earnings analysts expect next year"
    : "The earnings expected for the year ahead";

  const today = blendFairValue(
    [
      earningsMethod(f, { eps: nowEps, horizon: "today", basis: nowBasis }),
      growthMethod(f, nowEps),
    ].filter((m): m is FairValueMethod => m !== null)
  );

  const ahead = blendFairValue(
    [
      consensusMethod(f),
      earningsMethod(f, { eps: aheadEps, horizon: "ahead", basis: aheadBasis }),
      growthMethod(f, aheadEps),
      modelMethod(input.modelYearOne, "first year"),
    ].filter((m): m is FairValueMethod => m !== null)
  );

  return {
    today,
    ahead,
    spot,
    gapToday:
      spot && today.price ? (spot - today.price) / today.price : null,
    gapAhead:
      spot && ahead.price ? (ahead.price - spot) / spot : null,
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
  const prices = [...read.today.used, ...read.ahead.used].map((m) => m.price);
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

  if (spot > high) {
    return {
      position: "above",
      low,
      high,
      read: `Today's price is above every estimate on this page, the highest of which is ${currency(high, 2)}.`,
      nextQuestion:
        "So the price is a bet that this company does better than the figures below currently suggest. What has to go right is the thing to read next.",
    };
  }
  if (spot < low) {
    return {
      position: "below",
      low,
      high,
      read: `Today's price is below every estimate on this page, the lowest of which is ${currency(low, 2)}.`,
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
      ? `The methods on this page disagree by a factor of ${(high / low).toFixed(1)}, from ${currency(low, 2)} to ${currency(high, 2)}, and today's price is somewhere in the middle of that.`
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
