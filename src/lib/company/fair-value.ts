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
import { currency, number } from "@/lib/format";
import { bigMoney } from "@/lib/company/readings";
import type { CompanyFacts } from "@/lib/company/facts";

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
 * The long-run average number of dollars the whole US market has paid for
 * $1 of annual profit. Broad, checkable, and deliberately not per-sector:
 * a per-sector table is a house view about what a company ought to look
 * like, which is exactly what this product took out of the forecast.
 */
export const MARKET_EARNINGS_MULTIPLE = 20;

/** What a long-term owner is assumed to want back each year, for the cash
 * flow method. Ordinary for a stock, and stated wherever it is used. */
const DISCOUNT_RATE = 0.09;
/** What growth is assumed to fade to. Roughly the economy's own pace. */
const TERMINAL_GROWTH = 0.025;
const DCF_YEARS = 10;

/**
 * A share count in words. A large company has tens of billions of them,
 * and "24,400.0 million shares" is a figure nobody says out loud.
 */
function shareCount(n: number): string {
  if (n >= 1e9) return `${number(n / 1e9, 1)} billion shares`;
  if (n >= 1e6) return `${number(n / 1e6, 1)} million shares`;
  return `${number(n, 0)} shares`;
}

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

/** What it would be worth if the market paid it the ordinary price for profit. */
function earningsMethod(
  f: CompanyFacts,
  eps: number | null,
  horizon: "today" | "ahead"
): FairValueMethod | null {
  if (!ok(eps)) return null;
  return {
    id: `earnings-${horizon}`,
    name: "Priced like the average company",
    maker: "arithmetic",
    price: round2(eps * MARKET_EARNINGS_MULTIPLE),
    assumes: `That this company deserves the same price for its profit as the market pays on average, about ${MARKET_EARNINGS_MULTIPLE} dollars for every $1 a year. A faster-growing company usually deserves more than that, and a shrinking one less.`,
    working: `${horizon === "ahead" ? "Profit per share expected next year" : "Profit per share over the last twelve months"}, ${currency(eps, 2, f.currency ?? "USD")}, multiplied by ${MARKET_EARNINGS_MULTIPLE}.`,
    weight: 0.25,
  };
}

/**
 * The same idea with the growth put back in: a company growing profits at
 * 20% a year is allowed a multiple of about 20. The oldest rule of thumb
 * in the business, and it is a rule of thumb, which the copy says.
 */
function growthMethod(
  f: CompanyFacts,
  eps: number | null
): FairValueMethod | null {
  if (!ok(eps)) return null;
  const g = f.revenueGrowth;
  if (typeof g !== "number" || !Number.isFinite(g)) return null;
  const pct = g * 100;
  // Below the economy's own pace this method has nothing to say, and above
  // 40 it produces multiples nobody has ever paid for long.
  const multiple = Math.min(Math.max(pct, 8), 40);
  if (pct <= 0) return null;
  return {
    id: "growth",
    name: "Priced for the growth it is showing",
    maker: "arithmetic",
    price: round2(eps * multiple),
    assumes: `That a company growing at ${Math.round(pct)}% a year deserves to be priced at about ${Math.round(multiple)} dollars for every $1 of annual profit. It is an old rule of thumb, not a law, and it assumes this growth keeps up.`,
    working: `Profit per share, ${currency(eps, 2, f.currency ?? "USD")}, multiplied by ${Math.round(multiple)}, which is the sales growth rate in percent held between 8 and 40.`,
    weight: 0.12,
  };
}

/**
 * What the cash the business actually throws off is worth today.
 *
 * The most defensible method here and the most sensitive to its own
 * assumptions, which is why both of them are printed rather than buried.
 * Growth fades from what the company is doing now to the economy's own
 * pace over ten years, and the result is discounted at what a long-term
 * owner would want back.
 */
function cashFlowMethod(f: CompanyFacts): FairValueMethod | null {
  const fcf = f.freeCashFlow;
  const shares = f.sharesOutstanding;
  const code = f.currency ?? "USD";
  if (!ok(fcf) || !ok(shares)) return null;
  const start = Math.min(
    Math.max(typeof f.revenueGrowth === "number" ? f.revenueGrowth : 0.05, 0),
    0.25
  );
  let cash = fcf;
  let value = 0;
  for (let year = 1; year <= DCF_YEARS; year++) {
    // Growth fades linearly from where it is now to the economy's pace.
    const g =
      start + ((TERMINAL_GROWTH - start) * (year - 1)) / (DCF_YEARS - 1);
    cash = cash * (1 + g);
    value += cash / Math.pow(1 + DISCOUNT_RATE, year);
  }
  const terminal =
    (cash * (1 + TERMINAL_GROWTH)) / (DISCOUNT_RATE - TERMINAL_GROWTH);
  value += terminal / Math.pow(1 + DISCOUNT_RATE, DCF_YEARS);
  const net = (f.totalCash ?? 0) - (f.totalDebt ?? 0);
  const perShare = (value + net) / shares;
  if (!ok(perShare)) return null;
  return {
    id: "cash-flow",
    name: "What the cash it produces is worth",
    maker: "arithmetic",
    price: round2(perShare),
    assumes: `That the spare cash this business produces grows from ${Math.round(start * 100)}% a year down to ${Math.round(TERMINAL_GROWTH * 100)}% over ten years, and that an owner wants ${Math.round(DISCOUNT_RATE * 100)}% a year back for the risk. Change either of those and this number moves a long way.`,
    working: `Ten years of spare cash starting from ${bigMoney(fcf, code)}, each year discounted back at ${Math.round(DISCOUNT_RATE * 100)}%, plus a value for everything after that at ${Math.round(TERMINAL_GROWTH * 100)}% forever, ${net >= 0 ? "plus" : "minus"} ${bigMoney(Math.abs(net), code)} of ${net >= 0 ? "net cash" : "net debt"}, divided by ${shareCount(shares)}.`,
    weight: 0.25,
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

  const today = blendFairValue(
    [
      earningsMethod(f, epsTrailing, "today"),
      growthMethod(f, epsTrailing),
      cashFlowMethod(f),
    ].filter((m): m is FairValueMethod => m !== null)
  );

  const ahead = blendFairValue(
    [
      consensusMethod(f),
      earningsMethod(f, epsForward, "ahead"),
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
