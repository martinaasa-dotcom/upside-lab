/**
 * The options gate. The interesting case is `null`, and it is interesting
 * for a reason that lives in a different function entirely.
 */
import { describe, expect, it } from "vitest";
import {
  shouldHideOptions,
  shouldSkipExperienceOnboarding,
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
} from "@/lib/experience-tier";
import { COMPOUND_TAB_ID, LAB_TAB_ID, PULSE_TAB_ID } from "@/lib/overview";

describe("shouldHideOptions", () => {
  it("hides for someone who said they do not know options", () => {
    expect(shouldHideOptions(false)).toBe(true);
  });

  it("shows for someone who said they do", () => {
    expect(shouldHideOptions(true)).toBe(false);
  });

  it("shows for someone who was never asked", () => {
    expect(shouldHideOptions(null)).toBe(false);
  });

  it("does not strip covered calls from existing holders", () => {
    /*
     * Why `null` must mean show, tied to the thing that makes it true.
     *
     * Onboarding is skipped for anyone who already owns something, so an
     * existing holder never gets asked and their answer stays null for
     * good. If null meant "hide", every one of them would lose covered-call
     * UI at once, with no question in front of them explaining why.
     */
    const existingHolder = shouldSkipExperienceOnboarding({
      holdingsCount: 3,
      portfolioSlugs: ["something-personal"],
    });
    expect(existingHolder).toBe(true); // never asked...
    expect(shouldHideOptions(null)).toBe(false); // ...so never hidden
  });

  it("still hides once that person answers no in Account", () => {
    // The protection is reachable for existing holders too -- it just has
    // to be chosen rather than assumed.
    expect(shouldHideOptions(false)).toBe(true);
  });
});

describe("experience-tier rooms", () => {
  /*
    These two used to assert the opposite, and the assertions were right
    about the code and wrong about the product. Lab was hidden from a
    novice, and Risk from a novice and an investor, on the reasoning that
    the analysis room waits until somebody says they are comfortable.

    Lab is where a beginner finds out that three of their holdings are most
    of their money, what a rough week would do to it, and which of their
    companies move together. It was being withheld from the one reader who
    had said out loud that they are new, with no way back in, since nothing
    surfaces a hidden room later. "I'll grow into the rest" meant never.

    What a novice asked for is fewer unexplained things, and the answer to
    that is to explain: every Lab tab now opens with a sentence in the
    reader's own figures. The tier still decides which panels are open by
    default, which is the part of "this looks simpler" that costs a
    beginner nothing.
  */
  it("hides no room from anybody", () => {
    for (const tier of ["novice", "investor", "advanced"] as const) {
      expect(TIER_HIDDEN_META_TABS[tier], tier).toEqual([]);
      expect(TIER_HIDDEN_LAB_TABS[tier], tier).toEqual([]);
    }
  });

  it("least of all the three rooms a beginner is here for", () => {
    // Pulse is the thesis check the product exists for, Growth is the
    // compounding explainer, and Lab is where the reader's own numbers get
    // taken apart. None of them is an advanced feature.
    for (const id of [LAB_TAB_ID, PULSE_TAB_ID, COMPOUND_TAB_ID]) {
      expect(TIER_HIDDEN_META_TABS.novice).not.toContain(id);
    }
    expect(TIER_HIDDEN_LAB_TABS.novice).not.toContain("risk");
    expect(TIER_HIDDEN_LAB_TABS.investor).not.toContain("risk");
  });

  it("keeps the mechanism, so hiding a room again has to be argued for", () => {
    // Deleting the records would let the next person reintroduce hiding
    // without meeting the reasoning above. Both still exist and are read.
    expect(Object.keys(TIER_HIDDEN_META_TABS).sort()).toEqual([
      "advanced",
      "investor",
      "novice",
    ]);
    expect(Object.keys(TIER_HIDDEN_LAB_TABS).sort()).toEqual([
      "advanced",
      "investor",
      "novice",
    ]);
  });
});
