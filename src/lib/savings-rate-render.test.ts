import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SavingsRatePanel } from "@/components/retirement/SavingsRatePanel";
import { buildPlan, defaultInputs } from "@/lib/retirement/plan";

/*
  The panel read back as text, the way a reader sees it. JSX eats the space
  between an expression and the word on the next line, and only React's own
  separator comment closes two pieces of text up with no gap.
*/
function render(takeHomeMonthly: number, pensionMonthly = 300) {
  const inputs = { ...defaultInputs(), annualContribution: 800 * 12, currentPot: 20_000 };
  const plan = buildPlan(inputs, 95);
  const html = renderToStaticMarkup(
    createElement(SavingsRatePanel, {
      inputs,
      plan,
      patch: () => {},
      initialPay: { takeHomeMonthly, pensionMonthly },
    })
  );
  const text = html.replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  return { html, text };
}

describe("the savings rate panel", () => {
  it("asks for take-home pay before it says anything about a share", () => {
    const { text } = render(0);
    expect(text).toContain("Add what you take home");
    expect(text).not.toContain("You keep");
  });

  it("states the share kept with the pension counted", () => {
    const { text } = render(3000, 300);
    // 300 pension + 500 invested from take-home, of 3,300 earned.
    expect(text).toContain("You keep 24%");
    expect(text).toContain("The same");
    expect(text).toContain("Spending it less");
  });

  it("welds no figure onto the word after it", () => {
    const { html } = render(3000, 300);
    const welded = html.match(/\d<!-- -->[A-Za-z]/g) ?? [];
    expect(welded).toEqual([]);
  });

  it("never tells the reader what to do", () => {
    const { text } = render(3000, 300);
    expect(text).not.toMatch(/\byou should\b|\bcut your\b|\bstop buying\b|\bgive up\b/i);
  });
});
