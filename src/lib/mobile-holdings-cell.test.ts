/**
 * The phone's route to a holdings table.
 *
 * There was not one. `BookModeDock` draws a cell per portfolio on a laptop,
 * so holdings are one click there; below `md` the bar carried the app
 * sections only, and the table sat behind either the picker in the header
 * title, which reads as a heading rather than a control, or a scroll to the
 * bottom of Today. The Holdings cell is that route, and these are the three
 * things it is made of, each of which lives in a different file and none of
 * which is obvious from the others.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  LAST_PORTFOLIO_KEY,
  pickChatPortfolio,
  resolveLastPortfolioId,
  saveLastPortfolioId,
  sheetMatchesActive,
} from "@/lib/active-sheet";

const BAR = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");
const TAB = readFileSync("src/lib/mobile-tab.ts", "utf8");
const DASHBOARD = readFileSync("src/components/Dashboard.tsx", "utf8");
const TAB_URL = readFileSync("src/lib/dashboard-tab.ts", "utf8");

/** A localStorage the node test environment does not otherwise have. */
function withStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const g = globalThis as Record<string, unknown>;
  g.window = {
    localStorage: storage,
    dispatchEvent: () => true,
  };
  g.localStorage = storage;
  g.Event = class {
    constructor(public type: string) {}
  };
  return store;
}

function clearStorage() {
  const g = globalThis as Record<string, unknown>;
  delete g.window;
  delete g.localStorage;
  delete g.Event;
}

afterEach(clearStorage);

describe("the Holdings cell exists", () => {
  it("is a cell on the phone dock", () => {
    expect(BAR).toMatch(/id: "holdings"/);
    expect(BAR).toMatch(/shortLabel: "Holdings"/);
  });

  it("is not hidden by any experience tier", () => {
    /*
     * `metaId` is what the tier filter matches on, and holdings are not a
     * meta-tab: a reader who is shown no Lab and no Pulse still owns things.
     * A tier that hid this cell would leave that person with no route to
     * their own table at all, which is the bug this cell was added to fix.
     */
    const cell = BAR.slice(BAR.indexOf('id: "holdings"'));
    expect(cell.slice(0, cell.indexOf("},"))).toMatch(/metaId: null/);
  });

  it("carries no portfolio token in its href", () => {
    /*
     * The dock draws on Account, Circle and Admin, which never load a book,
     * so it cannot name a portfolio and must not try. Naming one would also
     * mean shipping a remembered id the dock has no way to check against the
     * portfolios the account still has.
     */
    const cell = BAR.slice(BAR.indexOf('id: "holdings"'));
    const href = cell.slice(0, cell.indexOf("},")).match(/href: "([^"]*)"/);
    expect(href?.[1]).toBe("/?tab=portfolio");
  });
});

describe("the URL answers for it", () => {
  it("resolves a bare ?tab=portfolio instead of falling to Overview", () => {
    /*
     * Falling through to `return null` sends the caller to Overview, which
     * is the room this cell exists to get out of. The matching rules live
     * in dashboard-tab.ts so they can run in tests without `window`.
     */
    expect(TAB_URL).toMatch(/tabParam === "portfolio" \|\| tabParam === "book"/);
    expect(TAB_URL).toMatch(
      /resolveLastPortfolioId\(list\) \?\? PORTFOLIO_TAB_PENDING/
    );
  });

  it("survives arriving before the book does", () => {
    /*
     * A cold cache -- a first visit in this browser, or the first one after
     * a sign-out -- has no portfolios at mount, so `?tab=portfolio` cannot be
     * answered then. The URL effect strips the query moments later, so
     * without a note nothing is left to say what was asked for and the reader
     * is quietly left on Overview. `PORTFOLIO_TAB_PENDING` is that note, and
     * it has to be distinct from `null`, which means the URL asked for
     * nothing at all.
     */
    expect(DASHBOARD).toMatch(/PORTFOLIO_TAB_PENDING/);
    expect(TAB_URL).toMatch(
      /resolveLastPortfolioId\(list\) \?\? PORTFOLIO_TAB_PENDING/
    );
    expect(DASHBOARD).toMatch(/wantsHoldingsRef\.current = true/);
    /* And spent by the first pick that has a book to answer with. */
    const pick = DASHBOARD.slice(DASHBOARD.indexOf("const pickInitialSheet"));
    expect(pick.slice(0, 900)).toMatch(/wantsHoldingsRef\.current/);
  });

  it("never leaves the sentinel where a portfolio id belongs", () => {
    /*
     * Every read of the raw resolver has to go through `takeSheetIdFromUrl`,
     * which is what turns the sentinel back into a real answer. One that does
     * not would set the active tab to a string no portfolio matches, and the
     * reader would get an empty room rather than their holdings.
     */
    const raw = DASHBOARD.match(/resolveSheetIdFromUrl\(/g) ?? [];
    /* The single call inside `takeSheetIdFromUrl`. The helper itself lives
     * in dashboard-tab.ts. */
    expect(raw.length).toBe(1);
  });

  it("marks the cell as the room you are in", () => {
    expect(TAB).toMatch(
      /tab === "portfolio" \|\| tab === "book" \|\| tab === "forecast"/
    );
    expect(DASHBOARD).toMatch(/mobileTabFromActiveId\(activeId\)/);
  });

  it("lights the cell from the room id, not from whether the table has rows", () => {
    /*
     * The marker used to vanish on an empty holdings table because the
     * pill was measured off aria-current, or because a book load in the
     * same tick sent the tap back to Overview. The room is Holdings
     * either way.
     */
    expect(BAR).toMatch(/data-on=\{on \? "" : undefined\}/);
    expect(readFileSync("src/lib/use-dock-marker.ts", "utf8")).toMatch(
      /querySelector<HTMLElement>\("\[data-on\]"\)/
    );
    expect(BAR).toMatch(/useDockMarker\(\)/);
    expect(readFileSync("src/components/BookModeDock.tsx", "utf8")).toMatch(
      /useDockMarker\(\)/
    );
    expect(DASHBOARD).toMatch(/wantsHoldingsRef\.current = true/);
    expect(DASHBOARD).toMatch(
      /setActiveId\(target \?\? PORTFOLIO_TAB_PENDING\)/
    );
  });
});

describe("which portfolio it opens", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("opens the one you were last in", () => {
    withStorage({ [LAST_PORTFOLIO_KEY]: "b" });
    expect(resolveLastPortfolioId(list)).toBe("b");
  });

  it("opens your first when nothing is remembered", () => {
    withStorage();
    expect(resolveLastPortfolioId(list)).toBe("a");
  });

  it("opens your first when the remembered one was deleted", () => {
    /*
     * The failure this prevents: delete the portfolio you were last in and
     * the cell points at an id nothing matches, so the resolver answers with
     * nothing and the reader is bounced back to Overview by the one control
     * whose job is leaving it.
     */
    withStorage({ [LAST_PORTFOLIO_KEY]: "gone" });
    expect(resolveLastPortfolioId(list)).toBe("a");
  });

  it("answers nothing when there are no portfolios", () => {
    withStorage({ [LAST_PORTFOLIO_KEY]: "b" });
    expect(resolveLastPortfolioId([])).toBeNull();
  });

  it("lets Margus use the open tab, else the last-opened one", () => {
    const a = { id: "a" };
    const b = { id: "b" };
    withStorage({ [LAST_PORTFOLIO_KEY]: "b" });
    expect(pickChatPortfolio([a, b], a)).toEqual(a);
    expect(pickChatPortfolio([a, b], null)).toEqual(b);
    expect(pickChatPortfolio([], null)).toBeNull();
    expect(DASHBOARD).toMatch(
      /pickChatPortfolio\(portfolios, activePortfolio\)/
    );
  });

  it("matches a dock cell by id or slug", () => {
    const sheet = { id: "uuid-1", slug: "aasad" };
    expect(sheetMatchesActive(sheet, "uuid-1")).toBe(true);
    expect(sheetMatchesActive(sheet, "aasad")).toBe(true);
    expect(sheetMatchesActive(sheet, "Aasad")).toBe(true);
    expect(sheetMatchesActive(sheet, "other")).toBe(false);
    expect(sheetMatchesActive(sheet, null)).toBe(false);
  });

  it("remembers a portfolio, never a meta-tab", () => {
    /*
     * `saveActiveSheetId` stores whichever tab you were on, `__overview__`
     * included, which is why this is a second key rather than a read of that
     * one. The Dashboard must only ever write a real portfolio into it.
     */
    const store = withStorage();
    saveLastPortfolioId("b");
    expect(store.get(LAST_PORTFOLIO_KEY)).toBe("b");
    expect(DASHBOARD).toMatch(
      /if \(activePortfolio\) saveLastPortfolioId\(activePortfolio\.id\)/
    );
  });
});
