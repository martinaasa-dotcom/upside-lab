import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { BandMap } from "@/components/company/BandMap";
import { buildPlanLadder, isActionableBand } from "@/lib/company/plan-ladder";

/*
  RENDER THE REAL PICTURE AND READ WHAT COMES OUT.

  Two things this file exists to catch, both invisible to reading the
  markup: that the actionable-zone accent (the same left edge
  `PlanLadderTable` marks its current row with) actually lands on the
  DOM node for a zone `isActionableBand` calls decisive and nowhere
  else, and that the "Band" -> "Zone" rename reaches every sentence a
  reader meets on this panel rather than the few call sites a
  string-search happened to catch.
*/

function ladderFor(ticker: string, spot: number) {
  return buildPlanLadder({
    ticker,
    anchor: 100,
    anchorKind: "estimate",
    anchorSaid: "test anchor",
    spot,
    high: 120,
    low: 80,
    windowSaid: "the last year",
  });
}

describe("BandMap render", () => {
  const holdAt100 = ladderFor("AAA", 100);
  const farBelowAt40 = ladderFor("BBB", 40);
  if (!holdAt100 || !farBelowAt40) throw new Error("test ladders did not build");

  // Sanity on the fixture: one lands in the ordinary, non-actionable
  // middle and the other reaches a decisive end. If this stops being
  // true the fixture needs adjusting, not the assertions below.
  it("fixture sanity: one ladder is actionable and one is not", () => {
    expect(isActionableBand(holdAt100.atId)).toBe(false);
    expect(isActionableBand(farBelowAt40.atId)).toBe(true);
  });

  const html = renderToStaticMarkup(
    createElement(BandMap, {
      rows: [
        { ticker: "AAA", ladder: holdAt100, value: 1000, roiPct: 0.1 },
        { ticker: "BBB", ladder: farBelowAt40, value: 1000, roiPct: -0.4 },
      ],
    })
  );

  it("titles the panel Price Zones", () => {
    expect(html).toContain("Price Zones");
  });

  it("never says the retired word to a reader", () => {
    // `data-band-row` and `data-band-chip` are internal DOM hooks, kept
    // on purpose (the identifiers stay; the wording changed). Strip
    // those two attribute names and nothing spelling "band" should be
    // left anywhere in the markup, reader text and every `title` and
    // `aria-label` alike.
    const visible = html
      .replace(/data-band-row=""/g, "")
      .replace(/data-band-chip=""/g, "");
    expect(visible).not.toMatch(/\bBand\b/);
    expect(visible).not.toMatch(/\bband\b/);
  });

  it("marks the actionable zone's row with the accent, and the ordinary one without it", () => {
    const rows = html.split('data-band-row=""').slice(1);
    const actionableRow = rows.find((r) => r.includes("A long way below"));
    const ordinaryRow = rows.find((r) => r.includes("Close to fair value"));
    expect(actionableRow).toBeDefined();
    expect(ordinaryRow).toBeDefined();
    expect(actionableRow).toMatch(/border-l-primary\/60/);
    expect(ordinaryRow).not.toMatch(/border-l-primary\/60/);
    expect(ordinaryRow).toMatch(/border-l-transparent/);
  });

  it("stays band-free on the circle's pooled voice too, not just the reader's own", () => {
    // The pooled subtitle is a different string from the own-portfolio
    // one (`CircleHome`'s picture), so it needs its own check rather
    // than trusting the one above to cover both branches.
    const pooledHtml = renderToStaticMarkup(
      createElement(BandMap, {
        rows: [
          { ticker: "AAA", ladder: holdAt100, value: 1000, roiPct: null },
          { ticker: "BBB", ladder: farBelowAt40, value: 1000, roiPct: null },
        ],
        pooled: true,
      })
    );
    const visible = pooledHtml
      .replace(/data-band-row=""/g, "")
      .replace(/data-band-chip=""/g, "");
    expect(visible).toContain("Price Zones");
    expect(visible).not.toMatch(/\bBand\b/);
    expect(visible).not.toMatch(/\bband\b/);
  });
});
