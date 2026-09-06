import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIVATE_NOINDEX_PATHS } from "@/lib/seo-routes";
import { workspaceRoomId } from "@/lib/workspace-paths";
import { companyHref, companyTickerFromPath } from "@/lib/company/client";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a company is a room of its own", () => {
  it("gives every company its own keep-alive pane", () => {
    /*
      A shared "stock" id would show the reader the company they were last
      looking at while the new one loaded, which is worse than a spinner
      because it is wrong rather than empty.
    */
    expect(workspaceRoomId("/stock/NVDA")).toBe("stock:NVDA");
    expect(workspaceRoomId("/stock/nvda")).toBe("stock:NVDA");
    expect(workspaceRoomId("/stock/AAPL")).not.toBe(workspaceRoomId("/stock/NVDA"));
  });

  it("is not swallowed by any other room's prefix test", () => {
    expect(workspaceRoomId("/portfolio/growth")).toBe("book");
    expect(workspaceRoomId("/upside-portfolio")).toBe("fund");
    expect(workspaceRoomId("/stock")).toBeNull();
  });

  it("round-trips a ticker through its own href", () => {
    expect(companyTickerFromPath(companyHref("brk.b"))).toBe("BRK.B");
    expect(companyTickerFromPath("/stock/NVDA?x=1")).toBe("NVDA");
    expect(companyTickerFromPath("/pulse")).toBeNull();
  });

  it("caps how many company panes stay mounted", () => {
    const shell = read("src/components/WorkspaceShell.tsx");
    expect(shell).toMatch(/pruneStockRooms/);
    expect(shell).toMatch(/MAX_STOCK_ROOMS/);
  });

  it("is never indexed, because it is behind the sign-in gate", () => {
    expect(PRIVATE_NOINDEX_PATHS as readonly string[]).toContain("/stock");
  });
});

describe("the room keeps its promises in the markup", () => {
  const room = read("src/components/company/StockRoom.tsx");

  it("puts a provenance mark on every block a model or a feed touched", () => {
    for (const panel of [
      "CompanyNumbers",
      "ValueGlance",
      "CompanyCases",
      "CompanyPath",
      "PositionFitCard",
    ]) {
      expect(room).toContain(panel);
    }
    for (const file of [
      "src/components/company/CompanyNumbers.tsx",
      "src/components/company/ValueGlance.tsx",
      "src/components/company/CompanyCases.tsx",
      "src/components/company/CompanyPath.tsx",
      "src/components/company/PositionFitCard.tsx",
    ]) {
      expect(read(file), file).toMatch(/<WhyThis/);
    }
  });

  it("always ends on the links out", () => {
    // The section that makes the rest of the page safe to read. A page
    // that states things a reader cannot check is the thing this room
    // exists to replace.
    expect(room).toContain("CompanySources");
  });

  it("never prints a verdict word anywhere a reader sees one", () => {
    const VERDICT =
      /\b(undervalued|overvalued|a bargain|strong buy|you should buy|you should sell)\b/i;
    for (const file of [
      "src/components/company/StockRoom.tsx",
      "src/components/company/CompanyNumbers.tsx",
      "src/components/company/ValueGlance.tsx",
      "src/components/company/CompanyCases.tsx",
      "src/components/company/PositionFitCard.tsx",
      "src/lib/company/readings.ts",
      "src/lib/company/fair-value.ts",
      "src/lib/company/position-fit.ts",
    ]) {
      expect(read(file), file).not.toMatch(VERDICT);
    }
  });

  it("never works out a share of a portfolio it has not read", () => {
    /*
      The failure this names is the worst one this room could ship. A
      reader arriving from a link, in a browser with no portfolio cached,
      has every share worked out against a total of zero, and the card
      announces that this company would be a hundred per cent of
      everything they own. `hasBook` is what tells an account with nothing
      in it, which is a real answer, from a browser that has not looked,
      which is not.
    */
    expect(room).toMatch(/hasBook/);
    expect(room).toMatch(/book\.ready && book\.hasBook/);
  });

  it("labels the fit card in the reader's money, not the listing's", () => {
    // A company quoted in euros inside a portfolio kept in dollars would
    // otherwise have every figure on that card labelled with the wrong
    // currency, on numbers somebody is about to act on.
    expect(room).toMatch(/code="USD"/);
  });

  it("says out loud that none of it is advice", () => {
    // JSX wraps prose across lines, so the sentence is matched on the
    // squashed text rather than on the source's own line breaks.
    const prose = room.toLowerCase().replace(/\s+/g, " ");
    expect(prose).toContain("none of this is a recommendation");
    expect(prose).toContain("not an adviser");
  });
});

describe("the route refuses what it cannot vouch for", () => {
  const route = read("src/app/api/company/[ticker]/route.ts");

  it("checks the ticker before anything is fetched or written", () => {
    // The one caller-supplied value that reaches this route. A row written
    // under a symbol the market does not list is a page nobody can check.
    expect(route).toMatch(/isQuotableTicker/);
    const guard = route.indexOf("isQuotableTicker");
    expect(guard).toBeLessThan(route.indexOf("fetchCompanyFacts(ticker)"));
  });

  it("returns the figures even when the written half fails", () => {
    expect(route).toMatch(/brief: null/);
  });

  it("anchors the shared row on the server's own price", () => {
    expect(route).toMatch(/anchorPrice: facts\.price/);
  });

  it("shares one reasoned path with the Growth room", () => {
    expect(route).toMatch(/persistServerTickerCache/);
  });

  it("puts no floor under the path it stores", () => {
    /*
      The forecast floor was the worst bug this product has had: a falling
      path reached the reader as a rise. Nothing in this route may lift,
      floor or bound a price the model wrote.
    */
    expect(route).not.toMatch(/liftPathToThemeMagnitude|Math\.max\(.*spot/);
  });
});


/**
 * THREE FAULTS FOUND BY RENDERING THE ROOM AND MEASURING IT.
 *
 * Each was invisible to reasoning about the markup and obvious in one
 * screenshot, which is the lesson worth keeping more than the fixes:
 * render the component with the app's own CSS, at more than one width,
 * and measure.
 *
 * Read as source rather than rendered, because this suite runs in node and
 * there is no jsdom in the repo.
 */
describe("the research room, measured", () => {
  const cases = read("src/components/company/CompanyCases.tsx");
  const sources = read("src/components/company/CompanySources.tsx");
  const glance = read("src/components/company/ValueGlance.tsx");

  it("does not stretch one case card to the other's height", () => {
    /*
      A grid stretches its children. Measured on a company with three
      points for and two against, the right card was 399px tall with its
      content ending at 264: a third of a bordered card blank, which reads
      as content that failed to arrive.
    */
    expect(cases).toMatch(/grid items-start gap-4 md:grid-cols-2/);
  });

  it("never leaves a source card alone in a row with a hole beside it", () => {
    // Three to six sources depending on the company, so an odd count is
    // the ordinary case rather than the edge one.
    expect(sources).toMatch(/sources\.length % 2 === 1/);
    expect(sources).toMatch(/last-child\]:sm:col-span-2/);
  });

  it("prints one kind of date in the article list", () => {
    /*
      `formatRelativeTime` turns absolute after a week, so the list read
      "3d ago" over "Aug 28" over "Aug 21" and could not be ordered by eye,
      which is the one thing a date in this list is for.
    */
    // The name still appears in the comment saying why it is not called.
    expect(sources).not.toMatch(/formatRelativeTime\(/);
    expect(sources).toMatch(/function articleDate/);
  });

  it("does not strand a separator at the end of a wrapped line", () => {
    // At 390px the method's metadata row wrapped as "Arithmetic on the
    // accounts ·" with the dot alone at the end of the line.
    expect(glance).toMatch(/&middot;/);
    expect(glance).toMatch(/aria-hidden className="hidden sm:inline"/);
  });
});
