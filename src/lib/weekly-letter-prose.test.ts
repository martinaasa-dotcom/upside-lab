/**
 * How the Sunday letter reads, as opposed to what it adds up to.
 *
 * Four complaints from a real letter are pinned here, all of them in the
 * prose the fallback writer produces when the model cannot be reached:
 *
 *  - it closed a paragraph on a proverb ("a week either way is a week"),
 *    which carried no fact and read as filler;
 *  - it printed a "standout fact" about whichever suggestion came first,
 *    which in practice was the biggest holding, every week;
 *  - it named one watchlist faller and stopped, while the table directly
 *    underneath showed two more;
 *  - it ended "the rest of your companies were quiet" whatever the numbers
 *    said, with a holding up 10% sitting in that same table.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWeeklyLetter, type WeeklyLetterInput } from "@/lib/weekly-letter";
import { fallbackWeeklyTake, writeWeeklyTake } from "@/lib/weekly-margus";
import * as model from "@/lib/ai/model";

const NOW = new Date("2026-09-06T05:00:00Z");

type Row = [ticker: string, shares: number, price: number, start: number];

function letterOf(rows: Row[], watch: [string, number, number][] = []) {
  const input: WeeklyLetterInput = {
    name: "Martin",
    cash: 0,
    holdings: rows.map(([ticker, shares]) => ({ ticker, shares, buy_price: 1 })),
    quotes: Object.fromEntries(
      rows.map(([t, , price]) => [t, { price }])
    ) as never,
    weekReturns: Object.fromEntries(
      rows.map(([t, , price, start]) => [t, { start, end: price, pct: price / start - 1 }])
    ),
    watchlist: watch.map((w) => w[0]),
    watchQuotes: Object.fromEntries(
      watch.map(([t, price]) => [t, { price }])
    ) as never,
    watchWeekReturns: Object.fromEntries(
      watch.map(([t, price, pct]) => [t, { start: price / (1 + pct), end: price, pct }])
    ),
    conviction: {},
    now: NOW,
  };
  return buildWeeklyLetter(input);
}

/** One big winner, one big second, one small faller, two quiet ones. */
const BOOK: Row[] = [
  ["BE", 4000, 41, 34.1667],
  ["NBIS", 3000, 92, 83.94],
  ["CRWV", 2000, 126, 122.93],
  ["RKLB", 3500, 47, 47.86],
  ["NVDA", 700, 178, 176.06],
  ["SOFI", 5000, 17, 17.154],
];

const WATCH: [string, number, number][] = [
  ["ONDS", 3.9, -0.082],
  ["IONQ", 44, -0.051],
  ["QBTS", 19, -0.034],
  ["ASTS", 61, 0.044],
];

describe("the prose carries facts, not filler", () => {
  const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));

  it("never closes a paragraph on a proverb", () => {
    expect(take).not.toMatch(/a week either way is a week/i);
    expect(take).not.toMatch(/not a change in why you own/i);
    expect(take).not.toMatch(/time in the market/i);
  });

  it("prints no standout fact about the biggest holding", () => {
    expect(take).not.toMatch(/standout fact/i);
  });

  it("uses no em or en dash", () => {
    expect(take).not.toMatch(/[–—]/);
  });

  it("finishes every sentence", () => {
    expect(take.trim()).toMatch(/[.!?]$/);
  });
});

describe("the watchlist is summarised in both directions", () => {
  const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));

  it("names every faller it has, with its percentage, not just the first", () => {
    for (const [ticker, pct] of [["ONDS", "8.2%"], ["IONQ", "5.1%"], ["QBTS", "3.4%"]]) {
      expect(take).toContain(`$${ticker}`);
      expect(take).toContain(pct);
    }
  });

  it("names the ones that rose too", () => {
    expect(take).toContain("$ASTS");
    expect(take).toContain("4.4%");
  });

  it("says out loud that these are not owned", () => {
    // The rule, not the sentence: a watched name has to be marked as not
    // being the reader's money, wherever that clause ends up sitting.
    expect(take).toMatch(/not (own|money you have in)|money you have in/);
  });

  it("does not describe a single watched name as the whole story", () => {
    expect(take).not.toMatch(/\$ONDS, which is on your watchlist/);
  });
});

describe("nothing is called quiet unless it was", () => {
  it("names a holding that ran 9.6% rather than sweeping it into the closing", () => {
    const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));
    expect(take).toContain("$NBIS");
    expect(take).toContain("9.6%");
  });

  it("gives the largest remaining move instead of calling the rest quiet", () => {
    const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));
    expect(take).toMatch(/largest of those moves 2\.5%/);
  });

  it("still says barely moved when everything left really is small", () => {
    const calm: Row[] = [
      ["BE", 4000, 41, 34.1667],
      ["NVDA", 700, 178, 176.06],
      ["SOFI", 5000, 17, 17.154],
    ];
    expect(fallbackWeeklyTake(letterOf(calm))).toMatch(/barely moved/);
  });
});

describe("the leftover holdings are not mistaken for the watchlist", () => {
  const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));
  const paras = take.split(/\n{2,}/);

  it("says out loud that they are companies you own", () => {
    const holdings = paras.find((p) => /companies you own/.test(p));
    expect(holdings).toBeTruthy();
  });

  it("keeps them above the watchlist, not stranded under it", () => {
    const owned = paras.findIndex((p) => /companies you own/.test(p));
    const watch = paras.findIndex((p) => /watchlist/.test(p));
    expect(owned).toBeGreaterThanOrEqual(0);
    expect(watch).toBeGreaterThan(owned);
  });
});

describe("the letter ends on what the week amounted to", () => {
  /** A broad fall: five of six holdings down, none of them dominant. */
  const BROAD: Row[] = [
    ["CRWV", 2000, 118, 126],
    ["NBIS", 3000, 86, 92],
    ["BE", 4000, 38.5, 41],
    ["RKLB", 3500, 44.5, 47],
    ["NVDA", 700, 168, 178],
    ["SOFI", 5000, 17.4, 17],
  ];
  /** One company did the damage while the rest went both ways. */
  const NARROW: Row[] = [
    ["CRWV", 2000, 88, 126],
    ["NBIS", 3000, 93, 92],
    ["BE", 4000, 41.5, 41],
    ["RKLB", 3500, 46.5, 47],
    ["NVDA", 700, 179, 178],
  ];

  it("reads a week where everything fell together as the market", () => {
    const last = fallbackWeeklyTake(letterOf(BROAD)).split(/\n{2,}/).at(-1) as string;
    expect(last).toMatch(/usually means the market moved/);
  });

  it("reads a week one company caused as that company", () => {
    const last = fallbackWeeklyTake(letterOf(NARROW)).split(/\n{2,}/).at(-1) as string;
    expect(last).toMatch(/came down to that single company/);
  });

  it("puts a big week in proportion using the reader's own holdings", () => {
    const last = fallbackWeeklyTake(letterOf(NARROW)).split(/\n{2,}/).at(-1) as string;
    // The size is put in proportion, and the perspective is anchored on
    // this reader's own week rather than on a claim about what markets do
    // next. Asserted as the rule: the wording differs per shape of week.
    expect(last).toMatch(/a lot of money|big number in dollars/);
    expect(last).toMatch(/can rise that far too|can fall that far too/);
  });

  it("points at Pulse rather than answering per company itself", () => {
    const last = fallbackWeeklyTake(letterOf(BROAD)).split(/\n{2,}/).at(-1) as string;
    expect(last).toMatch(/Pulse/);
  });

  /*
   * The two rules the closing paragraph exists under, and the reason it is
   * a computed sentence rather than a nice line somebody typed. Upside Lab
   * is not an adviser, so the letter never says what to do about a week;
   * and it carries no house view, so it never promises the market comes
   * back. Both are checked on every shape of week the closer can produce.
   */
  const everyWeek = [BOOK, BROAD, NARROW].map((rows) =>
    fallbackWeeklyTake(letterOf(rows, WATCH))
  );

  it("never tells the reader what to do", () => {
    for (const take of everyWeek) {
      expect(take).not.toMatch(
        /\b(hold on to|sit tight|sit still|do nothing|stay calm|don't panic|do not panic|take a closer look|you should|consider (buying|selling|adding|trimming))\b/i
      );
    }
  });

  it("never promises the market comes back", () => {
    for (const take of everyWeek) {
      expect(take).not.toMatch(
        /\b(will recover|bounce back|comes back|keeps going up|long run|over time (it|the market|markets)|in the end)\b/i
      );
    }
  });
});

/*
 * Every one of these was found by rendering the letter for a small
 * portfolio rather than by reading the code. A sentence built from counts
 * reads correctly at four holdings and falls apart at one.
 */
describe("a small portfolio gets English, not counts", () => {
  const TWO: Row[] = [
    ["NVDA", 700, 190, 176.06],
    ["SOFI", 5000, 17.6, 17.154],
  ];

  it("does not say the largest of one move", () => {
    const take = fallbackWeeklyTake(letterOf(TWO));
    expect(take).not.toMatch(/largest of the other one/);
    expect(take).toMatch(/The other one rose 2\.6%\./);
  });

  it("does not call a single watched name everything on the watchlist", () => {
    const take = fallbackWeeklyTake(letterOf(TWO, [["ONDS", 3.9, -0.082]]));
    expect(take).not.toMatch(/Everything on your watchlist/);
    expect(take).toMatch(/The one name on your watchlist, \$ONDS, finished 8\.2% lower\./);
    expect(take).toMatch(/You do not own it\./);
  });

  it("does not say one other holding went both ways", () => {
    const last = fallbackWeeklyTake(letterOf(TWO)).split(/\n{2,}/).at(-1) as string;
    expect(last).not.toMatch(/the rest of what you own went both ways/);
  });

  it("introduces every watchlist percentage the same way", () => {
    const take = fallbackWeeklyTake(letterOf(BOOK, WATCH));
    // "fell the most, 8.2%, then $IONQ at 5.1%" reads as two writers a
    // comma apart.
    expect(take).toMatch(/fell the most, at 8\.2%/);
  });

  it("reads two watched names as a pair rather than a ranking", () => {
    const take = fallbackWeeklyTake(
      letterOf(BOOK, [["ONDS", 3.9, -0.082], ["IONQ", 44, -0.051]])
    );
    expect(take).toMatch(/\$ONDS fell 8\.2% and \$IONQ 5\.1%/);
    expect(take).not.toMatch(/fell the most/);
  });
});

describe("the rest summary is the whole portfolio, not the table", () => {
  it("counts the holdings What moved does not list", () => {
    const many: Row[] = [
      ...BOOK,
      ["AMD", 400, 172, 168.3],
      ["SOFI2", 100, 20, 19.9],
    ];
    const letter = letterOf(many);
    expect(letter.movers).toHaveLength(5);
    expect(letter.rest?.count).toBe(3);
    expect(letter.rest?.up ?? 0).toBeGreaterThan(0);
  });

  it("is null when the table already shows everything", () => {
    expect(letterOf(BOOK.slice(0, 3)).rest).toBeNull();
  });
});

describe("a letter the model did not write says so", () => {
  it("reports the fallback and why, rather than falling back in silence", async () => {
    const seen: { source: string; reason: string }[] = [];
    const keys = ["GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"];
    const saved = keys.map((k) => [k, process.env[k]] as const);
    for (const k of keys) delete process.env[k];
    try {
      const take = await writeWeeklyTake(letterOf(BOOK, WATCH), {
        onOutcome: (o) => seen.push(o),
      });
      expect(take).toBeTruthy();
      expect(seen).toHaveLength(1);
      expect(seen[0].source).toBe("fallback");
      expect(seen[0].reason).toMatch(/no model provider/);
    } finally {
      for (const [k, v] of saved) if (v != null) process.env[k] = v;
    }
  });
});


/*
 * The fallback is meant to be the rare case, and one shot at the model was
 * what made it common: an answer three sentences long, or with an
 * unfinished last one, was refused and that was the end of it with most of
 * the budget unspent.
 */
describe("the model gets more than one go", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  /** Answers, in order, from a stubbed provider. */
  function stubModel(answers: string[]) {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    let n = 0;
    return vi.spyOn(model, "withAdvisorFallback").mockImplementation(async () => {
      const text = answers[Math.min(n, answers.length - 1)];
      n += 1;
      if (text === "throw") throw new Error("provider exploded");
      return { text } as never;
    });
  }

  const GOOD = [
    "Your portfolio gained a little this week, which is about a dollar for every hundred you had in it.",
    "Nothing you own moved far enough to be worth naming on its own.",
    "Your watchlist was quieter still, with nothing on it moving much either way.",
    "Pulse has the same check for each company whenever you want it.",
  ].join("\n\n");

  it("asks again when the first answer is refused, and ships the second", async () => {
    const spy = stubModel(["too short.", GOOD]);
    const seen: { source: string; reason: string }[] = [];
    const take = await writeWeeklyTake(letterOf(BOOK, WATCH), {
      onOutcome: (o) => seen.push(o),
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(take).toBe(GOOD);
    expect(seen[0]).toEqual({ source: "model", reason: "ok on attempt 2" });
  });

  it("asks again when the call throws", async () => {
    const spy = stubModel(["throw", GOOD]);
    const take = await writeWeeklyTake(letterOf(BOOK, WATCH), {});
    expect(spy).toHaveBeenCalledTimes(2);
    expect(take).toBe(GOOD);
  });

  it("falls back only after every attempt is spent, and says which", async () => {
    const spy = stubModel(["too short."]);
    const seen: { source: string; reason: string }[] = [];
    const take = await writeWeeklyTake(letterOf(BOOK, WATCH), {
      onOutcome: (o) => seen.push(o),
    });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(seen[0].source).toBe("fallback");
    expect(seen[0].reason).toMatch(/answer refused/);
    expect(take).toContain("Your portfolio");
  });

  it("does not start an attempt it has no time for", async () => {
    const spy = stubModel(["too short."]);
    await writeWeeklyTake(letterOf(BOOK, WATCH), { budgetMs: 1 });
    expect(spy).not.toHaveBeenCalled();
  });
});
