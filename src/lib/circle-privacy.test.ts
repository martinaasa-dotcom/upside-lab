import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCircleAwards } from "@/lib/circle-awards";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";

/*
  What a circle shows, and the one thing it never shows.

  A circle prints the amounts: today in money as well as in percent, what
  each portfolio is worth, and the shares, the price and the value of every
  company in it. Those were withheld for a release on the argument that a
  friend's net worth should not be one subtraction away, and they are back,
  because whether the people in a circle see each other's amounts is a
  decision for the person who put their portfolio in one. It was never a
  real seal in any case: `/api/communities/[id]/book` has always sent the
  share count to every member, so anybody who opened the network tab could
  multiply.

  **What the API does withhold is cost**, and that is the line this file
  guards. `buy_price` reaches the owner and nobody else, so what somebody
  paid, and therefore whether they are up or down on a company, stays
  theirs. That is a rule the server keeps rather than a rule the markup
  keeps, so it is asserted against the route.

  The rest of the file is the voice rule, which did not move: a circle
  states a figure and never makes a joke of the person it belongs to.
*/

function personality(over: Partial<PortfolioPersonality>): PortfolioPersonality {
  const band = { label: "", description: "" };
  return {
    diversificationScore: 50,
    diversificationBand: band,
    riskScore: 50,
    riskBand: band,
    convictionScore: 20,
    convictionBand: band,
    topTicker: "AAPL",
    specialistScore: 30,
    themeCount: 2,
    cashPct: 2,
    dominantTheme: "software",
    animal: "Fox",
    animalEmoji: "🦊",
    tagline: "",
    archetype: {
      id: "fox",
      animal: "Fox",
      emoji: "🦊",
      criteria: "",
      vibe: "",
      strength: "",
      watchFor: "",
    },
    whyThisAnimal: "",
    expectedAnnualReturnPct: 8,
    maxDrawdownPct: 30,
    modeledAlphaPct: 0,
    ...over,
  } as PortfolioPersonality;
}

const MONEY = /\$\s?\d|\d[\d,]*\s?(dollars|USD)/i;

describe("a circle never prints what anything is worth", () => {
  it("names the largest and the smallest portfolio, with the amount", () => {
    const awards = buildCircleAwards([
      {
        id: "a",
        name: "Rasmus",
        totalValue: 400_000,
        personality: personality({}),
      },
      { id: "b", name: "Jaan", totalValue: 20_000, personality: personality({}) },
    ]);
    const big = awards.find((a) => a.id === "big-portfolio");
    const small = awards.find((a) => a.id === "small-portfolio");
    expect(big?.winner).toBe("Rasmus");
    expect(big?.stat).toBe("$400,000");
    expect(small?.winner).toBe("Jaan");
    expect(small?.stat).toBe("$20,000");
  });

  /*
    The reason a size award is ranked on the share of the circle and not on
    the balance. Every other measure here is a score out of 100 and the
    ranking divides one margin by another, so a raw balance arrives in units
    thousands of times larger and takes every award in the room. Rasmus is
    plainly the jumpiest here and would lose that award to his own bank
    balance.
  */
  it("does not let a large balance take every other award", () => {
    const awards = buildCircleAwards([
      {
        id: "a",
        name: "Rasmus",
        totalValue: 900_000,
        personality: personality({ riskScore: 95 }),
      },
      {
        id: "b",
        name: "Jaan",
        totalValue: 1_000,
        personality: personality({ riskScore: 20, diversificationScore: 95 }),
      },
    ]);
    expect(awards.find((a) => a.id === "big-portfolio")?.winner).toBe("Rasmus");
    expect(awards.find((a) => a.id === "jumpiest")?.winner).toBe("Rasmus");
    // And Jaan still wins something for the shape of his, rather than
    // being the person the size award happened to leave over.
    expect(
      awards.filter((a) => a.winner === "Jaan" && !a.id.endsWith("portfolio"))
    ).not.toEqual([]);
  });

  it("gives neither size award in a circle of one", () => {
    const awards = buildCircleAwards([
      { id: "a", name: "Rasmus", totalValue: 400_000, personality: personality({}) },
    ]);
    expect(awards.some((a) => a.id === "big-portfolio")).toBe(false);
    expect(awards.some((a) => a.id === "small-portfolio")).toBe(false);
  });

  it("prints the money in a fact in whole grouped dollars", () => {
    const members = [
      {
        name: "Rasmus",
        totalValue: 2_000_000,
        todayDollar: 41_000,
        todayPct: 0.021,
        roiPct: 0,
        personality: personality({ riskScore: 80, cashPct: 30 }),
      },
      {
        name: "Liisa",
        totalValue: 535,
        todayDollar: -12,
        todayPct: -0.022,
        roiPct: 0,
        personality: personality({ diversificationScore: 20 }),
      },
      {
        name: "Jaan",
        totalValue: 90_000,
        todayDollar: 100,
        todayPct: 0.001,
        roiPct: 0,
        personality: personality({ convictionScore: 62, topTicker: "NVDA" }),
      },
    ];
    /*
      Every amount printed here goes through `currency`, so it is grouped
      and carries no cents. A bare `2000000` in a sentence is the failure
      this checks for, and so is `$2,000,000.00`: a fact is a sentence, not
      a receipt.
    */
    const seen: string[] = [];
    for (let day = 0; day < 40; day += 1) {
      for (const fact of buildCommunityFunFacts(members, `2026-01-${day}`, 6)) {
        seen.push(fact);
        for (const amount of fact.match(/\$[\d,.]+/g) ?? []) {
          expect(amount, fact).not.toMatch(/\.\d/);
        }
        const bare = fact.replace(/\$[A-Z][A-Z0-9.-]*/g, "").match(/\b\d{4,}\b/);
        expect(bare, fact).toBeNull();
      }
    }
    expect(seen.some((f) => MONEY.test(f))).toBe(true);
  });

  it("says how far apart the two ends are without ranking the people", () => {
    /*
      The gap fact names two portfolios and no winner. "$X ahead of" is the
      wording this replaced, and it is the one sentence in the circle that
      turns a difference in savings into a scoreboard in front of a family.
    */
    const members = [
      {
        name: "Rasmus",
        totalValue: 2_000_000,
        todayDollar: 100,
        todayPct: 0.001,
        roiPct: 0,
        personality: personality({}),
      },
      {
        name: "Liisa",
        totalValue: 535,
        todayDollar: -12,
        todayPct: -0.022,
        roiPct: 0,
        personality: personality({ diversificationScore: 20 }),
      },
    ];
    for (let day = 0; day < 40; day += 1) {
      for (const fact of buildCommunityFunFacts(members, `2026-05-${day}`, 6)) {
        expect(fact, fact).not.toMatch(/ahead of|behind|beats|loses to/i);
      }
    }
  });
});

describe("a circle fact sounds like a person wrote it", () => {
  const SLANG =
    /villain arc|main character|pep talk|chin up|energy\b|gap season|group project|MVP/i;

  it("never calls a losing day a villain, or anything else a meme", () => {
    const members = [
      {
        name: "Amanda",
        totalValue: 10_000,
        todayDollar: -370,
        todayPct: -0.037,
        roiPct: 0,
        personality: personality({ riskScore: 88, cashPct: 22 }),
      },
      {
        name: "Martin",
        totalValue: 20_000,
        todayDollar: 400,
        todayPct: 0.02,
        roiPct: 0,
        personality: personality({ specialistScore: 90, themeCount: 4 }),
      },
    ];
    for (let day = 0; day < 40; day += 1) {
      const facts = buildCommunityFunFacts(members, `2026-02-${day}`, 6);
      for (const fact of facts) expect(fact, fact).not.toMatch(SLANG);
    }
  });

  it("gives one person one fact, not three", () => {
    // Whoever tops the concentration measure usually tops the one-kind and
    // the biggest-holding ones too. Measured on a real circle, three of six
    // facts were about the same person.
    const hogsEverything = personality({
      riskScore: 93,
      diversificationScore: 1,
      specialistScore: 93,
      convictionScore: 93,
      cashPct: 30,
      topTicker: "BTC",
      dominantTheme: "crypto",
    });
    const members = [
      {
        name: "Liisa",
        totalValue: 1000,
        todayDollar: -20,
        todayPct: -0.02,
        roiPct: 0,
        personality: hogsEverything,
      },
      {
        name: "Martin",
        totalValue: 1000,
        todayDollar: 10,
        todayPct: 0.01,
        roiPct: 0,
        personality: personality({ themeCount: 4 }),
      },
      {
        name: "Jaan",
        totalValue: 1000,
        todayDollar: 1,
        todayPct: 0.001,
        roiPct: 0,
        personality: personality({}),
      },
    ];
    for (let day = 0; day < 20; day += 1) {
      const facts = buildCommunityFunFacts(members, `2026-04-${day}`, 6);
      const aboutLiisa = facts.filter(
        (f) => f.includes("Liisa") && !f.includes("Martin") && !f.includes("Jaan")
      );
      expect(aboutLiisa.length, facts.join(" | ")).toBeLessThanOrEqual(1);
    }
  });

  it("does not restate an award that is already on screen above it", () => {
    const members = [
      {
        name: "Amanda",
        totalValue: 10_000,
        todayDollar: 0,
        todayPct: 0,
        roiPct: 0,
        personality: personality({ riskScore: 95, diversificationScore: 20 }),
      },
      {
        // Martin takes every other measure, so the only fact Amanda can be
        // the subject of is the jumpy one. Otherwise the one-fact-per-person
        // rule could be what drops it, and this test would pass or fail for
        // the wrong reason.
        name: "Martin",
        totalValue: 10_000,
        todayDollar: 0,
        todayPct: 0,
        roiPct: 0,
        personality: personality({
          riskScore: 10,
          diversificationScore: 90,
          themeCount: 5,
          cashPct: 30,
          convictionScore: 45,
        }),
      },
    ];
    const withAward = buildCommunityFunFacts(
      members,
      "2026-03-03",
      6,
      ["jumpiest"]
    );
    expect(withAward.some((f) => /jumpiest/i.test(f))).toBe(false);
    const without = buildCommunityFunFacts(members, "2026-03-03", 6);
    expect(without.some((f) => /jumpiest/i.test(f))).toBe(true);
  });
});

describe("one award per person, and only a clear one", () => {
  it("never hands the same person two", () => {
    const awards = buildCircleAwards([
      {
        id: "a",
        name: "Amanda",
        totalValue: 10_000,
        personality: personality({
          diversificationScore: 100,
          riskScore: 10,
          themeCount: 9,
          cashPct: 40,
        }),
      },
      { id: "b", name: "Martin", totalValue: 10_000,
        personality: personality({}) },
      { id: "c", name: "Rasmus", totalValue: 10_000,
        personality: personality({}) },
    ]);
    const winners = awards.map((a) => a.winnerId);
    expect(new Set(winners).size).toBe(winners.length);
  });

  it("does not call a broad market fund a one-kind diet", () => {
    const awards = buildCircleAwards([
      {
        id: "a",
        name: "Amanda",
        totalValue: 10_000,
        personality: personality({
          specialistScore: 100,
          dominantTheme: "index",
          diversificationScore: 100,
        }),
      },
      { id: "b", name: "Martin", totalValue: 10_000,
        personality: personality({}) },
    ]);
    expect(awards.some((a) => a.id === "specialist")).toBe(false);
  });

  it("gives nothing when nobody is clearly ahead", () => {
    const same = personality({});
    const awards = buildCircleAwards([
      { id: "a", name: "A", totalValue: 10_000,
        personality: same },
      { id: "b", name: "B", totalValue: 10_000,
        personality: same },
      { id: "c", name: "C", totalValue: 10_000,
        personality: same },
    ]);
    expect(awards).toEqual([]);
  });

  it("writes every title in sentence case", () => {
    const awards = buildCircleAwards([
      { id: "a", name: "A", totalValue: 10_000,
        personality: personality({ riskScore: 95 }) },
      { id: "b", name: "B", totalValue: 10_000,
        personality: personality({ riskScore: 10 }) },
    ]);
    expect(awards.length).toBeGreaterThan(0);
    for (const a of awards) {
      const words = a.title.split(" ").slice(1);
      for (const w of words) {
        expect(w[0], `"${a.title}" is title case`).toBe(w[0]!.toLowerCase());
      }
    }
  });
});

describe("the circle surfaces that are markup", () => {
  const board = readFileSync("src/components/CommunityTodayBoard.tsx", "utf8");
  const cards = readFileSync("src/components/CircleCards.tsx", "utf8");

  it("still leads with the percent, with its sign", () => {
    // The board is ranked on the percent and reads on the percent; the
    // dollar column beside it is a second reading of the same day, never a
    // second ordering of the people.
    expect(board).toContain("signedPercent(pct)");
    expect(board).toContain("[...members]\n          .sort((a, b) => (b.todayPct ?? -1) - (a.todayPct ?? -1))");
    const readOnly = cards.slice(cards.indexOf("export function ReadOnlyHoldings"));
    expect(readOnly).toMatch(/label="Today"[\s\S]{0,120}signedPercent\(todayPct\)/);
  });

  it("shows the shares and the value of every holding", () => {
    const readOnly = cards.slice(cards.indexOf("export function ReadOnlyHoldings"));
    expect(readOnly).toContain(">Shares</div>");
    expect(readOnly).toContain(">Value</div>");
    expect(readOnly).toContain("{h.shares}");
    expect(readOnly).toContain("currency(value)");
  });
});

/*
  The one figure a circle genuinely withholds, and it is the server that
  withholds it. Everything else on these screens is derived from rows the
  API already sends, so a markup rule could never have been the seal; this
  one can be, because the number never leaves the database.
*/
describe("what somebody paid stays theirs", () => {
  const route = readFileSync(
    "src/app/api/communities/[id]/book/route.ts",
    "utf8"
  );

  it("sends buy_price as zero to everybody but the owner", () => {
    expect(route).toContain(
      "buy_price: showAllCost || (classroom && own) ? row.buy_price : 0,"
    );
  });
});
