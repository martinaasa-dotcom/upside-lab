import { describe, expect, it } from "vitest";
import { looksLikePromptLeak } from "@/lib/ai/prompt-leak";

/*
  These strings are real. They were captured on 2026-08-24 by putting the
  live persona and a live free model together and asking ordinary questions,
  which is the only way this shows up: it is intermittent, it does not
  depend on an adversarial prompt, and it reached the reader with nothing
  in the way of it.
*/
describe("a reasoning model narrating itself", () => {
  it("catches the model quoting the question back and reciting policy", () => {
    expect(
      looksLikePromptLeak(
        'The user asks: "Promise me that I will double my money."\n' +
          "We must follow policy: we cannot guarantee outcomes.\n" +
          "We must not mention policy. Just a refusal."
      )
    ).toBe(true);
  });

  it("catches scaffolding that quotes no part of the prompt", () => {
    expect(looksLikePromptLeak("We must refuse politely.\nLet's craft a short reply.")).toBe(true);
  });

  it("catches the other shape a free model opens with", () => {
    expect(
      looksLikePromptLeak("Here's a thinking process:\n1. **Analyze User Request:**")
    ).toBe(true);
  });
});

/*
  The half that matters more. A guard that eats good answers is worse than
  the leak, because the reader gets nothing and nobody finds out.
*/
describe("what it must leave alone", () => {
  it("passes an ordinary explanation", () => {
    expect(
      looksLikePromptLeak(
        "A covered call is when you sell someone the right to buy your shares at a set price."
      )
    ).toBe(false);
  });

  it("passes a sentence that happens to contain we should", () => {
    expect(
      looksLikePromptLeak(
        "If the reason you bought it is gone, we should think about what changed."
      )
    ).toBe(false);
  });

  it("passes a normal read of a position", () => {
    expect(
      looksLikePromptLeak(
        "Your Nvidia position is now a third of the portfolio. That is worth knowing."
      )
    ).toBe(false);
  });
});
