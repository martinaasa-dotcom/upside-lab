import { describe, expect, it } from "vitest";

import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { mobileTabFromActiveId } from "@/lib/mobile-tab";

describe("mobileTabFromActiveId", () => {
  it("marks a portfolio id as Holdings even when that table is empty", () => {
    expect(mobileTabFromActiveId("a-portfolio-uuid")).toBe("holdings");
    expect(mobileTabFromActiveId("__portfolio_pending__")).toBe("holdings");
  });

  it("maps meta-tabs without looking at holdings", () => {
    expect(mobileTabFromActiveId(OVERVIEW_TAB_ID)).toBe("home");
    expect(mobileTabFromActiveId(ALERTS_TAB_ID)).toBe("home");
    expect(mobileTabFromActiveId(PULSE_TAB_ID)).toBe("pulse");
    expect(mobileTabFromActiveId(LAB_TAB_ID)).toBe("lab");
    expect(mobileTabFromActiveId(COMPOUND_TAB_ID)).toBe("compound");
    expect(mobileTabFromActiveId(null)).toBeNull();
  });
});
