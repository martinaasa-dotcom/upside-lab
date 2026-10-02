/**
 * THE PLAYBOOK: WHAT A GOOD INVESTOR ACTUALLY KNOWS, SAID ONCE.
 *
 * Every other room in this app is about the reader's own rows. This one is
 * not about their money at all: it is the general knowledge that decides
 * what they do with it, which is the half nobody hands a beginner because
 * it does not fit in a product tour and cannot be sold as a feature.
 *
 * THE ONE RULE THAT MAKES THIS HONEST RATHER THAN A FORTUNE COOKIE.
 *
 * "Be greedy when others are fearful" printed on its own is a horoscope:
 * it flatters whoever reads it, it applies to every day of every year, and
 * it cannot be wrong. What makes it knowledge rather than a slogan is the
 * pair of things almost nobody prints beside it. The FIRST is the
 * condition: the sentence is about a measurable state of the world, and
 * the market publishes figures that say whether that state holds today, so
 * the band carries the reading and the reader can check it. The SECOND is
 * the counterweight: every principle in investing has an opposite that is
 * also true, and the whole skill is knowing which one the situation is
 * asking for. An app that prints one without the other has not taught
 * anybody anything, it has just given them a reason to do the thing they
 * already wanted to do.
 *
 * So every band and every idea in this file carries `goesWrong`, it is
 * never optional, and it is never a hedge tacked on the end. It is the
 * other half of the lesson.
 *
 * THE QUOTE RULE, WHICH IS WHY THIS ROOM DOES NOT BREAK THE ADVICE LINE.
 *
 * This app may not tell anybody to buy or sell anything. Several of the
 * best sentences ever written about investing are, grammatically, orders:
 * "be greedy", "never lose money", "never interrupt it unnecessarily". The
 * distinction that keeps this room inside the rule is structural rather
 * than a matter of care. A quotation is the app REPORTING what a named
 * person said, so it is always in quotation marks, always carries an
 * author, and the author is always somebody a reader can go and check. The
 * app's own sentences around it never give an instruction. `playbook.test.ts`
 * holds both halves: an instruction word in any of this file's own prose
 * fails, and a quote with no author fails.
 *
 * Attribution is checkable or it is marked. A line everybody repeats and
 * nobody can source is worth less than one with a name on it, so where the
 * trail is genuinely uncertain the entry says so in `attribution` rather
 * than printing a confident name. That costs a little of the ring of
 * authority and is the only version this product can print.
 *
 * SLANG. The standing ban is off here in exactly the narrow way AGENTS.md
 * allows, because this room is where the app defines things: the plain
 * phrase is always the sentence, and the outside word arrives after it,
 * named as somebody else's word, in a clause a reader can skip without
 * losing the meaning.
 */

import { ratingForScore } from "@/lib/market/fear-greed";

export type Quote = {
  text: string;
  author: string;
  /** Where it comes from, or why the trail is thinner than it looks. */
  attribution?: string;
};

/** Fear & Greed bands, as the people who publish the score define them. */
export type TemperatureBandId =
  | "extreme-fear"
  | "fear"
  | "neutral"
  | "greed"
  | "extreme-greed";

export type TemperatureBand = {
  id: TemperatureBandId;
  /** The band's own name, as published. */
  label: string;
  /** Low and high ends of the published score, both inclusive. */
  range: readonly [number, number];
  /** What this reading is describing, in one line. */
  says: string;
  /** The idea that belongs to this state of the world. */
  idea: string;
  quote: Quote;
  /** A second voice, where one earns its place. */
  second?: Quote;
  /** The other half of the lesson. Never optional. See the file note. */
  goesWrong: string;
  /** What a reader can look at to see this for themselves. */
  check: string;
  /**
   * Glossary keys for the words this card is actually about.
   *
   * The room teaches, and this app already has one place where a word is
   * defined and one surface that opens it, so a hand-typed definition in
   * here would be a second answer to a question `glossary.ts` already
   * answers everywhere else. Keys rather than prose, so this module stays
   * pure strings and the definition arrives with the reader's own figures
   * in it. Absent where a card is about no particular word, which is most
   * of them: a row of words on every card would be scaffolding rather than
   * help. `playbook.test.ts` fails on a key the glossary does not know.
   */
  terms?: readonly string[];
};

/*
  Bands are the published ones, not ones invented here.

  The score this ladder is drawn on is somebody else's measurement with
  somebody else's cut points, and re-cutting it would produce a picture
  that agrees with no other page a reader will ever see it on. The high
  ends come from `ratingForScore`, which is the one place in this app that
  knows where the lines are; `playbook.test.ts` walks every score from 0 to
  100 and fails if this ladder and that function ever disagree.
*/
export const TEMPERATURE_BANDS: readonly TemperatureBand[] = [
  {
    id: "extreme-fear",
    label: "Extreme fear",
    range: [0, 25],
    says: "People are selling because prices are falling, not because of the companies.",
    idea: "Prices fall furthest when sellers stop asking what a business is worth, which is also when shares change hands for the least, and when acting feels worst.",
    quote: {
      text: "Be fearful when others are greedy, and greedy when others are fearful.",
      author: "Warren Buffett",
      attribution: "Berkshire Hathaway shareholder letter, 1986.",
    },
    second: {
      text: "The time of maximum pessimism is the best time to buy, and the time of maximum optimism is the best time to sell.",
      author: "John Templeton",
      attribution:
        "Templeton said versions of this for decades. It is his, and the exact wording varies by source.",
    },
    goesWrong:
      "Low is not done falling. Acting on this in September 2008 was right and six months early, which in money looks the same as wrong.",
    check:
      "Whether the fall is in everything you own or in one company. Pulse answers that for each holding.",
    terms: ["market"],
  },
  {
    id: "fear",
    label: "Fear",
    range: [26, 45],
    says: "Prices are falling and the mood is poor, without panic.",
    idea: "Most falls are ordinary: about one day in four, the market sits below its level three months earlier. Treating each as the exception means selling at the bottom.",
    quote: {
      text: "The stock market is a device for transferring money from the impatient to the patient.",
      author: "Warren Buffett",
    },
    goesWrong:
      "Patience is not the same as not looking. A business getting worse falls too, and only reading about the company tells the two apart.",
    check:
      "Whether your holdings fell more than the market. If about the same, it was the market, not your companies.",
    terms: ["market", "recent-range"],
  },
  {
    id: "neutral",
    label: "Neutral",
    range: [46, 55],
    says: "Nothing in the readings pulls either way.",
    idea: "Most days look like this, and quiet stretches invite small, needless changes. They are the time to write down what you would do when it gets loud.",
    quote: {
      text: "The big money is not in the buying and the selling, but in the waiting.",
      author: "Charlie Munger",
    },
    goesWrong:
      "A calm market is not proof a portfolio is sound. One company at 80% of everything carries the same risk on a quiet day. It is just easier to notice then.",
    check:
      "Lab's Risk tab, for what a rough day would do, and the mix, for how much rides on one name.",
    terms: ["spread-out", "share-of-portfolio"],
  },
  {
    id: "greed",
    label: "Greed",
    range: [56, 75],
    says: "Prices are rising and the mood is good.",
    idea: "A rising market makes almost everybody look skilled. People tend to decide they have a knack a few months before the evidence stops backing it.",
    quote: {
      text: "I made all my money by selling too early.",
      author: "Bernard Baruch",
      attribution:
        "Repeated in many forms. The exchange-floor version, nobody ever went broke taking a profit, has no single author and is older than any of the people it gets attributed to.",
    },
    goesWrong:
      "Selling a good company just because it rose is the commonest way to turn a great result average. Most long-run growth comes from a few holdings that kept going.",
    check:
      "Whether the price has run ahead of what the company earns. Research prints both, beside the market's multiple.",
    terms: ["price-to-earnings"],
  },
  {
    id: "extreme-greed",
    label: "Extreme greed",
    range: [76, 100],
    says: "Prices have run a long way and the readings are near the top.",
    idea: "The tell at the top is the claim that old measures no longer apply because something new changed everything. It is made before nearly every peak, and is occasionally right.",
    quote: {
      text: "The four most dangerous words in investing are: this time it's different.",
      author: "John Templeton",
    },
    second: {
      text: "The only function of economic forecasting is to make astrology look respectable.",
      author: "John Kenneth Galbraith",
    },
    goesWrong:
      "High prices can stay high for years: leaving in 1996 because prices looked mad missed the four biggest years of the run. Nobody can tell where in one you stand.",
    check:
      "What the price is assuming: Research works out the growth today's price needs to be ordinary.",
    terms: ["price-to-earnings"],
  },
] as const;

/*
  ONE SET OF CUT POINTS, BECAUSE THE PICTURE WAS DRAWING EACH BOUNDARY
  TWICE FROM TWO DIFFERENT SUMS.

  The track paints a zone per band and a hairline at each boundary. Those
  were computed separately: the zones from each band's own width and the
  hairlines from each band's low end. The bands are integer buckets over
  0 to 100, which is 101 values, so the widths summed to 101% and flex
  shrank every zone to fit, while the hairlines stayed on the unshrunk
  scale. Measured on an 800px track the two disagreed by 2, 3.6, 4.4 and
  **6 pixels**, so every hairline sat to the right of the tone change it
  was supposed to mark, the gap widening across the picture.

  The cut between two adjacent bands is the half point between them, so
  the boundaries are 25.5, 45.5, 55.5 and 75.5, and the widths that follow
  sum to exactly 100. Both halves of the drawing read this, so they cannot
  drift again.
*/
export function bandCuts(): number[] {
  const cuts: number[] = [];
  for (let i = 0; i < TEMPERATURE_BANDS.length - 1; i++) {
    const lower = TEMPERATURE_BANDS[i]!;
    const upper = TEMPERATURE_BANDS[i + 1]!;
    cuts.push((lower.range[1] + upper.range[0]) / 2);
  }
  return cuts;
}

/** Each band's share of the 0 to 100 track, in order. Sums to 100. */
export function bandWidths(): number[] {
  const cuts = bandCuts();
  const edges = [0, ...cuts, 100];
  return TEMPERATURE_BANDS.map((_, i) => edges[i + 1]! - edges[i]!);
}

export function bandForScore(score: number): TemperatureBand {
  const rating = ratingForScore(score);
  const found = TEMPERATURE_BANDS.find(
    (b) => b.label.toLowerCase() === rating
  );
  // Unreachable while the test above passes. A band is better than a throw.
  return found ?? TEMPERATURE_BANDS[2]!;
}

/** Where a score sits along the whole 0 to 100 ladder, as a fraction. */
export function ladderPosition(score: number): number {
  if (!Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(1, score / 100));
}

export type IdeaTheme =
  | "temperament"
  | "time"
  | "risk"
  | "cost"
  | "crowd"
  | "knowing";

export const IDEA_THEMES: readonly { id: IdeaTheme; label: string }[] = [
  { id: "temperament", label: "Temperament" },
  { id: "time", label: "Time" },
  { id: "risk", label: "Risk" },
  { id: "cost", label: "Cost" },
  { id: "crowd", label: "The crowd" },
  { id: "knowing", label: "Knowing" },
];

export type Idea = {
  id: string;
  theme: IdeaTheme;
  /** The principle in the app's own plain words. Never an instruction. */
  title: string;
  quote: Quote;
  /** What it means, said so that somebody new to this understands it. */
  meaning: string;
  /** What it looks like in a real week, in concrete terms. */
  inPractice: string;
  /** The other half. Never optional. */
  goesWrong: string;
  /** Glossary keys. See the note on `TemperatureBand`. */
  terms?: readonly string[];
};

export const IDEAS: readonly Idea[] = [
  {
    id: "voting-weighing",
    theme: "time",
    title: "Short run, a popularity contest. Long run, arithmetic.",
    quote: {
      text: "In the short run, the market is a voting machine, but in the long run it is a weighing machine.",
      author: "Benjamin Graham",
      attribution:
        "Graham used it for decades and Buffett repeats it. Graham credited the idea to his own teaching rather than to a single line in a single book.",
    },
    meaning:
      "Day to day, a price is whatever everybody feels about it. Over five or ten years it is pulled towards what the business actually earns.",
    inPractice:
      "A bad week tells you almost nothing. A bad five years tells you a great deal.",
    goesWrong:
      "Waiting does not turn a poor business into a good one. Sometimes the long run's verdict is that you were wrong.",
    terms: ["market"],
  },
  {
    id: "know-what-you-own",
    theme: "knowing",
    title: "A company you cannot explain is just a ticker.",
    quote: {
      text: "Know what you own, and know why you own it.",
      author: "Peter Lynch",
    },
    meaning:
      "A share is a piece of a real business. If you cannot say what it sells and who buys it, every price move is noise to you.",
    inPractice:
      "It is the difference between a 20% fall that sends you looking for what changed and one that just frightens you.",
    goesWrong:
      "Understanding a business is not being right about it, and familiarity is easy to mistake for insight. Plenty of people could explain their company all the way down.",
    terms: ["share"],
  },
  {
    id: "preparing-for-corrections",
    theme: "time",
    title: "Dodging falls costs more than falls.",
    quote: {
      text: "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.",
      author: "Peter Lynch",
    },
    meaning:
      "A fall of about a tenth or more is what you will see called a correction. Falls are sharp and rare while the rises are spread thin over years, so waiting on the side costs money without feeling like it.",
    inPractice:
      "The figures are on this page, under where returns come from: ten years of the index with its best days taken out.",
    goesWrong:
      "This is about stepping out because a fall feels due, not a claim that falls do not matter. Holding more than you can afford to see halved is a real problem to fix.",
    terms: ["market", "recent-range"],
  },
  {
    id: "what-you-dont-pay-for",
    theme: "cost",
    title: "A fee is the one certain number.",
    quote: {
      text: "In investing, you get what you don't pay for.",
      author: "John C. Bogle",
    },
    meaning:
      "Every other figure here is an estimate. A fee comes off every year, good or bad, and compounds against you. One per cent a year is roughly a quarter of a lifetime's growth.",
    inPractice:
      "For a fund it is the one number its holder controls, so Research prints it first.",
    goesWrong:
      "The lowest fee is not the best holding, and a low fee on something you did not want is no saving. The cost is certain and the benefit is not, so it earns a close look.",
    terms: ["index-fund", "total-return"],
  },
  {
    id: "free-lunch",
    theme: "risk",
    title: "Spreading out lowers the swings for free.",
    quote: {
      text: "Diversification is the only free lunch in investing.",
      author: "Harry Markowitz",
      attribution:
        "Markowitz is the economist whose work put numbers under this. The exact sentence is repeated more often than it is sourced.",
    },
    meaning:
      "Holding things that do not all move together lowers the swings without lowering what you expect to end up with. What goes wrong for one company is mostly not what goes wrong for another.",
    inPractice:
      "The catch is do not all move together. Ten companies selling to the same customers are one bet held ten times, which Lab's Risk tab shows.",
    goesWrong:
      "Spread far enough and you own the market, which is reasonable and is not picking well. Most large fortunes came from concentration. Which applies depends on how much you can afford to be wrong.",
    terms: ["spread-out", "index-fund"],
  },
  {
    id: "risk-is-not-swings",
    theme: "risk",
    title: "Risk is permanent loss, not swings.",
    quote: {
      text: "Risk comes from not knowing what you're doing.",
      author: "Warren Buffett",
    },
    meaning:
      "Risk is usually measured as how far a price travels in a day, which you will see called volatility. What hurts is a permanent loss: a business that stops earning, or a sale forced at the worst moment.",
    inPractice:
      "The useful question is what would have to be true for a holding to be worth nothing, and how likely that is.",
    goesWrong:
      "Swings are not harmless. A halving hurts anybody who might have to sell meanwhile, and borrowed money turns a swing into a forced sale.",
    terms: ["recent-range"],
  },
  {
    id: "never-lose-money",
    theme: "risk",
    title: "Avoiding disaster beats catching the rise.",
    quote: {
      text: "Rule number one: never lose money. Rule number two: never forget rule number one.",
      author: "Warren Buffett",
    },
    meaning:
      "Losses cannot be avoided. The point is the arithmetic: a fall and the rise that undoes it are not the same size, so a portfolio with no disastrous year can beat one with several brilliant ones.",
    inPractice:
      "The slider on this page, under what a fall costs to undo, draws the gap: a quarter off needs a third back, and half off needs a double.",
    goesWrong:
      "Read literally it argues for no risk at all, which guarantees a different loss: money standing still while prices rise. Avoiding every fall and avoiding ruin are different projects.",
  },
  {
    id: "temperament",
    theme: "temperament",
    title: "Not a test of cleverness.",
    quote: {
      text: "Investing is not a game where the guy with the 160 IQ beats the guy with the 130 IQ.",
      author: "Warren Buffett",
    },
    meaning:
      "The hard part is not the analysis. It is staying with a calm decision while the screen says hourly that you were wrong, mostly in about five weeks out of every ten years.",
    inPractice:
      "Deciding in advance what would change your mind is worth more than any research after the fact.",
    goesWrong:
      "Calm is not the same as correct. A steady temperament applied to a bad idea just means holding it longer.",
  },
  {
    id: "sitting",
    theme: "temperament",
    title: "Most of the work is doing nothing.",
    quote: {
      text: "It never was my thinking that made the big money for me. It always was my sitting.",
      author: "Jesse Livermore",
      attribution:
        "From Reminiscences of a Stock Operator, 1923, which is a novel written about Livermore rather than by him. Everybody treats the line as his.",
    },
    meaning:
      "Activity feels like effort, and here effort is rarely rewarded. Each trade costs something and resets the clock on whatever was compounding.",
    inPractice:
      "The broker on the other side of many small adjustments is paid whether you were right or not.",
    goesWrong:
      "Sitting still is a strategy only when it was chosen. Sitting still to avoid looking, or to avoid admitting something, is not patience.",
  },
  {
    id: "compounding",
    theme: "time",
    title: "Compounding runs on not being interrupted.",
    quote: {
      text: "The first rule of compounding: never interrupt it unnecessarily.",
      author: "Charlie Munger",
    },
    meaning:
      "Money growing on its own growth does little for years and then a great deal. Most of the value arrives at the end, so resetting the clock costs more than it looks.",
    inPractice:
      "The Growth room draws it: the same yearly rate over thirty years makes far more than three times what ten does.",
    goesWrong:
      "This is not a reason never to sell, and a holding that stopped growing is not compounding. The rule protects the process, not any one holding.",
    terms: ["compounding"],
  },
  {
    id: "price-and-value",
    theme: "knowing",
    title: "Price and worth are two different numbers.",
    quote: {
      text: "Price is what you pay. Value is what you get.",
      author: "Warren Buffett",
    },
    meaning:
      "The price is a fact on the screen. What the business is worth is an estimate, and buyer and seller disagree about it, which is why a market exists.",
    inPractice:
      "Research's valuation panel works this way: several estimates, each with its working, set against today's price, and no verdict.",
    goesWrong:
      "Your estimate of worth is an opinion too, and being convinced is not evidence. The market is wrong often, and right more often than any one person.",
    terms: ["price-to-earnings", "market-value"],
  },
  {
    id: "decision-outcome",
    theme: "knowing",
    title: "A good decision is not a good result.",
    quote: {
      text: "The quality of a decision cannot be determined by the outcome.",
      author: "Howard Marks",
      attribution:
        "A theme he returns to throughout The Most Important Thing, 2011, and his Oaktree memos.",
    },
    meaning:
      "Luck can reward a poor decision and punish a sound one. Over a few years, results say less about how well you decide than they seem to.",
    inPractice:
      "After a win, the useful question is whether you would decide the same again knowing only what you knew then.",
    goesWrong:
      "Taken too far, every loss becomes bad luck and every gain judgement. Results are weak evidence, not no evidence.",
  },
  {
    id: "inflation",
    theme: "cost",
    title: "Cash left alone shrinks quietly.",
    quote: {
      text: "Most of these currency-based investments are thought of as safe. In truth they are among the most dangerous of assets.",
      author: "Warren Buffett",
      attribution:
        "Berkshire Hathaway shareholder letter, 2011, about money held as cash, deposits and bonds.",
    },
    meaning:
      "Prices rise a little every year, so the same money buys less. The number on the statement never falls, which is what makes cash feel safe.",
    inPractice:
      "The choice is never risk against no risk. It is a risk you can see against one you cannot.",
    goesWrong:
      "Money you may need within a few years has no business anywhere it could halve. Selling at the bottom because the rent was invested costs more than inflation would.",
    terms: ["cash", "total-return"],
  },
  {
    id: "turnover",
    theme: "cost",
    title: "Frequent traders tend to do worse.",
    quote: {
      text: "Trading is hazardous to your wealth.",
      author: "Brad Barber and Terrance Odean",
      attribution:
        "The title of their 2000 study in the Journal of Finance, which read the accounts of 66,465 households. The fifth who traded most averaged about 11.4% a year against the market's 17.9%.",
    },
    meaning:
      "It is one of the firmest findings about ordinary investors. The gap was not worse picks but the cost of trading itself: a spread and a fee on every round trip.",
    inPractice:
      "It argues for fewer decisions made slowly, and it has nothing to do with being clever.",
    goesWrong:
      "A rule about averages says nothing about one sale. Selling a company whose situation really changed is not trading too much.",
  },
  {
    id: "position-size",
    theme: "risk",
    title: "Size decides what being wrong costs.",
    quote: {
      text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.",
      author: "George Soros",
    },
    meaning:
      "Picking well is hard to control. How much goes into one decision is entirely yours, and it decides whether being wrong is a bad quarter or a changed life.",
    inPractice:
      "It is the one purchase question this app answers, because it is arithmetic: what an amount becomes as a share of everything, and what a quarter off it costs.",
    goesWrong:
      "Sizing everything small means being right barely matters. Almost every large result came from holding enough of something for it to count.",
    terms: ["share-of-portfolio"],
  },
  {
    id: "crowd-is-not-evidence",
    theme: "crowd",
    title: "The crowd's view is not evidence.",
    quote: {
      text: "You are neither right nor wrong because the crowd disagrees with you. You are right because your data and your reasoning are right.",
      author: "Benjamin Graham",
      attribution:
        "The Intelligent Investor, in the chapter on margin of safety. Buffett quotes it often enough that it is frequently mistaken for his.",
    },
    meaning:
      "Every purchase has somebody on the other side who read the same facts and decided the opposite. Agreement and disagreement are both headcounts, and a headcount is not a reason.",
    inPractice:
      "If you cannot say what the person selling to you believes, you do not yet know what you are betting on.",
    goesWrong:
      "This gets used to dismiss every objection as popular opinion. The crowd is often right, and telling when it is not is the hardest judgement here.",
    terms: ["market"],
  },
  {
    id: "crowd",
    theme: "crowd",
    title: "What everybody agrees on is in the price.",
    quote: {
      text: "You can't buy what is popular and do well.",
      author: "Warren Buffett",
    },
    meaning:
      "A price already holds what everybody trading it believes, so a widely held view, however correct, is paid for. Only being right about something not yet in the price pays.",
    inPractice:
      "So how far apart analysts' targets sit matters more than how many there are. Forty agreeing is a consensus. Forty scattered is an argument.",
    goesWrong:
      "Different is not right, and most unpopular views are unpopular because they are wrong. Doing the opposite of the crowd is the same herd with the sign flipped.",
    terms: ["market", "price-to-earnings"],
  },
  {
    id: "what-you-know-for-sure",
    theme: "knowing",
    title: "Certainty, not ignorance, is the danger.",
    quote: {
      text: "It ain't what you don't know that gets you into trouble. It's what you know for sure that just ain't so.",
      author: "Often attributed to Mark Twain",
      attribution:
        "There is no record of Twain writing or saying it. The earliest versions belong to the humorist Josh Billings. It is printed here under the name everybody knows it by, with the trail said out loud.",
    },
    meaning:
      "Gaps in what you know make you careful. Certainty does not, because it is when people stop checking. The costly mistakes are nearly always made confidently.",
    inPractice:
      "It argues for writing down what would prove you wrong, and reading the case against a company as carefully as the case for.",
    goesWrong:
      "Doubting everything is no answer either. Never reaching a conclusion is itself a decision, and it has a cost.",
  },
] as const;

/**
 * The app's own prose, for the test that keeps this room descriptive.
 *
 * Deliberately does NOT include quote text: a quotation is the app
 * reporting what somebody said, which is why every one of them carries an
 * author. See the file note.
 */
export function ownProse(): string[] {
  const out: string[] = [];
  for (const b of TEMPERATURE_BANDS) {
    out.push(b.label, b.says, b.idea, b.goesWrong, b.check);
  }
  for (const i of IDEAS) {
    out.push(i.title, i.meaning, i.inPractice, i.goesWrong);
  }
  return out;
}

export function allQuotes(): Quote[] {
  const out: Quote[] = [];
  for (const b of TEMPERATURE_BANDS) {
    out.push(b.quote);
    if (b.second) out.push(b.second);
  }
  for (const i of IDEAS) out.push(i.quote);
  return out;
}
