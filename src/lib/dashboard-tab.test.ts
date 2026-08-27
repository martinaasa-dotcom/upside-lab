import { describe, expect, it } from "vitest";
import {
  metaTabFromToken,
  normalizeMetaTabId,
  resolveSheetIdFromSearch,
} from "@/lib/dashboard-tab";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";
import { PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import type { Portfolio } from "@/lib/types";

const aasad: Portfolio = {
  id: "p1",
  name: "Aasad",
  slug: "aasad",
  cash_balance: 0,
  sort_order: 0,
};

describe("dashboard tabs", () => {
  it("keeps Pulse and Growth as top-level rooms", () => {
    expect(normalizeMetaTabId(PULSE_TAB_ID)).toBe(PULSE_TAB_ID);
    expect(normalizeMetaTabId(COMPOUND_TAB_ID)).toBe(COMPOUND_TAB_ID);
  });

  it("folds old Seasonality bookmarks onto Lab", () => {
    expect(normalizeMetaTabId(SEASONALITY_TAB_ID)).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("seasonality")).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("stats")).toBe(LAB_TAB_ID);
  });

  it("opens Overview, Pulse, Lab, and Growth from ?tab=", () => {
    expect(
      resolveSheetIdFromSearch( [], new URLSearchParams("tab=overview"))
    ).toBe(OVERVIEW_TAB_ID);
    expect(
      resolveSheetIdFromSearch([], new URLSearchParams("tab=pulse"))
    ).toBe(PULSE_TAB_ID);
    expect(resolveSheetIdFromSearch([], new URLSearchParams("tab=lab"))).toBe(
      LAB_TAB_ID
    );
    expect(
      resolveSheetIdFromSearch([], new URLSearchParams("tab=compound"))
    ).toBe(COMPOUND_TAB_ID);
  });

  it("keeps Holdings as a real room when no portfolio is named", () => {
    expect(
      resolveSheetIdFromSearch([], new URLSearchParams("tab=portfolio"))
    ).toBe(PORTFOLIO_TAB_PENDING);
  });

  it("matches a portfolio by slug, id, or name", () => {
    const list = [aasad];
    expect(
      resolveSheetIdFromSearch(list, new URLSearchParams("portfolio=aasad"))
    ).toBe("p1");
    expect(
      resolveSheetIdFromSearch(list, new URLSearchParams("portfolio=p1"))
    ).toBe("p1");
    expect(
      resolveSheetIdFromSearch(list, new URLSearchParams("sheet=Aasad"))
    ).toBe("p1");
  });
});
