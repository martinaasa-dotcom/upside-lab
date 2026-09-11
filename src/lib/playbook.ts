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
    says: "People are selling because prices are falling, rather than because of anything they have worked out about the companies.",
    idea: "A price falls furthest when the people selling have stopped asking what a business is worth and started asking how much more they could lose. That is also, by definition, the moment shares change hands for the least. The two are the same moment, which is why the sentence below is worth remembering and almost impossible to act on: it asks you to do the thing that feels worst exactly when it feels worst.",
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
      "Cheap is not the same as finished falling, and nothing in this reading says the low point is today. A price can be low because the people selling know something you have not read yet. Somebody acting on this sentence in September 2008 was right about the idea and six months early, which in money is indistinguishable from being wrong.",
    check:
      "The score below, the number of days the index has spent under its usual price, and whether the fall is in everything you own or in one company. Pulse answers that last one for each of your holdings.",
    terms: ["market"],
  },
  {
    id: "fear",
    label: "Fear",
    range: [26, 45],
    says: "Prices are falling and the mood is poor, without the panic of the band below.",
    idea: "Most falls are ordinary. The market has spent roughly one day in four below where it was three months earlier, for as long as anybody has kept records, and almost none of those stretches turned out to be the beginning of anything. The cost of treating every one of them as the exception is paid in the sales you make at the bottom of it.",
    quote: {
      text: "The stock market is a device for transferring money from the impatient to the patient.",
      author: "Warren Buffett",
    },
    goesWrong:
      "Patience is not the same as not looking. A price falling because the business behind it is getting worse is a different thing from a price falling because everything is, and the only way to tell them apart is to go and read about the company. Sitting still on purpose and sitting still because you would rather not know are the same action and not the same decision.",
    check:
      "Whether your own fall is bigger or smaller than the market's. If your holdings fell about as much as the index did, what happened was the market, not your companies.",
    terms: ["market", "recent-range"],
  },
  {
    id: "neutral",
    label: "Neutral",
    range: [46, 55],
    says: "Nothing in the readings is pulling in either direction.",
    idea: "This is what most days look like, and quiet stretches are where most people do themselves the most damage. Not through one bad decision, but through a long run of small adjustments made because doing nothing feels like wasting an opportunity. The decisions that matter are made in the loud weeks. What the quiet ones are good for is deciding, in advance and in writing, what you would do when the loud ones arrive.",
    quote: {
      text: "The big money is not in the buying and the selling, but in the waiting.",
      author: "Charlie Munger",
    },
    goesWrong:
      "Doing nothing is not automatically the right answer either, and a calm market is not proof that a portfolio is sound. Somebody holding one company at eighty per cent of everything they own is carrying the same risk on a quiet day as on a loud one. Quiet is when that is cheap to notice, because nothing is happening to make it feel urgent.",
    check:
      "Lab's own Risk tab, which puts a number on what a rough day would do to what you hold, and the mix, which shows how much of it rides on one name.",
    terms: ["spread-out", "share-of-portfolio"],
  },
  {
    id: "greed",
    label: "Greed",
    range: [56, 75],
    says: "Prices are rising and the mood is good.",
    idea: "A rising market makes almost everybody look skilled, and while the tide is coming in there is no way to separate the two from the outside, including from the inside. This is the state in which people conclude they have a knack for it, and the conclusion tends to arrive a few months before the evidence stops supporting it.",
    quote: {
      text: "I made all my money by selling too early.",
      author: "Bernard Baruch",
      attribution:
        "Repeated in many forms. The exchange-floor version, nobody ever went broke taking a profit, has no single author and is older than any of the people it gets attributed to.",
    },
    goesWrong:
      "This is the principle most often used to do real damage. Selling a good company because it has gone up is the commonest way an excellent result gets turned into an average one, and the arithmetic is brutal: nearly all of what a long-held portfolio ends up being worth comes from a handful of holdings that kept going far past the point where trimming them felt sensible. A price rising is not by itself a fact about a business.",
    check:
      "Whether the price has run ahead of what the company earns, or alongside it. The Research room prints both figures for any company, with its own multiple next to the market's.",
    terms: ["price-to-earnings"],
  },
  {
    id: "extreme-greed",
    label: "Extreme greed",
    range: [76, 100],
    says: "Prices have run a long way and the readings are near the top of their range.",
    idea: "The tell at the top is never that things look cheap. It is that the argument changes: the old ways of measuring are said to no longer apply, because a new kind of business, a new technology or a new era has made them obsolete. That argument has been made, in almost the same words, before every expensive market anybody has records of, and it has occasionally been right, which is what keeps it alive.",
    quote: {
      text: "The four most dangerous words in investing are: this time it's different.",
      author: "John Templeton",
    },
    second: {
      text: "The only function of economic forecasting is to make astrology look respectable.",
      author: "John Kenneth Galbraith",
    },
    goesWrong:
      "Expensive markets can stay expensive for years, and leaving one early costs real money. Somebody who stepped out in 1996 because prices looked mad was correct about the prices and missed the four largest years of the run that followed. Nobody can tell you where in one of these you are standing, and anybody who says they can is guessing with a straight face.",
    check:
      "What the price is assuming, which the Research room works out backwards for any company: the growth it would have to deliver for today's price to be ordinary rather than a bet.",
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
    title: "In the short run the price is a popularity contest. In the long run it is arithmetic.",
    quote: {
      text: "In the short run, the market is a voting machine, but in the long run it is a weighing machine.",
      author: "Benjamin Graham",
      attribution:
        "Graham used it for decades and Buffett repeats it. Graham credited the idea to his own teaching rather than to a single line in a single book.",
    },
    meaning:
      "Over a day or a month, a share price is the sum of what everybody currently feels about it, which can be almost anything. Over five or ten years it is pulled towards what the business actually earns, because that is the only thing that eventually has to be paid for. Neither half is more true than the other. They are just answering different questions.",
    inPractice:
      "It means a bad week tells you close to nothing and a bad five years tells you a great deal, and that the amount of attention worth paying to a price move should scale with how long the move has lasted.",
    goesWrong:
      "Waiting long enough does not make a poor business into a good one. Plenty of companies were weighed carefully over ten years and found to be worth less than they started. The long run is where the truth arrives, and the truth is sometimes that you were wrong.",
    terms: ["market"],
  },
  {
    id: "know-what-you-own",
    theme: "knowing",
    title: "If you cannot say what a company does in a sentence, you are not holding a company, you are holding a ticker.",
    quote: {
      text: "Know what you own, and know why you own it.",
      author: "Peter Lynch",
    },
    meaning:
      "Owning a share means owning a piece of a real business that sells something to somebody for money. The test is whether you could explain, without looking anything up, what that something is and who buys it. If you cannot, then every price move is noise to you, because you have no way of telling which ones mean anything.",
    inPractice:
      "It is the difference between a fall of 20% that sends you looking for what changed and a fall of 20% that just frightens you. Only one of those leads anywhere.",
    goesWrong:
      "Understanding a business is not the same as being right about it, and familiarity is the easiest thing in the world to mistake for insight. Plenty of people could explain exactly what their company did, in detail, all the way down.",
    terms: ["share"],
  },
  {
    id: "preparing-for-corrections",
    theme: "time",
    title: "Getting out of the way of a fall costs more, on average, than the falls do.",
    quote: {
      text: "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.",
      author: "Peter Lynch",
    },
    meaning:
      "A fall of about a tenth or more is the thing you will see called a correction, and preparing for one means being out of the market, or partly out, for some stretch of time. Falls are sharp and occasional, while the rises that pay for everything are spread thinly across years, so time spent waiting on the side is expensive in a way that does not feel expensive, because nothing visibly goes wrong while you wait.",
    inPractice:
      "The arithmetic of it is on this page, under where the returns actually come from. It is what the last ten years of the index came to with a small number of its best days taken out.",
    goesWrong:
      "This is not an argument that falls do not matter or that every price is worth paying. It is an argument about a particular habit, which is stepping out because a fall feels due. Somebody genuinely holding more than they can afford to see halved is not guessing at the market, they are fixing a real problem.",
    terms: ["market", "recent-range"],
  },
  {
    id: "what-you-dont-pay-for",
    theme: "cost",
    title: "A fee is the one number in investing that is certain.",
    quote: {
      text: "In investing, you get what you don't pay for.",
      author: "John C. Bogle",
    },
    meaning:
      "Every other figure on this page is an estimate. What something costs to hold is not: it comes off every year whether the year was good or bad, and it compounds against you in exactly the way returns compound for you. One per cent a year sounds like nothing and is roughly a quarter of a lifetime's growth.",
    inPractice:
      "For a fund it is the one number its holder actually controls, which is why the Research room prints the cost first on any fund, before what is inside it.",
    goesWrong:
      "Cheapest is not the same as best, and a low fee on something you did not want to own is not a saving. The point is that the cost is certain and the benefit is not, so the cost deserves more scrutiny than it usually gets, not that it is the only thing that matters.",
    terms: ["index-fund", "total-return"],
  },
  {
    id: "free-lunch",
    theme: "risk",
    title: "Spreading out is the one thing that improves your odds without costing you anything.",
    quote: {
      text: "Diversification is the only free lunch in investing.",
      author: "Harry Markowitz",
      attribution:
        "Markowitz is the economist whose work put numbers under this. The exact sentence is repeated more often than it is sourced.",
    },
    meaning:
      "Holding several things that do not all move together lowers how much the total swings about, without lowering what you expect to end up with. That combination is rare enough that economists call it the only one of its kind. It works because the things that go wrong for one company mostly are not the things that go wrong for another.",
    inPractice:
      "The catch is the phrase do not all move together. Ten companies that all sell to the same customers in the same industry are one bet held ten times over, which is exactly what Lab's Risk tab is drawing when it shows which of your companies move together.",
    goesWrong:
      "Spread far enough and you have bought the market, which is a perfectly reasonable thing to do and is not the same as picking well. Concentration is also how essentially every large fortune was made. Both of those are true, and which one applies depends on something no formula knows, which is how much you can afford to be wrong.",
    terms: ["spread-out", "index-fund"],
  },
  {
    id: "risk-is-not-swings",
    theme: "risk",
    title: "Risk is not how much a price jumps about. It is the chance of not getting your money back.",
    quote: {
      text: "Risk comes from not knowing what you're doing.",
      author: "Warren Buffett",
    },
    meaning:
      "The industry usually measures risk as how far a price travels in a typical day, which you will see called volatility, because that is the part that is easy to measure. It is not the thing that hurts people. What hurts is a permanent loss: a business that stops earning, a price you paid that was never going to be justified, or a sale you were forced into at the worst moment. A share that swings wildly and recovers has cost a patient holder nothing.",
    inPractice:
      "It means the question to ask of a holding is not how much it moves, but what would have to be true for it to be worth nothing, and how likely that is.",
    goesWrong:
      "Swings are not harmless either, and calling them noise is a comfortable thing to say when the number is going up. A price that halves is a real problem for anybody who might have to sell in the meantime, and borrowed money turns a swing into exactly the forced sale described above.",
    terms: ["recent-range"],
  },
  {
    id: "never-lose-money",
    theme: "risk",
    title: "Avoiding the disaster matters more than catching the rise.",
    quote: {
      text: "Rule number one: never lose money. Rule number two: never forget rule number one.",
      author: "Warren Buffett",
    },
    meaning:
      "This is not a claim that losses can be avoided, which would be silly coming from somebody who has had plenty. It is about the shape of the arithmetic. A fall and the rise needed to undo it are not the same size, and the gap between them grows fast: half your money back needs a double to get level. That asymmetry is why a portfolio that never has a catastrophic year can beat one that has several brilliant ones.",
    inPractice:
      "The slider on this page, under what a fall costs to undo, draws the gap: a quarter off needs a third back, and half off needs a double.",
    goesWrong:
      "Read literally it argues for never taking any risk at all, which guarantees a different loss: money that sits still while prices for everything else go up. Avoiding every fall and avoiding ruin are different projects, and only the second one is worth organising your life around.",
  },
  {
    id: "temperament",
    theme: "temperament",
    title: "This is not a test of how clever you are.",
    quote: {
      text: "Investing is not a game where the guy with the 160 IQ beats the guy with the 130 IQ.",
      author: "Warren Buffett",
    },
    meaning:
      "The hard part is not the analysis. It is staying with a decision you made calmly while the screen is telling you, hourly, that you were wrong. Almost everybody knows they should not sell in a panic. The knowing is not the difficulty. Most of what separates results is what people do in about five weeks out of every ten years.",
    inPractice:
      "It is why deciding in advance what would change your mind is worth more than any amount of extra research after the fact: the decision made calmly is the one worth keeping, and it has to exist before the week it is tested.",
    goesWrong:
      "Calm is not the same as correct, and a steady temperament applied to a bad idea just means holding it longer. Somebody perfectly unbothered by a price falling to nothing has not displayed discipline.",
  },
  {
    id: "sitting",
    theme: "temperament",
    title: "Most of the work is not doing anything.",
    quote: {
      text: "It never was my thinking that made the big money for me. It always was my sitting.",
      author: "Jesse Livermore",
      attribution:
        "From Reminiscences of a Stock Operator, 1923, which is a novel written about Livermore rather than by him. Everybody treats the line as his.",
    },
    meaning:
      "Activity feels like effort, and in almost every other part of life effort is rewarded. Here it mostly is not. Each round of buying and selling costs something, resets the clock on the thing that was compounding, and replaces a decision you made with time to think with one you made in a moment.",
    inPractice:
      "It is worth knowing that the person on the other side of a great many small adjustments is a broker who is paid whether you were right or not.",
    goesWrong:
      "Sitting still is a strategy only when it was chosen. Sitting still because you have not looked, or because selling would mean admitting something, is not patience. The two are impossible to tell apart from the outside and quite easy to tell apart from the inside, if you are honest.",
  },
  {
    id: "compounding",
    theme: "time",
    title: "The whole thing runs on not being interrupted.",
    quote: {
      text: "The first rule of compounding: never interrupt it unnecessarily.",
      author: "Charlie Munger",
    },
    meaning:
      "Money that grows on money it already grew is doing almost nothing for years and then a great deal, and the large part only exists because the small part was left alone. Most of what a long investment ends up being worth is created in its final stretch, which means anything that resets the clock is far more expensive than it looks at the time.",
    inPractice:
      "The Growth room draws exactly this: the same yearly rate over ten years against thirty, which is not three times as much money.",
    goesWrong:
      "Compounding is not a reason to never sell anything, and a holding that has stopped growing is not compounding, it is just sitting there. The rule protects the process, not any particular position.",
    terms: ["compounding"],
  },
  {
    id: "price-and-value",
    theme: "knowing",
    title: "What something costs and what it is worth are two different numbers.",
    quote: {
      text: "Price is what you pay. Value is what you get.",
      author: "Warren Buffett",
    },
    meaning:
      "The price is on the screen and is a fact. What the business is worth is an estimate, and everybody's is different, which is the entire reason a market exists: the buyer and the seller disagree about it. Somebody who has never separated the two in their head has no way to think about a price at all, because they have nothing to compare it to.",
    inPractice:
      "It is the whole design of the Research room's valuation panel: several estimates, each showing its working and its one assumption, set against today's price, with no verdict at the end because the conclusion is yours.",
    goesWrong:
      "Your estimate of what something is worth is also just an opinion, and being convinced is not evidence. The market is wrong often and is right more often than any individual is, and knowing which situation you are in is the hardest judgement in this entire subject.",
    terms: ["price-to-earnings", "market-value"],
  },
  {
    id: "decision-outcome",
    theme: "knowing",
    title: "A good decision and a good result are not the same thing.",
    quote: {
      text: "The quality of a decision cannot be determined by the outcome.",
      author: "Howard Marks",
      attribution:
        "A theme he returns to throughout The Most Important Thing, 2011, and his Oaktree memos.",
    },
    meaning:
      "Anything with luck in it can pay out well for a poor decision and badly for a sound one. Over a few years, results tell you much less about how well you are deciding than they appear to. Judging yourself purely on the number at the bottom of the screen teaches you the wrong lesson about half the time, and teaches it with total confidence.",
    inPractice:
      "The useful question after a holding does well is not whether you were right but whether you would make the same decision again knowing only what you knew then.",
    goesWrong:
      "Taken too far this becomes a way of never being wrong about anything: every loss reclassified as bad luck and every gain as judgement. Results are weak evidence, not no evidence, and a long enough run of them is the only evidence there is.",
  },
  {
    id: "inflation",
    theme: "cost",
    title: "Money left alone does not stay still. It shrinks quietly.",
    quote: {
      text: "Most of these currency-based investments are thought of as safe. In truth they are among the most dangerous of assets.",
      author: "Warren Buffett",
      attribution:
        "Berkshire Hathaway shareholder letter, 2011, about money held as cash, deposits and bonds.",
    },
    meaning:
      "Prices rise a little every year, so the same amount of money buys less of everything as time passes. Cash does not fall in a way anybody notices, which is exactly what makes it feel safe: the number on the statement never goes down. What goes down is what that number can buy, and over twenty or thirty years that quiet shrinking is larger than most of the falls people organise their lives around avoiding.",
    inPractice:
      "It means the choice is never between taking a risk and taking none. It is between a risk you can see day to day and one you cannot see at all.",
    goesWrong:
      "This is not an argument for holding nothing in cash. Money you might genuinely need inside a few years has no business being anywhere it could halve, and somebody forced to sell at the bottom because the rent was in the market has lost far more than inflation was ever going to take.",
    terms: ["cash", "total-return"],
  },
  {
    id: "turnover",
    theme: "cost",
    title: "The more often people trade, the worse they tend to do.",
    quote: {
      text: "Trading is hazardous to your wealth.",
      author: "Brad Barber and Terrance Odean",
      attribution:
        "The title of their 2000 study in the Journal of Finance, which read the accounts of 66,465 households. The fifth who traded most averaged about 11.4% a year against the market's 17.9%.",
    },
    meaning:
      "That study is one of the most robust findings anybody has produced about ordinary investors, and the gap is not explained by those people picking worse companies. It is the cost of the activity itself: every round trip has a spread and a fee, and each one replaces a decision made with time to think with one made in a moment.",
    inPractice:
      "It is the strongest argument there is for making fewer decisions and making them slowly, and it has nothing to do with being clever.",
    goesWrong:
      "Rarely is not never, and a rule about averages says nothing about any particular sale. Somebody holding a company whose situation has genuinely changed is not trading too much by selling it, and treating every sale as a lapse in discipline is its own way of losing money.",
  },
  {
    id: "position-size",
    theme: "risk",
    title: "How much you put in decides what being wrong costs you.",
    quote: {
      text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.",
      author: "George Soros",
    },
    meaning:
      "Picking well is hard and mostly outside anybody's control. How much of everything you own goes into one decision is entirely inside it, and it is the part that decides whether being wrong is a bad quarter or a changed life. Two people can hold exactly the same companies and have completely different outcomes because one of them put a twentieth into the risky one and the other put half.",
    inPractice:
      "It is the one question this app will actually answer about a purchase, because it is arithmetic rather than judgement: what a given amount would become as a share of everything you own, and what a quarter off it would cost.",
    goesWrong:
      "Sizing everything small guarantees that being right about something barely matters, which is its own kind of failure. Almost every large result in investing came from somebody holding enough of something for it to count.",
    terms: ["share-of-portfolio"],
  },
  {
    id: "crowd-is-not-evidence",
    theme: "crowd",
    title: "The crowd agreeing with you is not evidence, and neither is the crowd disagreeing.",
    quote: {
      text: "You are neither right nor wrong because the crowd disagrees with you. You are right because your data and your reasoning are right.",
      author: "Benjamin Graham",
      attribution:
        "The Intelligent Investor, in the chapter on margin of safety. Buffett quotes it often enough that it is frequently mistaken for his.",
    },
    meaning:
      "Every purchase has somebody on the other side of it who looked at roughly the same facts and reached the opposite conclusion. That should be uncomfortable, and the discomfort is the useful part: it is the reminder that agreement and disagreement are both just headcounts, and a headcount is not a reason.",
    inPractice:
      "The practical form is to be able to say what the person selling to you believes, in a sentence they would recognise. If you cannot, you do not yet know what you are betting on.",
    goesWrong:
      "This is regularly used to dismiss every objection as mere popular opinion, which turns a warning about the crowd into a licence to ignore everybody. The crowd is often right, and knowing when it is not is the hardest judgement in the subject rather than a matter of temperament.",
    terms: ["market"],
  },
  {
    id: "crowd",
    theme: "crowd",
    title: "By the time everybody agrees, the agreement is in the price.",
    quote: {
      text: "You can't buy what is popular and do well.",
      author: "Warren Buffett",
    },
    meaning:
      "A price already contains everything the people trading it collectively believe. So a widely held view about a company, however correct, is not an advantage: you are paying for it. The only thing that pays is being right about something not yet reflected in the price, which by construction means holding a view most people do not.",
    inPractice:
      "It is why the number of analysts who published a target matters less than how far apart their targets are. Forty people agreeing is a consensus. Forty people scattered is an argument, and an argument is where the disagreement lives.",
    goesWrong:
      "Being different is not the same as being right, and most people who hold an unpopular view hold it because it is wrong. Deliberately doing the opposite of the crowd is not a strategy, it is the same herd behaviour with the sign flipped.",
    terms: ["market", "price-to-earnings"],
  },
  {
    id: "what-you-know-for-sure",
    theme: "knowing",
    title: "The dangerous thing is not what you do not know.",
    quote: {
      text: "It ain't what you don't know that gets you into trouble. It's what you know for sure that just ain't so.",
      author: "Often attributed to Mark Twain",
      attribution:
        "There is no record of Twain writing or saying it. The earliest versions belong to the humorist Josh Billings. It is printed here under the name everybody knows it by, with the trail said out loud.",
    },
    meaning:
      "Gaps in what you know make you careful. Things you are certain of do not, and they are not audited, because certainty is exactly the state in which a person stops checking. The expensive mistakes in investing are nearly always made confidently.",
    inPractice:
      "It is the argument for writing down what would prove you wrong before you need it, and for reading the case against a company as carefully as the case for it.",
    goesWrong:
      "Doubting everything is not the answer either. Somebody who never reaches a conclusion never makes a decision, and never making a decision is itself a decision with a cost.",
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
