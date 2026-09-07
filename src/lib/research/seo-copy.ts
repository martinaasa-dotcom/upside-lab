/**
 * What a public research page says to a search engine, and the questions
 * it answers out loud on the page itself.
 *
 * Everything in here is pure, because every sentence it writes is a claim
 * a stranger reads before they know anything about this product, and a
 * claim like that has to be testable without a network in the room. The
 * whole file is figures out of `CompanyFacts` and `FairValueRead` put into
 * sentences, and where the figure is absent the sentence is absent too.
 *
 * **The line this file may not cross is the one the whole room is built
 * on.** A search engine's most valuable query about a company is whether
 * to buy it, and this app may not answer that. What it does instead is
 * what `valueGlance` does one level up: state where the price sits among
 * estimates it has shown, name what each figure is, and hand the decision
 * back. The one query where that difference is the product rather than a
 * limitation is "should I buy", so the page answers that heading with a
 * plain no and says what it will tell them instead. `research-seo.test.ts`
 * fails on a verdict or an instruction word in any output here.
 *
 * The second rule is the app's own: no market slang a beginner has not met
 * before, no dashes used as a clause break, and no figure rounded into
 * existence. A page written for a search engine is still read by a person,
 * and the person is the one this product is for.
 */
import { NO_VALUE, currency, percent, signedPercent } from "@/lib/format";
import type { CompanyFacts } from "@/lib/company/facts";
import { isCryptoLike, isFundLike } from "@/lib/company/facts";
import type { FairValueRead } from "@/lib/company/fair-value";
import { analystSpread, valueGlance } from "@/lib/company/fair-value";
import { PRODUCT_NAME } from "@/lib/product";

export type ResearchQuestion = {
  /** Stable across companies, so the same block can be tested. */
  id: string;
  /** The heading, phrased the way somebody would type it. */
  question: string;
  /** The answer, every figure in it named. Never an instruction. */
  answer: string;
};

/**
 * The short name people actually use, out of the provider's legal one.
 *
 * Suffixes are stripped from the **end** and only from the end, one at a
 * time, because several of these words are ordinary English in the middle
 * of a name: taking "Company" wherever it appeared turned "Test Company
 * Inc." into "Test", and there are real listings that would go the same
 * way. Trailing punctuation left behind by the strip goes too, since
 * "Deere &" is not a name anybody would write.
 */
const LEGAL_SUFFIX =
  /[,\s]+(?:Inc|Incorporated|Corp|Corporation|Company|Co|Ltd|Limited|PLC|N\.V|S\.A|AG|SE|Holdings?|Group)\.?$/i;

export function plainCompanyName(facts: CompanyFacts): string {
  const raw = (facts.name ?? "").trim();
  if (!raw) return facts.ticker;
  let name = raw;
  // One suffix at a time, because "Alphabet Holdings Inc." carries two.
  for (let i = 0; i < 3; i += 1) {
    const next = name.replace(LEGAL_SUFFIX, "").trim();
    if (next === name || !next) break;
    name = next;
  }
  name = name.replace(/[\s,&]+$/, "").trim();
  return name || raw;
}

function kindWord(facts: CompanyFacts): "fund" | "coin" | "company" {
  if (isFundLike(facts)) return "fund";
  if (isCryptoLike(facts)) return "coin";
  return "company";
}

/**
 * The longest a company name may be and still fit in the title.
 *
 * A title tag is cut off around sixty characters in a result list, and
 * this one has to carry the ticker (the word in the query), the phrase
 * people search next to it, and the product suffix the layout appends.
 * That leaves about twenty characters for the name, which "Apple" and
 * "Berkshire Hathaway" fit inside and "Taiwan Semiconductor Manufacturing"
 * does not. A name that does not fit is dropped rather than cut: a
 * half-word in brackets reads as a bug, and the name is on the page in
 * three other places.
 */
const TITLE_NAME_MAX = 22;

/**
 * The title tag.
 *
 * Built around the two things people actually type next to a ticker, which
 * are what it is worth and what the analysts think, and it says the ticker
 * first because that is the word in the query. The company name is in
 * brackets after it rather than in front: a person scanning a result page
 * for NVDA finds NVDA at the left edge, and the name is what confirms they
 * have the right one.
 *
 * A fund and a coin get a different title because they get a different
 * page: neither has an estimate on it, and promising one in the title is
 * the search result lying about the page behind it, which costs more than
 * the click is worth. Neither carries its name either, because a fund's
 * registered name is most of a title on its own.
 */
export function researchTitle(facts: CompanyFacts): string {
  const name = plainCompanyName(facts);
  const tag = facts.ticker;
  switch (kindWord(facts)) {
    case "fund":
      return `${tag}: what is inside it and what it costs`;
    case "coin":
      return `${tag}: price, range and what it is not`;
    default:
      return name && name !== tag && name.length <= TITLE_NAME_MAX
        ? `${tag} (${name}) fair value and price target`
        : `${tag} fair value and price target`;
  }
}

/**
 * The meta description, and it is figures rather than adjectives.
 *
 * A description made of promises ("everything you need to know about
 * NVDA") is interchangeable with every other result on the page. One
 * carrying the actual share price, the actual estimate and the actual gap
 * is the only one on that page a person can check before clicking, and it
 * is also the only honest way to describe a page whose whole argument is
 * that you can check it.
 */
export function researchDescription(
  facts: CompanyFacts,
  read: FairValueRead | null
): string {
  const code = facts.currency ?? "USD";
  const name = plainCompanyName(facts);
  const parts: string[] = [];

  if (typeof facts.price === "number" && facts.price > 0) {
    parts.push(`${name} trades at ${currency(facts.price, 2, code)}`);
  } else {
    parts.push(`${name}, ${facts.ticker}`);
  }

  const estimate = read?.estimate.price ?? null;
  if (estimate !== null) {
    const count = read?.estimate.used.length ?? 0;
    parts.push(
      `${count} method${count === 1 ? "" : "s"} put it at ${currency(estimate, 2, code)} in twelve months`
    );
  } else if (typeof facts.analystTargetMean === "number") {
    parts.push(
      `analysts average ${currency(facts.analystTargetMean, 2, code)} over twelve months`
    );
  }

  parts.push(
    `Every figure named, with the working and a link to where it came from. ${PRODUCT_NAME} is not an adviser`
  );
  return `${parts.join(". ")}.`;
}

/**
 * The questions the page answers under their own headings.
 *
 * These are headings before they are structured data. Somebody arriving
 * from a search has one question, and a page that makes them read four
 * panels to find it has answered nobody; a heading that repeats their own
 * words and a figure directly under it has. That the same set makes a
 * clean `FAQPage` is a consequence rather than the reason, and no answer
 * here is written for a rich result: each one is the sentence the page
 * would want anyway.
 *
 * A question the feed could not answer is **dropped**, never printed with
 * `n/a` under it. A missing cell inside a panel of figures is honest,
 * because the panel around it makes clear what is missing; a whole heading
 * with nothing under it reads as a page that broke.
 */
export function researchQuestions(input: {
  facts: CompanyFacts;
  read: FairValueRead | null;
}): ResearchQuestion[] {
  const { facts, read } = input;
  const code = facts.currency ?? "USD";
  const name = plainCompanyName(facts);
  const tag = facts.ticker;
  const out: ResearchQuestion[] = [];

  const estimate = read?.estimate.price ?? null;
  if (read && estimate !== null) {
    const glance = valueGlance(read);
    const methods = read.estimate.used.map((m) => m.name).join(", ");
    out.push({
      id: "worth",
      question: `What is ${name} worth?`,
      answer: `Nobody can tell you that, and anybody who says they can is guessing. What can be said is what each method produces. ${read.estimate.used.length} of them run on the figures this page carries (${methods}), and together they put ${tag} at ${currency(estimate, 2, code)} in twelve months. ${glance.read} Each method is listed further down with the one assumption it rests on, so you can throw out the ones you disagree with.`,
    });
  }

  const spread = analystSpread(facts);
  if (
    typeof facts.analystTargetMean === "number" &&
    typeof facts.analystCount === "number"
  ) {
    const range =
      typeof facts.analystTargetLow === "number" &&
      typeof facts.analystTargetHigh === "number"
        ? ` The lowest of them is ${currency(facts.analystTargetLow, 2, code)} and the highest ${currency(facts.analystTargetHigh, 2, code)}, which is the part almost nobody prints: it says whether that average is a consensus or the midpoint of an argument.`
        : "";
    const agreement = spread?.contested
      ? " That range is wider than the share price itself, which means the people who do this for a living cannot agree within a factor of two."
      : "";
    out.push({
      id: "target",
      question: `What is the analyst price target for ${tag}?`,
      answer: `${facts.analystCount} analysts have published a twelve month target and they average ${currency(facts.analystTargetMean, 2, code)}.${range}${agreement} A target is one person's spreadsheet, and forty of them agreeing is a different thing from one.`,
    });
  }

  if (
    typeof facts.price === "number" &&
    facts.price > 0 &&
    typeof facts.epsThisYear === "number" &&
    facts.epsThisYear > 0
  ) {
    const multiple = facts.price / facts.epsThisYear;
    const market =
      typeof facts.marketEpsGrowthThisYear === "number"
        ? ` The whole market is expected to grow earnings ${percent(facts.marketEpsGrowthThisYear, 0)} this year, so that is the number to hold ${tag}'s own beside.`
        : "";
    const growth =
      typeof facts.epsGrowthThisYear === "number"
        ? ` ${name} is expected to grow earnings ${percent(facts.epsGrowthThisYear, 0)} this year.${market}`
        : "";
    out.push({
      id: "assuming",
      question: `What is the ${tag} share price assuming?`,
      answer: `At ${currency(facts.price, 2, code)} you are paying about ${multiple.toFixed(1)} times what ${name} is expected to earn per share this year.${growth} That multiple is the bet in one number: it is what has to be earned, and kept being earned, for today's price to have been a sensible one.`,
    });
  }

  if (
    typeof facts.fiftyTwoWeekLow === "number" &&
    typeof facts.fiftyTwoWeekHigh === "number" &&
    typeof facts.price === "number"
  ) {
    const span = facts.fiftyTwoWeekHigh - facts.fiftyTwoWeekLow;
    const where =
      span > 0
        ? Math.round(((facts.price - facts.fiftyTwoWeekLow) / span) * 100)
        : null;
    out.push({
      id: "range",
      question: `Where is ${tag} trading against its own year?`,
      answer: `Over the last twelve months ${tag} has traded between ${currency(facts.fiftyTwoWeekLow, 2, code)} and ${currency(facts.fiftyTwoWeekHigh, 2, code)}.${where === null ? "" : ` Today's price sits about ${where}% of the way up that range.`} It is the one yardstick every listing carries, and it says where the price has been rather than where it should be.`,
    });
  }

  if (typeof facts.revenueGrowth === "number" || typeof facts.profitMargin === "number") {
    const bits: string[] = [];
    if (typeof facts.revenueGrowth === "number") {
      bits.push(`revenue grew ${signedPercent(facts.revenueGrowth, 0)} over the last year`);
    }
    if (typeof facts.profitMargin === "number") {
      bits.push(
        `out of every $100 customers pay them, ${Math.round(facts.profitMargin * 100)} is profit`
      );
    }
    out.push({
      id: "business",
      question: `Is ${name} actually making money?`,
      answer: `${bits.join(", and ")}. The four years and the last four quarters are both on this page, with the margin worked out for each, so you can read down the column and see whether a business getting bigger is getting better at it.`,
    });
  }

  /*
    The one query this product answers differently from everybody else, so
    it is answered out loud rather than dodged. A page that quietly has no
    section for it looks like a page hiding something; a page that says no
    and then says what it will do instead is the product's whole argument
    in one paragraph.
  */
  out.push({
    id: "advice",
    question: `Does ${PRODUCT_NAME} say whether to buy ${tag}?`,
    answer: `No. ${PRODUCT_NAME} is not an adviser and this page contains no rating, no score and no recommendation, because the answer depends on how long you plan to hold it and on everything else you already own, neither of which a page can see. What it does instead is name every figure, say what each one is measured against, show the working behind each estimate, and link to where the number came from so you can check it. The decision stays yours.`,
  });

  return out;
}

/**
 * The line under the heading, in the reader's own terms.
 *
 * A stranger who arrived from a search has not met this product and has no
 * reason to trust it, so the lede says what the page is made of rather
 * than what the app is for. The pitch comes at the foot, after the page
 * has done something for them.
 */
export function researchLede(facts: CompanyFacts): string {
  const name = plainCompanyName(facts);
  switch (kindWord(facts)) {
    case "fund":
      return `What is actually inside ${name}, what it costs to hold, and how concentrated it is. A fund is not a company, so there is no valuation here and nothing pretending to be one.`;
    case "coin":
      return `${name} files no accounts, earns nothing and owns nothing, so there is nothing to value it against except what somebody else will pay. The price and the range below are real. Everything a company page does is missing on purpose.`;
    default:
      return `What ${name} does, what the accounts say, what the price is assuming, and both sides of the argument. Every figure is the real one, named properly, with a plain sentence under it and a link back to where it came from.`;
  }
}

/** The stamp under the price. A static page that hides its age is lying. */
export function asOfLine(fetchedAt: string | null | undefined): string {
  if (!fetchedAt) return NO_VALUE;
  const at = new Date(fetchedAt);
  if (Number.isNaN(at.getTime())) return NO_VALUE;
  return at.toISOString().slice(0, 10);
}
