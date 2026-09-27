/**
 * How the Sunday letter reads, and the one thing it may never get wrong:
 * which companies are the reader's.
 *
 * A model wrote these paragraphs until 2026-09-27 and, on a real letter,
 * named Amazon to somebody who has never owned it, turned Micron into a
 * company called "Murrow" that does not exist, and described Rocket Lab as
 * a company "which rockets and spacecraft". The prose is templates filled
 * from the reader's own holdings now, and these tests hold that from both
 * ends: the words on real-shaped letters, and a sweep over thousands of
 * random portfolios asserting every company named is one the reader owns
 * or watches.
 */
import { describe, expect, it } from "vitest";
import { buildWeeklyLetter, type WeeklyLetterInput } from "@/lib/weekly-letter";
import {
  letterTickers,
  marketParagraph,
  proseNamesAreHeld,
  writeMarketProse,
  writeWeeklyProse,
} from "@/lib/weekly-prose";
import { companyName, knownCompanyNames } from "@/lib/company-names";

const NOW = new Date("2026-09-27T05:00:00Z");

type Row = [ticker: string, shares: number, price: number, start: number];
type Watch = [ticker: string, price: number, pct: number];

function inputOf(rows: Row[], watch: Watch[] = [], marketPct?: number): WeeklyLetterInput {
  return {
    name: "Martin",
    cash: 0,
    holdings: rows.map(([ticker, shares]) => ({ ticker, shares, buy_price: 1 })),
    quotes: Object.fromEntries(rows.map(([t, , price]) => [t, { price }])) as never,
    weekReturns: Object.fromEntries(
      rows.map(([t, , price, start]) => [t, { start, end: price, pct: price / start - 1 }])
    ),
    watchlist: watch.map((w) => w[0]),
    watchQuotes: Object.fromEntries(watch.map(([t, price]) => [t, { price }])) as never,
    watchWeekReturns: Object.fromEntries(
      watch.map(([t, price, pct]) => [t, { start: price / (1 + pct), end: price, pct }])
    ),
    marketWeek:
      marketPct == null ? undefined : { start: 100, end: 100 * (1 + marketPct), pct: marketPct },
    conviction: {},
    now: NOW,
  };
}

function letterOf(rows: Row[], watch: Watch[] = [], marketPct?: number) {
  const letter = buildWeeklyLetter(inputOf(rows, watch, marketPct));
  letter.prose = writeWeeklyProse(letter);
  letter.marketProse = writeMarketProse(letter);
  return letter;
}

/** The shape of the letter that went wrong: a big Rocket Lab week. */
const REAL: Row[] = [
  ["RKLB", 1500, 83.6, 73.0],
  ["NBIS", 800, 106.2, 100.0],
  ["CRWV", 500, 130, 126],
  ["MU", 300, 160, 158],
  ["NVDA", 900, 180, 176],
  ["VST", 200, 190, 192],
  ["BMNR", 3000, 45, 44],
  ["MSFT", 100, 510, 505],
  ["TSLA", 60, 420, 427],
];
const REAL_WATCH: Watch[] = [
  ["META", 760, 0.129],
  ["MRVL", 80, 0.072],
];

describe("the letter the reader complained about", () => {
  const letter = letterOf(REAL, REAL_WATCH, 0.012);
  const all = `${letter.prose}\n\n${letter.marketProse}`;

  it("never names a company the reader does not own or watch", () => {
    expect(all).not.toMatch(/Amazon|Murrow|Apple|Google/);
    expect(proseNamesAreHeld(all, letterTickers(letter))).toEqual({ ok: true });
  });

  it("calls Micron Micron and Marvell Marvell", () => {
    expect(companyName("MU")).toBe("Micron");
    expect(companyName("MRVL")).toBe("Marvell");
    expect(all).toContain("Marvell");
  });

  it("never describes what a company does", () => {
    expect(all).not.toMatch(/\bwhich (makes|builds|sells|runs|rents|rockets)\b/);
    expect(all).not.toMatch(/spacecraft|computer chips|social networks/);
  });

  it("never refers to its own layout", () => {
    expect(all).not.toMatch(/listed in the moves|watchlist shows|not listed|in the table/i);
  });

  it("opens on the money and says it per $100", () => {
    expect(letter.prose).toMatch(/^Your portfolio gained \$[\d,]+ this week, about \$[\d.]+ for every \$100 you had invested\./);
  });

  it("names the company that did the most, by its everyday name", () => {
    expect(letter.prose).toMatch(/Rocket Lab, up 14\.5%/);
  });

  it("does not point at Pulse or end on a claim it cannot back", () => {
    expect(all).not.toMatch(/Pulse/);
    expect(all).not.toMatch(/typical market week/);
  });
});

describe("the watchlist reads as English", () => {
  const book: Row[] = [["NVDA", 100, 180, 176]];

  it("says both directions when there are both", () => {
    const l = letterOf(book, [["META", 760, 0.129], ["INTC", 30, -0.041], ["MU", 150, 0.02]]);
    expect(l.prose).toContain("On your watchlist, the biggest rise was Meta at 12.9% and the biggest fall Intel at 4.1%.");
  });

  it("reads a pair as a pair", () => {
    const l = letterOf(book, [["META", 760, 0.129], ["INTC", 30, -0.041]]);
    expect(l.prose).toContain("On your watchlist, Meta rose 12.9% and Intel fell 4.1%.");
  });

  it("does not call one company everything", () => {
    const l = letterOf(book, [["META", 760, 0.129]]);
    expect(l.prose).toContain("Meta, the one company on your watchlist, rose 12.9%.");
  });

  it("says everything rose only when everything did", () => {
    const l = letterOf(book, [["META", 760, 0.129], ["MRVL", 80, 0.072]]);
    expect(l.prose).toContain("Everything on your watchlist rose, Meta the most at 12.9%, then Marvell at 7.2%.");
  });
});

describe("the rest of what is owned is a count and one named example", () => {
  it("says how many rose and fell and names the biggest of them", () => {
    const l = letterOf(REAL, [], 0.012);
    expect(l.prose).toMatch(/Of your other \w+ companies, \w+ rose and \w+ fell\. The largest of those moves was [^,]+, (up|down) \d+\.\d%\./);
    expect(l.prose).not.toMatch(/either way/);
  });

  it("says barely moved only when nothing left moved", () => {
    const calm: Row[] = [
      ["NVDA", 1000, 190, 170],
      ["MSFT", 10, 500, 499],
      ["AAPL", 10, 230, 229],
      ["KO", 10, 70, 70.3],
    ];
    expect(letterOf(calm).prose).toMatch(/barely moved; none went more than/);
  });

  it("counts the holdings What moved does not list", () => {
    const letter = buildWeeklyLetter(inputOf(REAL));
    expect(letter.movers).toHaveLength(5);
    expect(letter.rest?.count).toBe(4);
  });
});

describe("you or the market", () => {
  it("splits the gap to the index exactly across the companies", () => {
    const letter = buildWeeklyLetter(inputOf(REAL, [], 0.012));
    const m = letter.market!;
    const sum = m.drivers.reduce((s, d) => s + d.gapPts, 0);
    expect(sum).toBeCloseTo((letter.weekPct as number) - m.pct, 9);
    expect(m.pct).toBeCloseTo(1.2, 9);
  });

  it("says how far ahead, what following the index would have made, and who made the difference", () => {
    const l = letterOf(REAL, [], 0.012);
    expect(l.marketProse).toMatch(/^The S&P 500, the index of America's five hundred largest companies, rose 1\.2% this week\. Your portfolio rose \d+\.\d%, \d+\.\d points ahead of it\./);
    expect(l.marketProse).toMatch(/Had your money simply followed the index, the week would have made you \$[\d,]+, rather than the \$[\d,]+ it actually made\./);
    expect(l.marketProse).toMatch(/Most of the difference came from Rocket Lab, up 14\.5%/);
  });

  it("calls a week that tracked the index the market's", () => {
    const tracked: Row[] = [
      ["NVDA", 100, 101.2, 100],
      ["MSFT", 100, 101.1, 100],
      ["AAPL", 100, 101.3, 100],
    ];
    const l = letterOf(tracked, [], 0.012);
    expect(l.marketProse).toMatch(/close enough to call it the market's week rather than your companies'/);
  });

  it("says so when the portfolio went the other way from the market", () => {
    const l = letterOf([["NVDA", 100, 105, 100], ["MSFT", 100, 101, 100]], [], -0.02);
    expect(l.marketProse).toMatch(/fell 2\.0% this week, while your portfolio rose 3\.0%\. So this was your companies' doing, not the market's\./);
    expect(l.marketProse).toMatch(/would have cost you \$400, rather than the \$600 it actually made/);
  });

  it("is absent, not guessed, when the index could not be read", () => {
    const l = letterOf(REAL);
    expect(l.market).toBeNull();
    expect(l.marketProse).toBeNull();
    expect(marketParagraph(l)).toBeNull();
  });
});

describe("the guard", () => {
  const held = new Set(["NVDA", "MU"]);

  it("refuses a company name the reader does not hold", () => {
    expect(proseNamesAreHeld("Amazon fell 2%.", held)).toEqual({ ok: false, stray: "Amazon" });
  });

  it("refuses a cashtag the reader does not hold", () => {
    expect(proseNamesAreHeld("$AMZN fell 2%.", held)).toEqual({ ok: false, stray: "$AMZN" });
  });

  it("allows what the reader holds, by either spelling", () => {
    expect(proseNamesAreHeld("Nvidia rose, Micron fell and $NVDA moved.", held)).toEqual({ ok: true });
  });

  it("does not mistake a dollar figure for a cashtag", () => {
    expect(proseNamesAreHeld("It made $16,077 and $6.38 per $100.", held)).toEqual({ ok: true });
  });
});

/* ------------------------------------------------------------------ sweep */

/** A small deterministic random source, so a failure reproduces. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const POOL = [
  ...new Set([
    ...knownCompanyNames().flatMap((n) => n.tickers.filter((t) => !t.includes("."))),
    "ONDS", "QBTS", "BMNR", "VOO", "ZZZZ", "ABCD",
  ]),
];

const NAME_RES = knownCompanyNames().map((n) => ({
  ...n,
  re: new RegExp(`\\b${n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`),
}));

describe("every letter names only the reader's own companies", () => {
  it("holds across thousands of random portfolios", () => {
    const rand = rng(20260927);
    const pick = (n: number) => {
      const out = new Set<string>();
      while (out.size < n) out.add(POOL[Math.floor(rand() * POOL.length)]);
      return [...out];
    };
    for (let i = 0; i < 3000; i++) {
      const n = 1 + Math.floor(rand() * 14);
      const tickers = pick(n + Math.floor(rand() * 5));
      const own = tickers.slice(0, n);
      const watch = tickers.slice(n);
      const rows: Row[] = own.map((t) => {
        const start = 5 + rand() * 500;
        const move = (rand() - 0.5) * (rand() < 0.2 ? 0.6 : 0.12);
        return [t, 1 + Math.floor(rand() * 2000), start * (1 + move), start];
      });
      const w: Watch[] = watch.map((t) => [t, 10 + rand() * 300, (rand() - 0.5) * 0.3]);
      const market = rand() < 0.1 ? undefined : (rand() - 0.5) * 0.08;
      const letter = letterOf(rows, w, market);
      const text = `${letter.prose ?? ""}\n\n${letter.marketProse ?? ""}`;
      const allowed = new Set([...own, ...watch]);

      expect(proseNamesAreHeld(text, allowed), text).toEqual({ ok: true });
      for (const { name, tickers: ts, re } of NAME_RES) {
        if (re.test(text)) {
          expect(ts.some((t) => allowed.has(t)), `${name} in: ${text}`).toBe(true);
        }
      }
      expect(text, text).not.toMatch(/NaN|undefined|null|Infinity|[–—]/);
      expect(text, text).not.toMatch(/\bwe\b|\bour\b|\bus\b|\byou should\b|\bhold\b|\bsell\b|\bbuy\b/i);
      expect(letter.prose!.trim(), text).toMatch(/[.!?]$/);
      // Every percent it prints is a real one to one decimal place.
      for (const p of text.match(/\d+\.\d%/g) ?? []) expect(p).toMatch(/^\d+\.\d%$/);
    }
  }, 60_000);
});
