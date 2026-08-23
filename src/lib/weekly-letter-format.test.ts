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

  it("lets a watchlist name qualify on a real dip, not a 300% one", () => {
    // -5% clears the -3 threshold. Read as a fraction it was -0.05, which
    // never did, so this section could not appear at all.
    expect(letter().watchBuys.map((w) => w.ticker)).toEqual(["RKLB"]);
  });
});

describe("every figure carries its thousands separator", () => {
  it("groups the subject, the preview and the body", () => {
    const r = letter();
    // The preview is what a phone shows in the inbox list, and it is where
    // the ungrouped figure was spotted.
    expect(weeklySubject(r)).toContain("$6,650");
    expect(weeklyPreview(r)).toContain("$6,650");
    expect(weeklyLetterText(r)).toContain("$6,650");
    expect(weeklyLetterHtml(r)).toContain("$6,650");
  });

  it("leaves no bare four-digit amount anywhere in the letter", () => {
    const text = weeklyLetterText(letter());
    expect(text).not.toMatch(/[$€£]\d{4,}/);
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
