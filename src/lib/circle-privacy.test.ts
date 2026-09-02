import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCircleAwards } from "@/lib/circle-awards";
import { buildCommunityFunFacts } from "@/lib/community-fun-facts";
import type { PortfolioPersonality } from "@/lib/portfolio-personality";

/*
  A circle says how a day went and never what anything is worth.

  The landing page says so in as many words, and it is the reason anybody
  agrees to be in one: "they see how your day went, never what anything is
  worth". A real circle broke that promise on six surfaces at once, so this
  file checks the two that decide their own wording (the awards and the
  facts) by their output, and the four that are markup by reading the
  markup, which is the same floor `reader-copy.test.ts` uses and for the
  same reason.
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
  it("gives no award for the size of a portfolio", () => {
    const awards = buildCircleAwards([
      { id: "a", name: "Rasmus", personality: personality({ riskScore: 90 }) },
      { id: "b", name: "Jaan", personality: personality({ riskScore: 20 }) },
    ]);
    expect(awards.length).toBeGreaterThan(0);
    for (const award of awards) {
      expect(award.stat, award.title).not.toMatch(MONEY);
      expect(award.description, award.title).not.toMatch(MONEY);
      expect(award.title.toLowerCase()).not.toContain("largest portfolio");
      expect(award.title.toLowerCase()).not.toContain("small but mighty");
    }
  });

  it("prints no money in a fact, however large the portfolios are", () => {
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
    for (let day = 0; day < 40; day += 1) {
      const facts = buildCommunityFunFacts(members, `2026-01-${day}`, 6);
      for (const fact of facts) {
        // A cashtag is a company, not an amount: "$NVDA" has to survive
        // while "$2,000,000" must not.
        expect(fact.replace(/\$[A-Z][A-Z0-9.-]*/g, ""), fact).not.toMatch(MONEY);
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
        personality: personality({
          diversificationScore: 100,
          riskScore: 10,
          themeCount: 9,
          cashPct: 40,
        }),
      },
      { id: "b", name: "Martin", personality: personality({}) },
      { id: "c", name: "Rasmus", personality: personality({}) },
    ]);
    const winners = awards.map((a) => a.winnerId);
    expect(new Set(winners).size).toBe(winners.length);
  });

  it("does not call a broad market fund a one-kind diet", () => {
    const awards = buildCircleAwards([
      {
        id: "a",
        name: "Amanda",
        personality: personality({
          specialistScore: 100,
          dominantTheme: "index",
          diversificationScore: 100,
        }),
      },
      { id: "b", name: "Martin", personality: personality({}) },
    ]);
    expect(awards.some((a) => a.id === "specialist")).toBe(false);
  });

  it("gives nothing when nobody is clearly ahead", () => {
    const same = personality({});
    const awards = buildCircleAwards([
      { id: "a", name: "A", personality: same },
      { id: "b", name: "B", personality: same },
      { id: "c", name: "C", personality: same },
    ]);
    expect(awards).toEqual([]);
  });

  it("writes every title in sentence case", () => {
    const awards = buildCircleAwards([
      { id: "a", name: "A", personality: personality({ riskScore: 95 }) },
      { id: "b", name: "B", personality: personality({ riskScore: 10 }) },
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
  const home = readFileSync("src/components/CircleHome.tsx", "utf8");
  const members = readFileSync(
    "src/components/CommunityMembersPanel.tsx",
    "utf8"
  );

  /*
    `currency` and `signedCurrency` are the only two functions in this app
    that render an amount of money, so importing either into a circle
    surface is the whole of the failure this rule exists to prevent.
  */
  const RENDERS_MONEY = /\b(signedCurrency|currency)\s*\(/;

  it("draws no amount on the board, the animal cards, the rows, or the home", () => {
    expect(board).not.toMatch(RENDERS_MONEY);
    expect(cards).not.toMatch(RENDERS_MONEY);
    expect(home).not.toMatch(RENDERS_MONEY);
    expect(members).not.toMatch(RENDERS_MONEY);
  });

  it("still prints the percent, with its sign", () => {
    expect(board).toContain("signedPercent(pct)");
  });
});
