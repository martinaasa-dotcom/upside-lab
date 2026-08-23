/**
 * What a reader sees in the Sunday letter: figures grouped, percentages
 * that mean what they say, and one section per kind of suggestion.
 *
 * Two bugs are pinned here. The letter printed `+0.3%` beside a name that
 * had run 30% and `-0.0%` beside every ordinary loss, because
 * `fetchWeekReturns` reports a fraction and the letter read it as a
 * percent. And a figure reached an inbox as `-$129709`, with no thousands
 * separator, which is exactly what a person notices first.
 */
import { describe, expect, it } from "vitest";
import {
  buildWeeklyLetter,
  groupSuggestions,
  weeklyLetterHtml,
  weeklyLetterText,
  weeklyNumbersAreSound,
  weeklyPreview,
  weeklySubject,
  type WeeklySuggestion,
} from "@/lib/weekly-letter";
import { groupMoneyInText } from "@/lib/money-text";
import { humanizeMargusText } from "@/lib/ai/humanize-copy";

const NOW = new Date("2026-08-23T05:00:00Z");

/** One 30% winner and one ordinary 1.4% loser: +$6,650 on the week. */
function letter() {
  return buildWeeklyLetter({
    name: "Martin",
    cash: 0,
    holdings: [
      { ticker: "BMNR", shares: 1500, buy_price: 18.2 },
      { ticker: "NVDA", shares: 500, buy_price: 180 },
    ],
    quotes: {
      BMNR: { price: 23.56 } as never,
      NVDA: { price: 215.38 } as never,
    },
    conviction: {},
    weekReturns: {
      // A 30% week and a 1.4% week, both as the fractions Yahoo returns.
      BMNR: { start: 18.12, end: 23.56, pct: 0.3 },
      NVDA: { start: 218.4, end: 215.38, pct: -0.0138 },
    },
    watchlist: ["RKLB"],
    watchQuotes: { RKLB: { price: 60 } as never },
    watchWeekReturns: { RKLB: { start: 63.2, end: 60, pct: -0.0506 } },
    now: NOW,
  });
}

describe("week percentages are percentages", () => {
  it("reads a 0.3 fraction as 30%, not 0.3%", () => {
    const movers = letter().movers;
    const bmnr = movers.find((m) => m.ticker === "BMNR");
    expect(bmnr?.pct).toBeCloseTo(30);
    expect(weeklyLetterText(letter())).toContain("+30.0%");
  });

  it("does not round every ordinary loss to -0.0%", () => {
    const nvda = letter().movers.find((m) => m.ticker === "NVDA");
    expect(nvda?.pct).toBeCloseTo(-1.38);
    expect(weeklyLetterText(letter())).toContain("-1.4%");
  });

  it("no longer calls a 30% week quiet", () => {
    expect(letter().quiet).toBe(false);
  });

  it("marks a real dip as a dip, rather than needing a 300% one", () => {
    // -5% clears the -3 threshold. Read as a fraction it was -0.05, which
    // never did, so no watchlist name could ever be raised in the prose.
    const rows = letter().watchRows;
    expect(rows.map((w) => w.ticker)).toEqual(["RKLB"]);
    expect(rows[0].dipped).toBe(true);
  });
});

describe("every figure carries its thousands separator", () => {
  it("groups the subject, the preview and the body", () => {
    const r = letter();
    // The preview is what a phone shows in the inbox list, and it is where
    // the ungrouped figure was spotted.
    expect(weeklySubject(r)).toContain("$6,650");
    expect(weeklyLetterHtml(r)).toContain("$6,650");
  });

  it("leaves no bare four-digit amount anywhere in the letter", () => {
    expect(weeklyLetterText(letter())).not.toMatch(/[$€£]\d{4,}/);
    expect(weeklyLetterHtml(letter())).not.toMatch(/[$€£]\d{4,}/);
  });

  it("repairs a bare amount the model typed", () => {
    expect(humanizeMargusText("You are down $129709 this week.")).toContain(
      "$129,709"
    );
  });

  it("leaves cashtags, small numbers and cents alone", () => {
    expect(groupMoneyInText("$NBIS is $23.56, up $900 on $12345.67")).toBe(
      "$NBIS is $23.56, up $900 on $12,345.67"
    );
  });
});

describe("suggestions are grouped by kind", () => {
  const items: WeeklySuggestion[] = [
    { kind: "add", ticker: "RKLB", source: "pulse", status: null, line: "add RKLB" },
    { kind: "trim", ticker: "BMNR", source: "pulse", status: null, line: "trim BMNR" },
    { kind: "add", ticker: "DRAM", source: "pulse", status: null, line: "add DRAM" },
    { kind: "sell", ticker: "RDDT", source: "pulse", status: null, line: "sell RDDT" },
  ];

  it("puts every add under one heading, in order", () => {
    const groups = groupSuggestions(items);
    expect(groups.map((g) => g.kind)).toEqual(["sell", "trim", "add"]);
    expect(groups[2].items.map((s) => s.ticker)).toEqual(["RKLB", "DRAM"]);
  });

  it("names each heading once in the HTML", () => {
    const r = letter();
    r.suggestions = items;
    const html = weeklyLetterHtml(r);
    expect(html.match(/Worth adding to/g)).toHaveLength(1);
    expect(html.match(/Worth trimming/g)).toHaveLength(1);
  });

  it("names each heading once in the plain text too", () => {
    const r = letter();
    r.suggestions = items;
    const text = weeklyLetterText(r);
    expect(text.match(/Worth adding to/g)).toHaveLength(1);
  });

  it("drops a heading nobody has a suggestion for", () => {
    expect(groupSuggestions([items[0]]).map((g) => g.kind)).toEqual(["add"]);
  });
});

describe("nothing a reader sees carries an em dash", () => {
  /*
   * The rule is old and it keeps coming back, so it is a test now rather
   * than a habit: no em or en dash in the subject, the preview, the body,
   * or the HTML. `stripAiDashes` already covers what the model writes;
   * this covers what we write.
   */
  const DASHES = /[\u2014\u2013]/;

  it("keeps them out of every rendered string", () => {
    const r = letter();
    r.margus = "A take about the week.";
    expect(weeklySubject(r)).not.toMatch(DASHES);
    expect(weeklyPreview(r)).not.toMatch(DASHES);
    expect(weeklyLetterText(r)).not.toMatch(DASHES);
    expect(weeklyLetterHtml(r)).not.toMatch(DASHES);
  });
});

describe("the preview survives Gmail's snippet pass", () => {
  it("leads with the percent, which has no separator to lose", () => {
    // Gmail strips the separators inside a number when it builds the inbox
    // snippet, and there is no way to stop it. So the line it rewrites does
    // not carry a grouped figure at all.
    const preview = weeklyPreview(letter());
    expect(preview).toMatch(/^[+-]\d+\.\d% this week\./);
    expect(preview).not.toMatch(/\d{4,}/);
  });

  it("keeps the English comma in the subject and the body", () => {
    expect(weeklySubject(letter())).toContain("$6,650");
    expect(weeklyLetterHtml(letter())).toContain("$6,650");
    expect(weeklyLetterText(letter())).toContain("$6,650");
  });
});

describe("the letterhead", () => {
  it("sets the date beside the lockup rather than under it", () => {
    const html = weeklyLetterHtml(letter());
    const lockup = html.indexOf("email-lockup.png");
    const date = html.indexOf("Sunday 23 August");
    expect(lockup).toBeGreaterThan(-1);
    expect(date).toBeGreaterThan(lockup);
    // Same hairline that separates every section below it.
    expect(html.slice(lockup, date + 400)).toContain("height:1px");
  });
});

describe("a figure the letter cannot stand behind is not sent", () => {
  /*
   * The letter prints a portfolio value and a week's move as plain fact.
   * Both used to degrade silently: a holding with no quote dropped out of
   * the total, and `weekDollar` summed only the names that had a week
   * return while the sentence around it still said "your week".
   */
  const base = {
    name: "Martin",
    cash: 0,
    holdings: [
      { ticker: "AAA", shares: 100, buy_price: 10 },
      { ticker: "BBB", shares: 100, buy_price: 10 },
    ],
    quotes: { AAA: { price: 10 } as never, BBB: { price: 90 } as never },
    conviction: {},
    weekReturns: {
      AAA: { start: 9, end: 10, pct: 0.111 },
      BBB: { start: 88, end: 90, pct: 0.0227 },
    },
    now: NOW,
  };

  it("passes when every holding has a live price and a week move", () => {
    expect(weeklyNumbersAreSound(base).ok).toBe(true);
  });

  it("refuses when a holding has no price at all", () => {
    const trust = weeklyNumbersAreSound({
      ...base,
      quotes: { AAA: { price: 10 } as never },
    });
    expect(trust.ok).toBe(false);
    expect(trust.ok === false && trust.reason).toContain("BBB");
  });

  it("refuses when most of the portfolio has no week move behind it", () => {
    // BBB is 90% of the value and reported nothing, so "your week" would
    // describe the other tenth.
    const trust = weeklyNumbersAreSound({
      ...base,
      weekReturns: { AAA: base.weekReturns.AAA },
    });
    expect(trust.ok).toBe(false);
    expect(trust.ok === false && trust.reason).toMatch(/10% of the portfolio/);
  });

  it("accepts Friday's close on a Sunday, and refuses last week's", () => {
    const cached = (ageDays: number) =>
      ({
        price: 90,
        stale: true,
        quotedAt: NOW.getTime() - ageDays * 24 * 60 * 60 * 1000,
      }) as never;
    expect(
      weeklyNumbersAreSound({
        ...base,
        quotes: { ...base.quotes, BBB: cached(2) },
      }).ok
    ).toBe(true);
    const old = weeklyNumbersAreSound({
      ...base,
      quotes: { ...base.quotes, BBB: cached(9) },
    });
    expect(old.ok).toBe(false);
    expect(old.ok === false && old.reason).toContain("old cached price");
  });

  it("drops one stale watchlist row rather than failing the letter", () => {
    const r = buildWeeklyLetter({
      ...base,
      watchlist: ["CCC", "DDD"],
      watchQuotes: {
        CCC: { price: 50 } as never,
        DDD: {
          price: 50,
          stale: true,
          quotedAt: NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
        } as never,
      },
      watchWeekReturns: {
        CCC: { start: 55, end: 50, pct: -0.09 },
        DDD: { start: 55, end: 50, pct: -0.09 },
      },
    });
    expect(r.watchRows.map((w) => w.ticker)).toEqual(["CCC"]);
  });
});

describe("the move bar scales with the client's width", () => {
  /*
   * The fill was a fixed 116px inside a track that is a percentage. At the
   * 560px the letter is designed for that is 116 of a 173px half; on a
   * phone the same half measures 81px and the biggest move ran edge to
   * edge, reading as clipped rather than as the largest bar.
   */
  const fillWidths = (html: string) =>
    [
      ...html.matchAll(
        /width="(\d+)%"[^>]*><tr><td height="8" bgcolor="#(?:00bc7d|ff2056)"/g
      ),
    ].map((m) => Number(m[1]));

  it("sizes every bar as a share of its own half, never in pixels", () => {
    const fills = fillWidths(weeklyLetterHtml(letter()));
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) {
      expect(f).toBeGreaterThanOrEqual(8);
      expect(f).toBeLessThanOrEqual(88);
    }
  });

  it("gives the biggest move in the table the widest bar, short of the end", () => {
    expect(Math.max(...fillWidths(weeklyLetterHtml(letter())))).toBe(88);
  });
});
