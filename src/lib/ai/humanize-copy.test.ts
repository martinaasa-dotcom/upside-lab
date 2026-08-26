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
