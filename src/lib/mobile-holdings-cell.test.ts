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
const DASHBOARD = readFileSync("src/components/Dashboard.tsx", "utf8");
const ROUTES = readFileSync("src/lib/book-routes.ts", "utf8");

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
    expect(cell.slice(0, cell.indexOf("},"))).toMatch(/href: PORTFOLIO_PATH/);
    expect(ROUTES).toMatch(/PORTFOLIO_PATH = "\/portfolio"/);
  });
});

describe("the URL answers for it", () => {
  it("resolves a bare /portfolio instead of falling to Overview", () => {
    /*
     * Falling through to Overview is the room this cell exists to get out
     * of. The matching rules live in book-routes.ts so they can run in
     * tests without `window`; `book-routes.test.ts` runs them.
     */
    expect(ROUTES).toMatch(
      /resolveLastPortfolioId\(portfolios\) \?\? PORTFOLIO_TAB_PENDING/
    );
  });

  it("survives arriving before the book does", () => {
    /*
     * A cold cache -- a first visit in this browser, or the first one after
     * a sign-out -- has no portfolios at mount, so `/portfolio` cannot be
     * answered then. `PORTFOLIO_TAB_PENDING` is what is shown meanwhile,
     * and it has to be distinct from `null`, which means nothing was asked
     * for at all.
     *
     * What used to be needed here and is not any more: a ref carrying the
     * unanswered question forward, because the URL effect stripped the
     * query moments later and nothing was left to say what was asked for.
     * The path is not stripped, so the answer is simply recomputed against
     * the list the moment it lands.
     */
    expect(DASHBOARD).toMatch(/PORTFOLIO_TAB_PENDING/);
    expect(DASHBOARD).toMatch(/tabIdFromPath\(pathname, portfolios\)/);
    expect(ROUTES).toMatch(
      /resolveLastPortfolioId\(portfolios\) \?\? PORTFOLIO_TAB_PENDING/
    );
  });

  it("reads the room from the path in exactly one place", () => {
    /*
     * Two readers of the URL is how the dock and the page came to disagree
     * about which room was open. `tabIdFromPath` is the only one, and the
     * tab it answers with is what both the panel and the dock marker use.
     */
    const raw = DASHBOARD.match(/tabIdFromPath\(/g) ?? [];
    expect(raw.length).toBe(1);
  });

  it("marks the cell as the room you are in", () => {
    /*
     * From the tab id the path resolved to, and nothing else. A second
     * reader that took `?tab=` off the URL used to sit beside this one;
     * the proxy retires that query before any page sees it, so it read
     * nothing and it is gone.
     */
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
    expect(BAR).toMatch(/useDockMarker\("phone"\)/);
    // Both docks read `data-on` through the same hook; they differ only in
    // how far and how long they move, which is the variant they ask for.
    expect(readFileSync("src/components/BookModeDock.tsx", "utf8")).toMatch(
      /useDockMarker\("wide"\)/
    );
    expect(DASHBOARD).toMatch(/mobileTabFromActiveId\(activeId\)/);
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
