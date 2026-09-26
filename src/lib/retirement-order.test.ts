import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
  THE ORDER THIS ROOM RENDERS IN, WITH THE FOLDS HELD OPEN.

  Two sessions reached this room at once with the same complaint and
  different halves of the answer, which this repository warns is the
  dangerous shape: both sound, both merging cleanly, and disagreeing about
  one thing. That thing was the order, so it is pinned rather than left to
  whichever change lands second.

  `BelowFold` is mocked to render its children, because it starts closed by
  design and the panels behind it would otherwise be absent from the markup
  entirely. That the fold really does withhold them is the sibling
  assertion in `retirement-room.test.ts`; this file is only about sequence.
*/
vi.mock("@/components/BelowFold", () => ({
  BelowFold: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
}));

const { RetirementSheet } = await import(
  "@/components/retirement/RetirementSheet"
);

const body = renderToStaticMarkup(
  createElement(RetirementSheet, { portfolioValue: 42_000 })
)
  .replace(/<[^>]*>/g, " ")
  .replace(/\s+/g, " ");

function at(phrase: string): number {
  const i = body.indexOf(phrase);
  expect(i, `${phrase} must be on the page`).toBeGreaterThan(-1);
  return i;
}

describe("the retirement room's panel order", () => {
  it("puts the answer card before anything else", () => {
    /*
      The question is a sentence now and the answer sits directly under
      it, so "answer first" means the verdict is in the first card and
      nothing is between the two.
    */
    expect(at("When could you stop working?")).toBeLessThan(at("Fine-tune the plan"));
  });

  it("keeps the spending layers ahead of the folded working", () => {
    expect(at("Fine-tune the plan")).toBeLessThan(
      at("What a bad year actually costs you")
    );
    expect(at("What a bad year actually costs you")).toBeLessThan(
      at("Show the working")
    );
  });

  it("holds the working back until it is asked for", () => {
    /*
      The survival curve, the grid and the milestones are one press away.
      That the fold also opens on its own for "How long it lasts" is the
      sibling assertion in `retirement-room.test.ts`.
    */
    expect(body).not.toContain("What stopping at each age costs");
    expect(body).not.toContain("Where you stand");
  });
});
