/**
 * The chat prompt fits the reader, and it stops teaching the model the
 * words the persona bans.
 *
 * Two separate faults lived in `buildCcSystemPrompt`. It spoke to a
 * beginner and to somebody who trades every week in exactly the same
 * voice, having been told which of the two it was by onboarding and then
 * doing nothing with the answer. And its covered-call section carried the
 * whole trading-desk vocabulary the persona forbids, plus three lines that
 * told the model when to place a trade. A model copies the words it is
 * shown, so a ban list that sits above a prompt written in the banned
 * words is a ban list the model has good reason to ignore.
 */
import { describe, expect, it } from "vitest";

import { buildCcSystemPrompt, type CcChatContext } from "@/lib/ai/cc-advisor";

function context(over: Partial<CcChatContext> = {}): CcChatContext {
  return {
    portfolioName: "Retirement",
    cashBalance: 1000,
    holdings: [],
    rows: [],
    totals: {
      cost: 0,
      value: 0,
      roiPct: 0,
      roiDollar: 0,
      yield2wAvg: 0,
      premiumTotal: 0,
    },
    ...over,
  };
}

describe("the voice fits the reader", () => {
  it("asks for one idea at a time and dollars first when they are new", () => {
    const p = buildCcSystemPrompt(context({ experienceTier: "novice" }));
    expect(p).toMatch(/new to investing/i);
    expect(p).toMatch(/One idea per paragraph/i);
    expect(p).toMatch(/dollar figure and put the percent after it/i);
  });

  it("drops the glosses for somebody comfortable", () => {
    const p = buildCcSystemPrompt(context({ experienceTier: "investor" }));
    expect(p).toMatch(/without stopping to define/i);
    expect(p).not.toMatch(/One idea per paragraph/i);
  });

  it("asks for the short form for somebody very experienced", () => {
    const p = buildCcSystemPrompt(context({ experienceTier: "advanced" }));
    expect(p).toMatch(/short form/i);
    expect(p).toMatch(/plain is not the same as slow/i);
  });

  it("says nothing at all when the question was never answered", () => {
    for (const tier of [undefined, null, "", "something else"]) {
      const p = buildCcSystemPrompt(
        context({ experienceTier: tier as string | null | undefined })
      );
      expect(p).not.toMatch(/Who is reading, and how much to explain/);
    }
  });
});

describe("the covered-call prompt is written in plain words", () => {
  /*
    Read off the built prompt rather than the file, because the block is
    assembled from several template pieces and a word can be reintroduced
    in any of them.
  */
  const prompt = buildCcSystemPrompt(
    context({ rows: [], hideOptions: false })
  );

  const BANNED = [
    /\bOTM\b/,
    /\bIV crush\b/i,
    /\btenor\b/i,
    /\bstructural target\b/i,
    /\bresistance\b/i,
    /\bcost basis\b/i,
    /\bfull books\b/i,
  ];

  for (const word of BANNED) {
    it(`does not show the model ${word.source}`, () => {
      // The persona's own ban list is allowed to name a banned word. The
      // covered-call guidance below it is not, so the persona is cut off
      // before the check.
      const start = prompt.indexOf("This chat is for your portfolio");
      expect(start).toBeGreaterThan(0);
      expect(prompt.slice(start)).not.toMatch(word);
    });
  }

  it("carries no instruction about when to place a trade", () => {
    expect(prompt).not.toMatch(/Prefer intraday green rebound/i);
    expect(prompt).not.toMatch(/consider waiting/i);
    expect(prompt).not.toMatch(/write-eligible/i);
  });

  it("names the strike gap without the abbreviation", () => {
    expect(prompt).toMatch(/strikeAboveTodayPct/);
  });
});
