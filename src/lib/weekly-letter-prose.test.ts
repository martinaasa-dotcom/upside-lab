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
import { describe, expect, it } from "vitest";
import { buildWeeklyLetter, type WeeklyLetterInput } from "@/lib/weekly-letter";
import { fallbackWeeklyTake, writeWeeklyTake } from "@/lib/weekly-margus";

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
    expect(take).toMatch(/do not own/);
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
    const closing = take.split(/\n{2,}/).at(-1) as string;
    expect(closing).toMatch(/largest move among those was 2\.5%/);
    expect(closing).not.toMatch(/quiet|barely moved/);
  });

  it("still says barely moved when everything left really is small", () => {
    const calm: Row[] = [
      ["BE", 4000, 41, 34.1667],
      ["NVDA", 700, 178, 176.06],
      ["SOFI", 5000, 17, 17.154],
    ];
    const closing = fallbackWeeklyTake(letterOf(calm)).split(/\n{2,}/).at(-1) as string;
    expect(closing).toMatch(/barely moved/);
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
