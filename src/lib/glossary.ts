/**
 * Every word this app prints that a beginner would have to look up, said
 * plainly once, in one place.
 *
 * The rule the product already follows is that nothing a person reads uses
 * market slang. That rule cannot reach every word, because some of them are
 * the real names of real things: a share, a dividend, what you paid, the
 * price today. A reader meeting one of those for the first time should not
 * have to leave the app to find out what it is, and should not have to ask
 * Margus either, because the answer never changes and asking a model a
 * settled question is slower and less reliable than reading it.
 *
 * Two sentences each, and the second one is the point: it says the idea
 * again with the reader's own number in it, because "what you paid" means
 * nothing until it means "$4,120 for your twelve Apple shares". The example
 * is a function the caller feeds from what is already on screen, so nothing
 * here fetches anything and nothing here can be stale.
 *
 * What belongs here: a word the app itself prints. What does not: anything
 * this app has decided not to say at all (sleeve, tape, dry powder), which
 * belongs in the ban list rather than in a dictionary, and anything that
 * would amount to telling somebody what to do with their money.
 *
 * `alsoCalled` is the one place in the whole product where a banned word may
 * be printed, and it earns that because of what the ban was quietly costing.
 * A reader who learns here that "how much of everything you own sits in one
 * company" matters, and then opens their broker or reads one article about
 * their own holdings, meets the word concentration and does not know it is
 * the same idea. An app that refuses to ever print the outside word protects
 * nobody: it teaches the thing and then leaves the reader unable to recognise
 * it anywhere else, which is the opposite of the point. So the plain phrase
 * is always the entry, always first, and always carries the meaning on its
 * own; the outside word arrives afterwards, named as somebody else's word,
 * and a reader who stops reading before it has lost nothing.
 */

export type GlossaryExample = {
  /** The reader's own figures, already formatted by the caller. */
  ticker?: string;
  amount?: string;
  second?: string;
  count?: number;
};

export type GlossaryEntry = {
  id: string;
  /** The word as the app prints it. */
  term: string;
  /** Other spellings a caller may look up. */
  also?: string[];
  /** Two sentences. The first says what it is, the second why it matters. */
  meaning: string;
  /**
   * What the rest of the world calls this, for the reader who is about to
   * meet the word somewhere that will not explain it. Never load-bearing:
   * the entry has to read correctly with this clause deleted.
   */
  alsoCalled?: string;
  /**
   * The same idea with the reader's own numbers in it, or null when the
   * caller has nothing to put in. Never invents a figure.
   */
  example?: (input: GlossaryExample) => string | null;
};

const ENTRIES: GlossaryEntry[] = [
  {
    id: "share",
    term: "Share",
    also: ["shares"],
    meaning:
      "A share is one small piece of a company. Owning ten shares of a company means you own ten pieces of it, however many pieces there are in total.",
    example: ({ ticker, count }) =>
      ticker && count != null
        ? `You hold ${count} ${count === 1 ? "share" : "shares"} of ${ticker}.`
        : null,
  },
  {
    id: "paid-each",
    term: "Paid each",
    also: ["average buy", "buy price", "cost basis", "what you paid"],
    meaning:
      "The average price you paid for one share, across every share of that company you own. It is the number your gain is measured against, so it matters more than the price on the day you bought.",
    alsoCalled: "cost basis",
    example: ({ ticker, amount }) =>
      ticker && amount
        ? `On ${ticker} that average is ${amount} a share.`
        : null,
  },
  {
    id: "cost",
    term: "Cost",
    meaning:
      "Everything you have put into a holding: the shares you own times the average price you paid for one. It is the money you handed over, not what the holding is worth now.",
    example: ({ ticker, amount }) =>
      ticker && amount ? `Your cost on ${ticker} is ${amount}.` : null,
  },
  {
    id: "value",
    term: "Value",
    also: ["worth now"],
    meaning:
      "What a holding would be worth if you sold it at today's price: the shares you own times the price right now. It moves every day the market is open, whether you do anything or not.",
    alsoCalled: "market value",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} is worth ${amount} today.` : null,
  },
  {
    id: "gain",
    term: "Gain",
    also: ["roi", "gain %", "gain $", "return"],
    meaning:
      "The difference between what a holding is worth now and what you paid for it. It is on paper until you sell, which means it can change back.",
    alsoCalled: "your return, or an unrealised gain while you still hold it",
    example: ({ ticker, amount, second }) =>
      ticker && amount
        ? `On ${ticker} that is ${amount}${second ? `, or ${second} of what you paid` : ""}.`
        : null,
  },
  {
    id: "today",
    term: "Today's move",
    also: ["today"],
    meaning:
      "How much the price has changed since the market closed yesterday. It says nothing on its own about whether the company is doing well.",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} has moved ${amount} today.` : null,
  },
  {
    id: "share-of-portfolio",
    term: "Share of your portfolio",
    also: ["% of portfolio", "% of total", "% total", "concentration"],
    meaning:
      "How much of everything you own sits in one company. The larger it is, the more that one company decides how your year goes.",
    alsoCalled: "concentration, or position size",
    example: ({ ticker, second }) =>
      ticker && second ? `${ticker} is ${second} of what you own.` : null,
  },
  {
    id: "cash",
    term: "Cash",
    meaning:
      "Money in the account that is not in any company. It counts towards what your portfolio is worth, and it can be less than nothing if you borrowed to buy.",
    example: ({ amount }) => (amount ? `You are holding ${amount}.` : null),
  },
  {
    id: "borrowed",
    term: "Borrowed money",
    also: ["margin", "negative cash"],
    meaning:
      "Money your broker lent you, so what you hold is worth more than the money you put in. If it falls far enough, the broker can sell part of it without asking you first.",
    alsoCalled: "margin, or buying on margin",
    example: ({ amount }) => (amount ? `You have borrowed ${amount}.` : null),
  },
  {
    id: "thesis",
    term: "Thesis",
    also: ["why you own it"],
    meaning:
      "The reason to own a company rather than the price it happens to be at. Pulse checks each day whether the news and the price still fit that reason, which is how you tell a real change from a price simply moving.",
    alsoCalled: "an investment thesis",
    example: ({ ticker }) =>
      ticker ? `Pulse reads ${ticker} against it every day.` : null,
  },
  {
    id: "recent-range",
    term: "Recent range",
    meaning:
      "The lowest and highest a price has been over the last stretch of weeks. Knowing where today sits inside it says whether a move is unusual for that company.",
    alsoCalled: "the 52-week range, and how far a price usually travels is called volatility",
    example: ({ ticker, amount, second }) =>
      ticker && amount && second
        ? `${ticker} has been between ${amount} and ${second}.`
        : null,
  },
  {
    id: "results-day",
    term: "Results day",
    also: ["earnings", "reports"],
    meaning:
      "The day a company tells everybody how much it sold and earned in the last three months. Prices often move more than usual that day, in either direction.",
    alsoCalled: "earnings, or an earnings report",
    example: ({ ticker, second }) =>
      ticker && second ? `${ticker} reports ${second}.` : null,
  },
  {
    id: "dividend",
    term: "Dividend",
    meaning:
      "A share of a company's profit paid out in cash to the people who own it, usually every three months. Not every company pays one, and a company can stop.",
  },
  {
    id: "index-fund",
    term: "Index fund",
    also: ["fund", "etf"],
    meaning:
      "One holding that quietly owns hundreds of companies at once, in the same proportions as a published list. Buying one is how a person owns a whole market without picking anything.",
    alsoCalled: "an ETF, or a tracker",
    example: ({ ticker }) =>
      ticker ? `${ticker} is one of these.` : null,
  },
  {
    id: "market",
    term: "The market",
    meaning:
      "All the companies bought and sold together, usually summed up by an index like the S&P 500. When it falls, most companies fall with it whatever their own news.",
  },
  {
    id: "compounding",
    term: "Compounding",
    meaning:
      "Growth earning growth: this year's gain is added to the pot, and next year's gain is worked out on the larger pot. It is slow at first and does most of its work late.",
  },
  {
    id: "split",
    term: "Share split",
    meaning:
      "A company turning each share into several smaller ones, so the price per share falls and you hold more of them. Nothing you own changed in value on the day it happened.",
    alsoCalled: "a stock split",
  },
  {
    id: "covered-call",
    term: "Covered call",
    meaning:
      "An agreement to sell shares you already own at a set price, if the buyer wants them, in return for a payment now. Most people never use one and this app is complete without them.",
  },
  {
    id: "strike",
    term: "Strike",
    meaning:
      "The price you agreed to sell at in one of those agreements. If the share price passes it, the buyer can take the shares at that price and you keep the payment.",
    example: ({ ticker, amount }) =>
      ticker && amount ? `Yours on ${ticker} is ${amount}.` : null,
  },
  {
    id: "premium",
    term: "Premium",
    meaning:
      "The payment you receive for making that agreement. It is yours whether or not the shares are ever taken.",
  },
  {
    id: "total-return",
    term: "Total return",
    also: ["since it started", "return since the start"],
    meaning:
      "Everything a portfolio has made or lost since the day it started, in one figure, rather than only what happened today. It is measured against the money that went in at the beginning.",
    example: ({ amount, second }) =>
      amount && second ? `That is ${amount} on the ${second} it began with.` : null,
  },
  {
    id: "paper-money",
    term: "Paper money",
    also: ["pretend money", "paper portfolio"],
    meaning:
      "Buying and selling written down without any money changing hands, so you can watch how a decision would have turned out. Nothing is really bought, nothing can really be lost, and nothing can really be taken out either.",
    alsoCalled: "paper trading",
  },
  {
    id: "sell-if",
    term: "Sell rule",
    also: ["sell if", "exit plan", "what would make him sell"],
    meaning:
      "The thing somebody decides in advance would make them sell, written down while they are calm rather than on the day the price moves. It is what turns selling into a decision you already made instead of a reaction.",
    example: ({ ticker }) =>
      ticker ? `The one written for ${ticker} is in this card.` : null,
  },
  {
    id: "spread-out",
    term: "How spread out it is",
    also: ["spread", "diversification"],
    meaning:
      "Whether the money sits in a few companies or many. Spread out means no single company decides how the year goes; the opposite means one of them mostly does.",
    alsoCalled: "diversification",
    example: ({ count }) =>
      count != null
        ? `This one behaves like ${count.toFixed(1)} holdings of equal size.`
        : null,
  },
  {
    id: "market-value",
    term: "What the whole company is worth",
    also: ["market cap", "market capitalisation", "market capitalization", "size"],
    meaning:
      "What it would cost to buy every share of a company at today's price. It is the market's running total of what the whole business is worth, and it moves with the share price rather than with anything the company did that day.",
    alsoCalled: "market cap",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} comes to ${amount}.` : null,
  },
  {
    id: "sales",
    term: "What customers paid them",
    also: ["revenue", "sales", "turnover", "top line"],
    meaning:
      "All the money customers handed over in a year, before any of the costs of running the business are taken out. It is the size of what the company does, not what it keeps.",
    alsoCalled: "revenue",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} took in ${amount} over the last year.` : null,
  },
  {
    id: "sales-growth",
    term: "Whether that is growing",
    also: ["revenue growth", "growth rate"],
    meaning:
      "How much more, or less, customers paid them than in the same stretch a year earlier. One year on its own is weather; several years pointing the same way is the thing worth knowing.",
    alsoCalled: "revenue growth",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} is at ${amount}.` : null,
  },
  {
    id: "profit-margin",
    term: "Whether they make money",
    /*
      Deliberately not "margin" on its own: that alias already belongs to
      borrowed money, where a margin call is the thing a reader most needs
      the word for, and one word opening two entries would hand somebody
      the wrong definition at the worst moment.
    */
    also: ["profit margin", "net margin", "profitability"],
    meaning:
      "How much of every $100 customers pay is left over once everything has been paid for. A company can sell an enormous amount and keep none of it, which is why this sits beside the sales figure rather than under it.",
    alsoCalled: "profit margin",
    example: ({ ticker, amount }) =>
      ticker && amount ? `On ${ticker} that is ${amount} of every $100.` : null,
  },
  {
    id: "debt",
    term: "Cash against what they owe",
    also: ["debt", "net debt", "balance sheet", "borrowings"],
    meaning:
      "The money the company is holding, set against the money it has borrowed and has to pay back. More cash than debt means a bad year is survivable without asking anybody; the other way round means the lenders have a say in how the story goes.",
    alsoCalled: "net cash or net debt",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} nets out at ${amount}.` : null,
  },
  {
    id: "price-to-earnings",
    term: "How expensive the shares are",
    also: ["p/e", "pe ratio", "price to earnings", "earnings multiple", "valuation"],
    meaning:
      "How many dollars you are paying today for each $1 of profit the company makes in a year. A high number is not automatically bad: it usually means people expect the profit to grow, and it does mean more has to go right for the price to make sense.",
    alsoCalled: "the P/E ratio",
    example: ({ ticker, amount }) =>
      ticker && amount ? `${ticker} trades at ${amount}.` : null,
  },
];

const BY_KEY = new Map<string, GlossaryEntry>();
for (const entry of ENTRIES) {
  BY_KEY.set(entry.id, entry);
  BY_KEY.set(entry.term.toLowerCase(), entry);
  for (const alias of entry.also ?? []) BY_KEY.set(alias.toLowerCase(), entry);
}

export const GLOSSARY: readonly GlossaryEntry[] = ENTRIES;

/** Look a term up by its id, the word itself, or a spelling of it. */
export function glossaryEntry(key: string): GlossaryEntry | null {
  return BY_KEY.get(key.trim().toLowerCase()) ?? null;
}

/**
 * The whole answer for one term: what it is, and the same thing said with
 * the reader's own figures when the caller has them.
 */
export function explainTerm(
  key: string,
  input: GlossaryExample = {}
): {
  term: string;
  meaning: string;
  alsoCalled: string | null;
  outsideWord: string | null;
  example: string | null;
} | null {
  const entry = glossaryEntry(key);
  if (!entry) return null;
  return {
    term: entry.term,
    meaning: entry.meaning,
    alsoCalled: entry.alsoCalled ?? null,
    outsideWord: outsideWordLine(entry),
    example: entry.example?.(input) ?? null,
  };
}

/**
 * The outside word as a sentence, or null where there is nothing to say.
 *
 * Deliberately a whole sentence rather than a label, because a bare
 * "concentration" under a definition reads as a synonym the reader is now
 * expected to use. The point is the opposite: this app will go on saying the
 * plain thing, and the reader is only being told what to expect elsewhere.
 */
export function outsideWordLine(entry: GlossaryEntry | null): string | null {
  if (!entry?.alsoCalled) return null;
  return `Elsewhere you will see this called ${entry.alsoCalled}.`;
}
