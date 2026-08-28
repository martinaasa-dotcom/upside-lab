/**
 * What an old `?tab=` / `?sheet=` token meant.
 *
 * This file used to test a whole parser that turned those tokens into the
 * open room, because the query was the app's idea of where you were. The
 * path is that now (`book-routes.test.ts`), and the one question left for
 * a token is which room to retire it onto, which `legacy-urls.test.ts`
 * asks end to end. `metaTabFromToken` is the shared answer both of those
 * lean on, so it is tested here on its own.
 */
import { describe, expect, it } from "vitest";
import { metaTabFromToken } from "@/lib/dashboard-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
} from "@/lib/overview";

describe("meta tab tokens", () => {
  it("reads the spelling each room shipped with", () => {
    expect(metaTabFromToken("overview")).toBe(OVERVIEW_TAB_ID);
    expect(metaTabFromToken("pulse")).toBe(PULSE_TAB_ID);
    expect(metaTabFromToken("lab")).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("compound")).toBe(COMPOUND_TAB_ID);
    expect(metaTabFromToken("alerts")).toBe(ALERTS_TAB_ID);
  });

  it("reads a tab id as its own token", () => {
    // Some URLs carried the internal id rather than the word.
    expect(metaTabFromToken(PULSE_TAB_ID)).toBe(PULSE_TAB_ID);
    expect(metaTabFromToken(COMPOUND_TAB_ID)).toBe(COMPOUND_TAB_ID);
  });

  it("folds old Seasonality bookmarks onto Lab", () => {
    // Seasonality moved inside Lab, so a bookmark naming it has to land on
    // the room that now contains it rather than one that renders nothing.
    expect(metaTabFromToken(SEASONALITY_TAB_ID)).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("seasonality")).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("statistics")).toBe(LAB_TAB_ID);
    expect(metaTabFromToken("stats")).toBe(LAB_TAB_ID);
  });

  it("answers nothing for a token that names no room", () => {
    // Portfolio tokens are not meta tabs: they are answered against the
    // reader's own list, which this function has no access to.
    expect(metaTabFromToken("portfolio")).toBeNull();
    expect(metaTabFromToken("book")).toBeNull();
    expect(metaTabFromToken("qwerty")).toBeNull();
  });
});
