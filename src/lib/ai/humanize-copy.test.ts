import { describe, expect, it } from "vitest";

import { humanizeMargusText } from "@/lib/ai/humanize-copy";

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
