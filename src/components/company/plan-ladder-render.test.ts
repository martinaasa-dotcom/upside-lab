import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { PlanLadderPanel } from "@/components/company/PlanLadder";
import { buildPlanLadder } from "@/lib/company/plan-ladder";

/*
  RENDER THE REAL LADDER PANEL, THE ONE "PRICE ZONES" IS MEANT TO MATCH.

  This is the panel `BandMap`'s new accent was copied from, so a check
  that it still says "Zone" (its own column header, and its own foot
  sentence when the ladder is tightened) is the other half of the same
  rename -- a string search catches call sites, not what a rendered
  page actually contains.
*/

describe("PlanLadderPanel render", () => {
  it("heads its column Zone, not Band", () => {
    const ladder = buildPlanLadder({
      ticker: "AAA",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "test anchor",
      spot: 100,
      high: 120,
      low: 80,
      windowSaid: "the last year",
    });
    if (!ladder) throw new Error("test ladder did not build");
    const html = renderToStaticMarkup(
      createElement(PlanLadderPanel, { ticker: "AAA", ladder })
    );
    expect(html).toContain(">Zone<");
    expect(html).not.toMatch(/>Band</);
  });

  it("says zone, not band, in the tightened-ladder foot sentence", () => {
    // Far enough under the anchor to trip the tightened, far-below
    // regime `PlanLadderFoot` has its own sentence for.
    const ladder = buildPlanLadder({
      ticker: "BBB",
      anchor: 100,
      anchorKind: "estimate",
      anchorSaid: "test anchor",
      spot: 30,
      high: 120,
      low: 80,
      windowSaid: "the last year",
    });
    if (!ladder) throw new Error("test ladder did not build");
    expect(ladder.farBelow).toBe(true);
    const html = renderToStaticMarkup(
      createElement(PlanLadderPanel, { ticker: "BBB", ladder })
    );
    expect(html).toContain("one zone rather than five");
    expect(html).not.toMatch(/\bband\b/);
    expect(html).not.toMatch(/\bBand\b/);
  });
});
