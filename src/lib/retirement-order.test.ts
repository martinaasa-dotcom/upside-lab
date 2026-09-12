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
  it("answers, then asks", () => {
    expect(at("Your number")).toBeLessThan(at("Start here"));
  });

  it("never puts a panel that can change the plan after the results table", () => {
    /*
      `LongevityPanel` used to sit after the grid, the ladder and the
      spending layers on the argument that it is a lesson a reader plays
      with. It is also, at a deeper level, three dials that `patch()` the
      plan, which is what moved it here: nothing that writes to the plan
      may sit after `GridPanel` any more, whatever the detail level, so a
      reader who corrects a dial always sees the table it feeds directly
      below rather than having to scroll back up past it.
    */
    expect(at("Start here")).toBeLessThan(at("How long the money has to last"));
    expect(at("How long the money has to last")).toBeLessThan(
      at("What stopping at each age costs")
    );
  });

  it("never sets a pot against a target before asking what the pot is", () => {
    /*
      #250 found this from the other side: on a pot of zero, "Where you
      stand" reads as "you have nothing, short by the whole target", which
      is an alarming statement about somebody who has not been asked
      anything yet. It is answered twice here: the card that asks comes
      first, and the room opens on a template rather than on zeroes.
    */
    expect(at("Start here")).toBeLessThan(at("Where you stand"));
  });

  it("keeps the results together, with the illustrative slider last", () => {
    expect(at("What stopping at each age costs")).toBeLessThan(
      at("Where you stand")
    );
    expect(at("Where you stand")).toBeLessThan(
      at("What a bad year actually costs you")
    );
  });
});
