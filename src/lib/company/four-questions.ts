/**
 * The four questions somebody has to answer before they put their own
 * money into a company, answered in this company's own figures.
 *
 * They sit at the very top of the room because they are the research.
 * Everything under them, the valuation panel, the accounts, the argument,
 * is the working behind one of these four, and a reader who reads nothing
 * else has still done more thinking than the price chart they came from.
 *
 * The rule the whole file rests on is the room's rule: **every answer is a
 * figure the reader can check, or it is absent.** A question with nothing
 * behind it says so out loud (`NO_VALUE` in the figure, and a sentence
 * saying which reading the feed did not carry) rather than being answered
 * loosely, because a plausible sentence with no number in it is exactly
 * the writing this room exists to replace. None of the four is answered
 * with a verdict: the answers state what is true and hand the question
 * back, which is the same rule `valueGlance` follows.
 */
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";
import type { FairValueRead } from "@/lib/company/fair-value";
import { impliedGrowth } from "@/lib/company/fair-value";
import { MARKET_EARNINGS_MULTIPLE } from "@/lib/company/scale";
import { NO_VALUE, currency, number as num, percent } from "@/lib/format";

export type QuestionId = "history" | "assuming" | "quality" | "change-my-mind";

/** Who made the answer, in the same words the provenance mark uses. */
export type QuestionMaker = "arithmetic" | "market" | "model";

export type FourQuestionAnswer = {
  id: QuestionId;
  /** The question, in the reader's own words, unchanged between companies. */
  question: string;
  /** The one figure that answers it, or `NO_VALUE`. */
  figure: string;
  /** What that figure is, in a short label. */
  figureLabel: string;
  /** The answer, naming every number in it. */
  answer: string;
  /** The yardstick the answer was measured against, when there is one. */
  against: string | null;
  maker: QuestionMaker;
  /** True when the feed did not carry enough to answer it. */
  thin: boolean;
};

const QUESTIONS: Record<QuestionId, string> = {
  history: "Where does it sit against its own history, and on which yardstick?",
  assuming: "What is this price already assuming?",
  quality: "Am I confusing a great company with a good price?",
  "change-my-mind": "What would change my mind?",
};

function ok(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pos(v: number | null | undefined): v is number {
  return ok(v) && v > 0;
}

/**
 * Where in its own year the price sits, which is the only history figure
 * every kind of listing carries.
 *
 * A multiple against its own five-year average would be the better
 * yardstick and the feed does not publish one, so this says which
 * yardstick it is using rather than implying it used that one.
 */
export function rangePosition(f: CompanyFacts): number | null {
  const { price, fiftyTwoWeekHigh: high, fiftyTwoWeekLow: low } = f;
  if (!pos(price) || !pos(high) || !pos(low) || high <= low) return null;
  return Math.min(Math.max((price - low) / (high - low), 0), 1);
}

function historyAnswer(f: CompanyFacts): FourQuestionAnswer {
  const at = rangePosition(f);
  const base = {
    id: "history" as const,
    question: QUESTIONS.history,
    figureLabel: "Where it sits in its own year",
    maker: "market" as const,
  };
  if (at === null) {
    return {
      ...base,
      figure: NO_VALUE,
      answer:
        "The feed did not carry a high and a low for the last year, so there is nothing here to measure today's price against. Nothing was estimated in its place.",
      against: null,
      thin: true,
    };
  }
  const priced =
    pos(f.trailingPe) && pos(f.forwardPe)
      ? ` On the other yardstick, what you pay for a year of profit, it is ${num(f.forwardPe, 1)} times next year's earnings against ${num(f.trailingPe, 1)} times last year's.`
      : pos(f.forwardPe)
        ? ` On the other yardstick, what you pay for a year of profit, it is ${num(f.forwardPe, 1)} times next year's earnings.`
        : "";
  return {
    ...base,
    figure: percent(at, 0),
    answer: `${currency(f.price, 2)} today sits ${percent(at, 0)} of the way up the range it has traded in over the last year, from ${currency(f.fiftyTwoWeekLow, 2)} to ${currency(f.fiftyTwoWeekHigh, 2)}. That yardstick is the price alone: it says nothing about the business behind it, which is why it is one of two here.${priced}`,
    against: `${currency(f.fiftyTwoWeekLow, 2)} to ${currency(f.fiftyTwoWeekHigh, 2)} over the year`,
    thin: false,
  };
}

function assumingAnswer(f: CompanyFacts): FourQuestionAnswer {
  const base = {
    id: "assuming" as const,
    question: QUESTIONS.assuming,
    figureLabel: "Growth the price needs",
    maker: "arithmetic" as const,
  };
  if (isFundLike(f)) {
    return {
      ...base,
      figure: NO_VALUE,
      figureLabel: "What it costs a year",
      answer:
        "A fund's price is the sum of what it holds, so it is not assuming anything of its own. What it is assuming is whatever the companies inside it are, and the one number in your control is what it charges you each year.",
      against: null,
      thin: false,
    };
  }
  if (isCryptoLike(f)) {
    return {
      ...base,
      figure: NO_VALUE,
      answer:
        "There are no earnings behind this one, so there is no growth rate for the price to be assuming. What the price assumes is that somebody else will pay more, and nothing here can measure that.",
      against: null,
      thin: false,
    };
  }
  const implied = impliedGrowth(f);
  if (!implied) {
    if (pos(f.forwardPe)) {
      return {
        ...base,
        figure: percent(0, 0),
        figureLabel: "Growth the price needs",
        answer: `At ${num(f.forwardPe, 1)} times next year's earnings the price is at or under the ${MARKET_EARNINGS_MULTIPLE} times an ordinary profitable company has gone for, so it is not asking for growth above the market to make sense of itself. That is a statement about the price, not about whether the earnings arrive.`,
        against: `${MARKET_EARNINGS_MULTIPLE} times earnings, the ordinary multiple`,
        thin: false,
      };
    }
    return {
      ...base,
      figure: NO_VALUE,
      answer:
        "The feed carried no earnings estimate for this one, so there is no multiple to work backwards from and nothing here can say what the price is assuming.",
      against: null,
      thin: true,
    };
  }
  /*
    The market's own expected growth, next to the growth this price is
    asking for. When the two are within a point of each other the figure
    is printed twice in two sentences and reads as a fault, so that case
    says the thing the reader would have worked out from the repetition.
  */
  const close =
    ok(implied.marketRate) && Math.abs(implied.marketRate - implied.rate) < 0.01;
  const marketLine = !ok(implied.marketRate)
    ? ""
    : close
      ? " That is about what the market as a whole is expected to do, so on this measure the price is asking for no more than an ordinary company's growth."
      : ` The market as a whole is expected to grow earnings about ${percent(implied.marketRate, 0)} a year.`;
  return {
    ...base,
    figure: `${percent(implied.rate, 0)} a year`,
    answer: `To bring today's price back to the ${MARKET_EARNINGS_MULTIPLE} times earnings an ordinary profitable company goes for, this one would have to grow earnings about ${percent(implied.rate, 0)} a year for ${implied.years} years, starting from ${implied.basis}'s estimate. That is the size of the bet the price is making, worked out backwards with no discount rate and no model in it.${marketLine}`,
    against: `${MARKET_EARNINGS_MULTIPLE} times earnings in ${implied.years} years`,
    thin: false,
  };
}

/**
 * The two halves of the third question, kept apart on purpose.
 *
 * A great company and a good price are different measurements and the
 * whole point of the question is that they get confused, so the answer
 * prints one of each and refuses to add them up. Adding them up is a
 * rating, and this app does not rate anything.
 */
function qualityAnswer(f: CompanyFacts, read: FairValueRead): FourQuestionAnswer {
  const base = {
    id: "quality" as const,
    question: QUESTIONS.quality,
    figureLabel: "What it keeps of every $100",
    maker: "arithmetic" as const,
  };
  const margin = ok(f.profitMargin) ? f.profitMargin : null;
  const roe = ok(f.returnOnEquity) ? f.returnOnEquity : null;
  if (margin === null && roe === null) {
    return {
      ...base,
      figure: NO_VALUE,
      answer:
        "The feed carried neither a profit margin nor a return on equity for this one, so the quality half of this question cannot be answered here at all. The price half is in the panel below.",
      against: null,
      thin: true,
    };
  }
  const quality =
    margin !== null
      ? `It keeps ${currency(Math.max(margin, 0) * 100, 2)} of every $100 it sells${roe !== null ? `, and makes ${percent(roe, 0)} a year on the money its owners have left in it` : ""}.`
      : `It makes ${percent(roe ?? 0, 0)} a year on the money its owners have left in it.`;
  const gap = read.gap;
  const priceHalf =
    read.estimate.price !== null && ok(gap)
      ? ` The price half is separate: the ${read.estimate.used.length} ${read.estimate.used.length === 1 ? "method" : "methods"} below land at ${currency(read.estimate.price, 2)} twelve months out, ${percent(Math.abs(gap), 1)} ${gap > 0 ? "above" : "below"} today.`
      : " The price half could not be worked out for this one, so only half of this question is answered here.";
  return {
    ...base,
    figure: margin !== null ? currency(Math.max(margin, 0) * 100, 2) : percent(roe ?? 0, 0),
    answer: `${quality}${priceHalf} Those are two measurements, not one: a business can be the better one and the worse buy at the same time, and the two figures above are the two you would be trading off.`,
    against: margin !== null ? "every $100 of sales" : "the owners' own money",
    thin: false,
  };
}

/**
 * What would have to be true for the reader to be wrong, in the only two
 * places this app can honestly point at: a date, and a level.
 *
 * The written half of the room already carries a case against, and it is
 * the model's, so it is named as the model's here rather than folded in
 * as though the app worked it out. What is not the model's is the results
 * date and the level the reader's own plan calls the floor, and both are
 * checkable, which is why they lead.
 */
function changeMyMindAnswer(input: {
  facts: CompanyFacts;
  nextEarnings?: string | null;
  exitLevel?: number | null;
  againstPoint?: string | null;
}): FourQuestionAnswer {
  const { facts, exitLevel, againstPoint } = input;
  const base = {
    id: "change-my-mind" as const,
    question: QUESTIONS["change-my-mind"],
    figureLabel: "The level your plan calls the floor",
    maker: againstPoint ? ("model" as const) : ("arithmetic" as const),
  };
  const parts: string[] = [];
  if (pos(exitLevel) && pos(facts.price)) {
    const fall = (facts.price - exitLevel) / facts.price;
    parts.push(
      `A price of ${currency(exitLevel, 2)} is where the estimates below stop describing this company, which is ${percent(fall, 0)} under today. That is the level your own plan calls the floor, and it is yours to move.`
    );
  }
  if (input.nextEarnings) {
    parts.push(
      "The next set of results is the next time any of this can be checked against what the company actually did, rather than what anybody expects it to do."
    );
  }
  if (againstPoint) {
    parts.push(`The model's own answer to this, from the argument below: ${againstPoint}`);
  }
  if (parts.length === 0) {
    return {
      ...base,
      figure: NO_VALUE,
      answer:
        "There is no price level and no results date to hang this on for this one, so nothing here can tell you what would prove you wrong. That is worth knowing before you decide anything.",
      against: null,
      thin: true,
    };
  }
  return {
    ...base,
    figure: pos(exitLevel) ? currency(exitLevel, 2) : NO_VALUE,
    answer: parts.join(" "),
    against: pos(exitLevel) && pos(facts.price) ? `${currency(facts.price, 2)} today` : null,
    thin: false,
  };
}

/**
 * All four, in the order they are asked.
 *
 * Nothing is dropped: a question the feed could not answer is present and
 * says so, because a reader who cannot see that the third question went
 * unanswered will assume it was answered well.
 */
export function fourQuestions(input: {
  facts: CompanyFacts;
  read: FairValueRead;
  nextEarnings?: string | null;
  /** The bottom of the reader's own ladder, when one could be built. */
  exitLevel?: number | null;
  /** The first point of the model's case against, when the page has one. */
  againstPoint?: string | null;
}): FourQuestionAnswer[] {
  return [
    historyAnswer(input.facts),
    assumingAnswer(input.facts),
    qualityAnswer(input.facts, input.read),
    changeMyMindAnswer(input),
  ];
}
