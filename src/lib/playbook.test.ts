import { describe, expect, it } from "vitest";
import { ratingForScore } from "@/lib/market/fear-greed";
import {
  allQuotes,
  bandForScore,
  IDEA_THEMES,
  IDEAS,
  ladderPosition,
  ownProse,
  TEMPERATURE_BANDS,
} from "@/lib/playbook";

/*
  The Playbook is the one room in this app whose whole content is opinion
  about how to invest, so it is also the one that most needs a floor under
  it. These are that floor, and each of them is a rule from the file's own
  note rather than a restatement of today's copy: an assertion that breaks
  on a reworded sentence costs more than it protects.
*/

describe("the ladder is the published one", () => {
  it("agrees with the band function for every score", () => {
    for (let score = 0; score <= 100; score++) {
      const band = bandForScore(score);
      expect(band.label.toLowerCase()).toBe(ratingForScore(score));
      expect(score).toBeGreaterThanOrEqual(band.range[0]);
      expect(score).toBeLessThanOrEqual(band.range[1]);
    }
  });

  it("covers 0 to 100 with no gap and no overlap", () => {
    let expected = 0;
    for (const band of TEMPERATURE_BANDS) {
      expect(band.range[0]).toBe(expected);
      expect(band.range[1]).toBeGreaterThan(band.range[0]);
      expected = band.range[1] + 1;
    }
    expect(expected).toBe(101);
  });

  it("puts a score where the reader can see it on the track", () => {
    expect(ladderPosition(0)).toBe(0);
    expect(ladderPosition(50)).toBe(0.5);
    expect(ladderPosition(100)).toBe(1);
    // A reading outside the published range is clamped, never drawn off it.
    expect(ladderPosition(140)).toBe(1);
    expect(ladderPosition(-8)).toBe(0);
  });
});

describe("a quotation is the app reporting what somebody said", () => {
  /*
    This is the rule the whole room rests on. Several of the best sentences
    in investing are grammatically orders, and the only thing that makes
    printing one legitimate in a product that may not give advice is that
    it carries a name a reader can go and check. A quote with no author is
    the app giving the instruction itself.
  */
  it("never prints one without an author", () => {
    for (const quote of allQuotes()) {
      expect(quote.text.trim().length).toBeGreaterThan(0);
      expect(quote.author.trim().length).toBeGreaterThan(0);
    }
  });

  it("marks an attribution that is thinner than the name suggests", () => {
    const hedged = allQuotes().filter((q) =>
      /often attributed|attributed to/i.test(q.author)
    );
    for (const quote of hedged) {
      expect(
        quote.attribution,
        `${quote.author} hedges in the name and has to say why`
      ).toBeTruthy();
    }
  });
});

describe("the app's own prose never instructs", () => {
  /*
    Deliberately runs over `ownProse()`, which excludes quotations by
    construction. An instruction word inside quotation marks with a name on
    it is a report. The same word in the app's own voice is advice, which
    this product may not give.
  */
  const INSTRUCTION =
    /\b(you should|you must|we recommend|buy now|sell now|sell everything|buy the dip|time to buy|time to sell|guaranteed)\b/i;
  const VERDICT =
    /\b(undervalued|overvalued|a strong buy|a strong sell|cheap right now)\b/i;

  it("uses no instruction word", () => {
    const bad = ownProse().filter((line) => INSTRUCTION.test(line));
    expect(bad).toEqual([]);
  });

  it("uses no verdict word", () => {
    const bad = ownProse().filter((line) => VERDICT.test(line));
    expect(bad).toEqual([]);
  });

  it("uses no dash as a clause break", () => {
    const bad = [...ownProse(), ...allQuotes().map((q) => q.text)].filter(
      (line) => /[—–]/.test(line)
    );
    expect(bad).toEqual([]);
  });
});

describe("every principle carries the way it goes wrong", () => {
  /*
    Not a nicety and not a hedge. A principle printed without its opposite
    is a reason to do the thing the reader already wanted to do, which is
    the whole failure mode of investing quotations. If a band or an idea
    can be added here without one, the room stops teaching and starts
    flattering.
  */
  it("on every band", () => {
    for (const band of TEMPERATURE_BANDS) {
      expect(band.goesWrong.trim().length, band.id).toBeGreaterThan(60);
      expect(band.check.trim().length, band.id).toBeGreaterThan(20);
      expect(band.idea.trim().length, band.id).toBeGreaterThan(60);
    }
  });

  it("on every idea", () => {
    for (const idea of IDEAS) {
      expect(idea.goesWrong.trim().length, idea.id).toBeGreaterThan(60);
      expect(idea.meaning.trim().length, idea.id).toBeGreaterThan(60);
      expect(idea.inPractice.trim().length, idea.id).toBeGreaterThan(20);
    }
  });
});

describe("the deck is navigable", () => {
  it("gives every idea a unique id and a theme with a heading", () => {
    const ids = new Set(IDEAS.map((i) => i.id));
    expect(ids.size).toBe(IDEAS.length);
    for (const idea of IDEAS) {
      expect(
        IDEA_THEMES.some((t) => t.id === idea.theme),
        `${idea.id} has theme ${idea.theme}`
      ).toBe(true);
    }
  });

  it("leaves no theme heading with nothing behind it", () => {
    for (const theme of IDEA_THEMES) {
      expect(
        IDEAS.some((i) => i.theme === theme.id),
        `${theme.id} filters to an empty list`
      ).toBe(true);
    }
  });
});

describe("market words are only printed where they are being defined", () => {
  /*
    The standing ban is off in this room in exactly the narrow way
    AGENTS.md allows: the plain phrase is the sentence and the outside word
    arrives after it, named as somebody else's word, in a clause the reader
    can skip. So the word may appear only in the shape "called X", never on
    its own, and never in a title, which is a heading rather than a lesson.
  */
  const TEACHABLE = /\b(volatility|correction|liquidity|leverage)\b/gi;

  it("introduces one only as something you will see it called", () => {
    for (const line of ownProse()) {
      for (const match of line.matchAll(TEACHABLE)) {
        const before = line.slice(Math.max(0, match.index - 30), match.index);
        expect(
          /\bcalled\s(a\s)?$/i.test(before),
          `"${match[0]}" is printed without being introduced: ...${before}${match[0]}`
        ).toBe(true);
      }
    }
  });

  it("never puts one in a heading", () => {
    for (const idea of IDEAS) {
      expect(TEACHABLE.test(idea.title), idea.id).toBe(false);
      TEACHABLE.lastIndex = 0;
    }
  });
});
