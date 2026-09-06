import { describe, expect, it } from "vitest";
import { fourQuestions, rangePosition } from "@/lib/company/four-questions";
import { fairValueRead } from "@/lib/company/fair-value";
import { makeFacts, makeOrdinaryFacts } from "@/lib/company/facts-fixture";

/**
 * The four sit at the top of the room, so they are read by somebody who
 * reads nothing else. Two properties hold them up: **an answer with no
 * figure behind it says so**, and **none of them tells anybody what to
 * do.**
 */

const VERDICTS =
  /\b(you should|we (think|like|recommend)|advise|buy it|sell it|cheap|expensive|undervalued|overvalued|bargain|great buy)\b/i;

const ordinary = makeOrdinaryFacts();

describe("all four are always present", () => {
  it("asks the same four questions of any company", () => {
    const answers = fourQuestions({
      facts: ordinary,
      read: fairValueRead(ordinary),
    });
    expect(answers.map((a) => a.id)).toEqual([
      "history",
      "assuming",
      "quality",
      "change-my-mind",
    ]);
    for (const a of answers) {
      expect(a.question.endsWith("?"), a.question).toBe(true);
      expect(a.answer.length).toBeGreaterThan(40);
    }
  });

  it("keeps a question the feed could not answer, and marks it thin", () => {
    const bare = makeFacts();
    const answers = fourQuestions({ facts: bare, read: fairValueRead(bare) });
    expect(answers).toHaveLength(4);
    const thin = answers.filter((a) => a.thin);
    expect(thin.length).toBeGreaterThan(0);
    for (const a of thin) {
      expect(a.figure, a.id).toBe("n/a");
      // A question that could not be answered has to say which reading was
      // missing, or a reader assumes it was answered well.
      expect(a.answer, a.id).toMatch(/did not carry|carried neither|no price level|no earnings/i);
    }
  });
});

describe("each answer is measured against something real", () => {
  it("puts the price in its own year and names both yardsticks", () => {
    const [history] = fourQuestions({
      facts: ordinary,
      read: fairValueRead(ordinary),
    });
    // $100 in an $80 to $120 year is exactly halfway up it.
    expect(rangePosition(ordinary)).toBeCloseTo(0.5, 6);
    expect(history!.figure).toBe("50%");
    expect(history!.answer).toMatch(/\$80\.00 to \$120\.00/);
    expect(history!.answer).toMatch(/times next year's earnings/);
  });

  it("says the growth the price is asking for, backwards from the multiple", () => {
    const answers = fourQuestions({
      facts: makeOrdinaryFacts({ price: 200, epsNextYear: 4 }),
      read: fairValueRead(makeOrdinaryFacts({ price: 200, epsNextYear: 4 })),
    });
    const assuming = answers.find((a) => a.id === "assuming")!;
    // 50 times earnings back to 20 over five years is about 20% a year.
    expect(assuming.figure).toMatch(/a year/);
    expect(assuming.answer).toMatch(/20 times earnings/);
    expect(assuming.answer).toMatch(/no discount rate and no model/);
  });

  it("keeps the business and the price apart in the third question", () => {
    const quality = fourQuestions({
      facts: ordinary,
      read: fairValueRead(ordinary),
    }).find((a) => a.id === "quality")!;
    expect(quality.answer).toMatch(/of every \$100 it sells/);
    expect(quality.answer).toMatch(/two measurements, not one/);
  });

  it("hangs the fourth on a level and a date, and names the model's half", () => {
    const answer = fourQuestions({
      facts: ordinary,
      read: fairValueRead(ordinary),
      exitLevel: 50,
      nextEarnings: "2026-10-28",
      againstPoint: "Its biggest customer builds its own chips now.",
    }).find((a) => a.id === "change-my-mind")!;
    expect(answer.figure).toBe("$50.00");
    expect(answer.answer).toMatch(/50% under today/);
    expect(answer.answer).toMatch(/next set of results/);
    expect(answer.answer).toMatch(/The model's own answer/);
    expect(answer.maker).toBe("model");
  });
});

describe("a fund and a coin are answered honestly rather than skipped", () => {
  it("says a fund's price is the sum of what it holds", () => {
    const fund = makeOrdinaryFacts({ kind: "ETF" });
    const assuming = fourQuestions({
      facts: fund,
      read: fairValueRead(fund),
    }).find((a) => a.id === "assuming")!;
    expect(assuming.answer).toMatch(/sum of what it holds/i);
    expect(assuming.thin).toBe(false);
  });

  it("says a coin has no earnings for a price to be assuming anything of", () => {
    const coin = makeOrdinaryFacts({ kind: "CRYPTOCURRENCY" });
    const assuming = fourQuestions({
      facts: coin,
      read: fairValueRead(coin),
    }).find((a) => a.id === "assuming")!;
    expect(assuming.answer).toMatch(/no earnings behind this one/i);
  });
});

describe("none of the four tells anybody what to do", () => {
  const cases = [
    ["an ordinary company", ordinary],
    ["one the feed barely covers", makeFacts()],
    ["one priced far above its estimates", makeOrdinaryFacts({ price: 900 })],
    ["one priced far below them", makeOrdinaryFacts({ price: 9 })],
  ] as const;

  for (const [name, facts] of cases) {
    it(`stays descriptive for ${name}`, () => {
      for (const a of fourQuestions({
        facts,
        read: fairValueRead(facts),
        exitLevel: 40,
      })) {
        expect(a.answer, `${a.id}: ${a.answer}`).not.toMatch(VERDICTS);
      }
    });
  }
});
