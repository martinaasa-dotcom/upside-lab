import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { BandMap } from "@/components/company/BandMap";
import { buildPlanLadder } from "@/lib/company/plan-ladder";

/*
  RENDER THE REAL PICTURE AND READ WHAT COMES OUT.

  What this file exists to catch: that the "Band" -> "Zone" rename
  reaches every sentence a reader meets on this panel rather than the
  few call sites a string-search happened to catch.

  It used to also pin a left-edge accent on `ACTIONABLE_BANDS` rows.
  That accent was removed (2026-09-15): asked to widen it to every band
  but "hold", the honest answer was that it would then mean nothing
  more than "not the middle band", which the zone banner grouping
  (Above/Around/Below fair value) already says. No accent, on any row.
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

  const html = renderToStaticMarkup(
    createElement(BandMap, {
      rows: [
        { ticker: "AAA", ladder: holdAt100, value: 1000, roiPct: 0.1 },
        { ticker: "BBB", ladder: farBelowAt40, value: 1000, roiPct: -0.4 },
      ],
    })
  );

  it("titles the panel Fair value zones", () => {
    expect(html).toContain("Fair value zones");
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

  it("draws no left-edge accent on any zone row", () => {
    const rows = html.split('data-band-row=""').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toMatch(/border-l-primary\/60/);
      expect(row).not.toMatch(/border-l-transparent/);
    }
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
    expect(visible).toContain("Fair value zones");
    expect(visible).not.toMatch(/\bBand\b/);
    expect(visible).not.toMatch(/\bband\b/);
  });
});
