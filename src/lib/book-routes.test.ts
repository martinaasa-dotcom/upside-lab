import { describe, expect, it } from "vitest";
import {
  hrefForTabId,
  tabIdFromPath,
} from "@/lib/book-routes";
import { PORTFOLIO_TAB_PENDING } from "@/lib/mobile-tab";
import {
  ALERTS_TAB_ID,
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
} from "@/lib/overview";
import { workspaceRoomId } from "@/lib/workspace-paths";
import type { Portfolio } from "@/lib/types";

function sheet(over: Partial<Portfolio>): Portfolio {
  return {
    id: "id-1",
    name: "Growth",
    slug: "growth-fund",
    ...over,
  } as Portfolio;
}

const LIST = [
  sheet({ id: "aaa", name: "Aasad", slug: "aasad" }),
  sheet({ id: "bbb", name: "Retirement", slug: "retirement" }),
];

describe("hrefForTabId", () => {
  it("sends Home to the root, not a query", () => {
    expect(hrefForTabId(OVERVIEW_TAB_ID, LIST)).toBe("/");
  });

  it("gives every meta tab its own path", () => {
    expect(hrefForTabId(PULSE_TAB_ID, LIST)).toBe("/pulse");
    expect(hrefForTabId(LAB_TAB_ID, LIST)).toBe("/lab");
    expect(hrefForTabId(COMPOUND_TAB_ID, LIST)).toBe("/growth");
    expect(hrefForTabId(ALERTS_TAB_ID, LIST)).toBe("/alerts");
  });

  it("names a portfolio by its slug", () => {
    expect(hrefForTabId("aaa", LIST)).toBe("/portfolio/aasad");
  });

  it("falls back to the id when a portfolio has no slug", () => {
    const list = [sheet({ id: "ccc", name: "No slug", slug: undefined })];
    expect(hrefForTabId("ccc", list)).toBe("/portfolio/ccc");
  });

  it("asks for holdings with no portfolio named", () => {
    expect(hrefForTabId(PORTFOLIO_TAB_PENDING, LIST)).toBe("/portfolio");
  });

  it("escapes a token that would otherwise break the path", () => {
    const list = [sheet({ id: "ddd", slug: "a/b c" })];
    expect(hrefForTabId("ddd", list)).toBe("/portfolio/a%2Fb%20c");
  });
});

describe("tabIdFromPath", () => {
  it("reads every meta path back", () => {
    expect(tabIdFromPath("/", LIST)).toBe(OVERVIEW_TAB_ID);
    expect(tabIdFromPath("/pulse", LIST)).toBe(PULSE_TAB_ID);
    expect(tabIdFromPath("/lab", LIST)).toBe(LAB_TAB_ID);
    expect(tabIdFromPath("/growth", LIST)).toBe(COMPOUND_TAB_ID);
    expect(tabIdFromPath("/alerts", LIST)).toBe(ALERTS_TAB_ID);
  });

  it("round-trips every tab id through its own href", () => {
    for (const id of [
      OVERVIEW_TAB_ID,
      PULSE_TAB_ID,
      LAB_TAB_ID,
      COMPOUND_TAB_ID,
      ALERTS_TAB_ID,
      "aaa",
      "bbb",
    ]) {
      expect(tabIdFromPath(hrefForTabId(id, LIST), LIST)).toBe(id);
    }
  });

  it("resolves a slug, an id, and a name", () => {
    expect(tabIdFromPath("/portfolio/aasad", LIST)).toBe("aaa");
    expect(tabIdFromPath("/portfolio/bbb", LIST)).toBe("bbb");
    expect(tabIdFromPath("/portfolio/retirement", LIST)).toBe("bbb");
  });

  it("ignores case and a trailing slash", () => {
    expect(tabIdFromPath("/portfolio/AASAD/", LIST)).toBe("aaa");
    expect(tabIdFromPath("/pulse/", LIST)).toBe(PULSE_TAB_ID);
  });

  it("keeps a deep-linked slug alive while the book is still loading", () => {
    // A cold cache has no list to answer with. Refusing here is what used
    // to drop somebody's bookmark onto Overview.
    expect(tabIdFromPath("/portfolio/aasad", [])).toBe("aasad");
  });

  it("says it cannot answer for a portfolio this account lacks", () => {
    expect(tabIdFromPath("/portfolio/qwerty", LIST)).toBeUndefined();
  });

  it("answers bare /portfolio with the last portfolio or the sentinel", () => {
    // No memory written in this environment, so it falls to the sentinel,
    // which is a real room id and keeps the Holdings cell lit.
    expect(tabIdFromPath("/portfolio", [])).toBe(PORTFOLIO_TAB_PENDING);
  });

  it("leaves paths outside the book alone", () => {
    expect(tabIdFromPath("/communities", LIST)).toBeNull();
    expect(tabIdFromPath("/account", LIST)).toBeNull();
    expect(tabIdFromPath("/upside-portfolio", LIST)).toBeNull();
  });
});

describe("workspaceRoomId and the new book paths", () => {
  it("keeps every book page in one room", () => {
    for (const path of [
      "/",
      "/pulse",
      "/lab",
      "/growth",
      "/alerts",
      "/portfolio",
      "/portfolio/aasad",
    ]) {
      expect(workspaceRoomId(path), path).toBe("book");
    }
  });

  it("does not let /portfolio swallow the Fund", () => {
    // `/upside-portfolio` ends in the same word. A prefix test loose
    // enough to claim it would move the Fund into the book silently.
    expect(workspaceRoomId("/upside-portfolio")).toBe("fund");
    expect(workspaceRoomId("/upside-portfolio/x")).toBe("fund");
  });
});
