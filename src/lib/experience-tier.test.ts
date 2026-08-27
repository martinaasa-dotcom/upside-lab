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
  it("hides Lab for someone new, and never Pulse or Growth", () => {
    expect(TIER_HIDDEN_META_TABS.novice).toEqual([LAB_TAB_ID]);
    expect(TIER_HIDDEN_META_TABS.novice).not.toContain(PULSE_TAB_ID);
    expect(TIER_HIDDEN_META_TABS.novice).not.toContain(COMPOUND_TAB_ID);
  });

  it("leaves every top-level room on for investor and advanced", () => {
    expect(TIER_HIDDEN_META_TABS.investor).toEqual([]);
    expect(TIER_HIDDEN_META_TABS.advanced).toEqual([]);
  });

  it("keeps the shock lab off until advanced", () => {
    expect(TIER_HIDDEN_LAB_TABS.novice).toEqual(["risk"]);
    expect(TIER_HIDDEN_LAB_TABS.investor).toEqual(["risk"]);
    expect(TIER_HIDDEN_LAB_TABS.advanced).toEqual([]);
  });
});
