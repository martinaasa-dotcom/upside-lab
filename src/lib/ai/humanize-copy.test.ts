import { describe, expect, it } from "vitest";

import { humanizeMargusText, pulseSuggestion } from "@/lib/ai/humanize-copy";

describe("humanizeMargusText picker talk", () => {
  it("rewrites which-portfolio questions", () => {
    expect(humanizeMargusText("Which of your portfolios should I update?")).toBe(
      "I'll use your portfolio."
    );
    expect(
      humanizeMargusText("Which portfolio do you want this to apply to?")
    ).toBe("I'll use your portfolio.");
    expect(humanizeMargusText("Pick a portfolio and I'll add NVDA.")).toBe(
      "I'll use your portfolio."
    );
  });

  it("collapses plural portfolio talk", () => {
    expect(
      humanizeMargusText("Cash sitting ready across your portfolios.")
    ).toBe("Cash sitting ready in your portfolio.");
  });

  it("leaves ordinary which-names questions alone", () => {
    const q = "Which names moved the most this week?";
    expect(humanizeMargusText(q)).toBe(q);
  });
});

describe("humanizeMargusText trade orders", () => {
  it("rewrites a sized trim as a range fact and keeps the news", () => {
    const out = humanizeMargusText(
      "Trim 15% on NBIS after its 6.3% jump tied to Burry's NVDA call concerns and its AI GPU revenue."
    );
    expect(out).toMatch(/above its recent range/i);
    expect(out).toMatch(/Burry/i);
    expect(out).not.toMatch(/\btrim(?:ming)?\s+\d/i);
    const crwv = humanizeMargusText(
      "Trim 10% on CRWV after its 5.2% jump tied to the Rescale partnership, keeping the AI cloud upside"
    );
    expect(crwv).toMatch(/Rescale/i);
    expect(crwv).not.toMatch(/\btrim(?:ming)?\s+\d/i);
    expect(crwv).not.toMatch(/keeping the/i);
  });

  it("rewrites add-the-dip with a second entry as a range fact", () => {
    const out = humanizeMargusText(
      "Add the dip on DRAM near $52, then revisit if the price drops to $48, because AI-driven memory demand is intact."
    );
    expect(out).toMatch(/below its recent range/i);
    expect(out).toMatch(/\$52/);
    expect(out).toMatch(/AI-driven memory/i);
    expect(out).not.toMatch(/\badd the dip\b/i);
    expect(out).not.toMatch(/\brevisit if\b/i);
  });

  it("rewrites keep-an-eye as a fact, not a watch order", () => {
    const out = humanizeMargusText(
      "Reddit's dip is a warning sign; keep an eye on user growth and ad revenue"
    );
    expect(out).toMatch(/user growth/i);
    expect(out).not.toMatch(/keep an eye/i);
  });

  it("does not treat mix talk as a buy order", () => {
    const out = humanizeMargusText(
      "Add an AI power sleeve next to the compute names."
    );
    expect(out).toMatch(/electricity-for-AI names/i);
    expect(out).not.toMatch(/below its recent range/i);
  });

  it("rewrites modeled-trim leftover as a range fact", () => {
    const out = humanizeMargusText(
      "A 10% modeled trim fact fits $CRWV at $92.86 after extending past its recent trading band on renewables."
    );
    expect(out).toMatch(/above its recent range/i);
    expect(out).toMatch(/extending past/i);
    expect(out).not.toMatch(/modeled trim/i);
    const withLevel = humanizeMargusText(
      "Nebius Group is running well above its recent range at $227.18 with a 10% modeled trim level while contracts hold."
    );
    expect(withLevel).toMatch(/Nebius/i);
    expect(withLevel).not.toMatch(/modeled trim/i);
  });
});

describe("humanizeMargusText desk words on their own", () => {
  /*
    Every rule these cover already existed as a phrase: "high conviction",
    "sector rotation", "high-beta". A model told not to write the phrase
    reaches for the bare noun instead, which is what these check.
  */
  const cases: Array<[string, RegExp]> = [
    ["Your conviction here is high.", /how sure you are/i],
    ["The rotation is into energy.", /money moving between groups/i],
    ["Its beta is above one.", /swings with the market/i],
    ["Liquidity is thin on this one.", /bought and sold/i],
    ["The cadence of its results is quarterly.", /rhythm/i],
    ["Expect IV crush the day after.", /what options pay after results/i],
    ["The strike is 20% OTM.", /above today's price/i],
    ["It trades under its NAV.", /the fund's holdings are worth/i],
    ["There is alpha left in this.", /better than the market/i],
    ["Its moat is the network.", /keeps competitors out/i],
    ["The TAM is enormous.", /how big the market could get/i],
    ["Capex is rising fast.", /buildings and equipment/i],
    ["Your cost basis is $40.", /what you paid on average/i],
    ["The print came in soft.", /the number came in soft/i],
  ];

  for (const [input, expected] of cases) {
    it(`rewrites: ${input}`, () => {
      expect(humanizeMargusText(input)).toMatch(expected);
    });
  }

  it("leaves the verb form of print alone", () => {
    expect(humanizeMargusText("It printed 42% for the year.")).toMatch(
      /printed 42%/
    );
  });

  it("never lets a missing price render as a dollar sign and a word", () => {
    expect(humanizeMargusText("A level to think about: around $spot.")).toBe(
      "A level to think about: around today's price."
    );
    expect(humanizeMargusText("It is 6% below spot.")).toMatch(
      /below today's price/
    );
  });
});

describe("humanizeMargusText assistant openers", () => {
  it("catches an opener that is not the first sentence", () => {
    expect(
      humanizeMargusText(
        "The price fell about 4% today. It's important to note that the company said nothing at all."
      )
    ).toBe("The price fell about 4% today. The company said nothing at all.");
  });

  it("still catches one that opens the reply", () => {
    expect(
      humanizeMargusText("At the end of the day, the week was quiet.")
    ).toBe("The week was quiet.");
  });

  it("catches one that opens a later line", () => {
    expect(
      humanizeMargusText(
        "Prices were steady.\nIt is worth noting that nothing was traded."
      )
    ).toMatch(/\nNothing was traded\./);
  });

  it("leaves an enum alone", () => {
    expect(humanizeMargusText("intact")).toBe("intact");
    expect(humanizeMargusText("hold")).toBe("hold");
  });
});

describe("pulseSuggestion", () => {
  it("says a watch verdict is about the company, not missing history", () => {
    const out = pulseSuggestion({ action: "watch" });
    expect(out).toMatch(/worth following/i);
    expect(out).not.toMatch(/history/i);
  });

  it("drops the price when there is no readable one", () => {
    expect(pulseSuggestion({ action: "add", addLevel: "around $spot" })).toBe(
      "Price is below its recent range."
    );
  });
});
