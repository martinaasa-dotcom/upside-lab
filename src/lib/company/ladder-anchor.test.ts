import { describe, expect, it } from "vitest";
import { anchorForHolding } from "@/lib/company/ladder-anchor";

/**
 * ONE COMPANY, ONE ANCHOR, AND OWNING IT CHANGES NOTHING.
 *
 * The shared reading (`loadCompanyAnchors`, the blended twelve-month
 * estimate every reader and every room gets) is the anchor, and the
 * trading range this browser can see is the last resort for a name the
 * feed could not answer about at all. The order is the feature: a
 * holding anchored on anything private to one browser is a holding that
 * reads one way on its own page and another in a circle, which is the
 * fault this file was rewritten to end.
 */
describe("anchorForHolding", () => {
  const estimate = {
    price: 200,
    kind: "estimate" as const,
    said: "$200.00, the blended estimate.",
  };

  it("takes the shared company reading over anything local", () => {
    const anchor = anchorForHolding({ estimate, rangeMid: 175 });
    expect(anchor?.price).toBe(200);
    expect(anchor?.kind).toBe("estimate");
    expect(anchor?.said).toBe(estimate.said);
  });

  it("carries a history reading through as history", () => {
    const anchor = anchorForHolding({
      estimate: { price: 90, kind: "history", said: "the feed's own year." },
      rangeMid: 175,
    });
    expect(anchor?.price).toBe(90);
    expect(anchor?.kind).toBe("history");
  });

  it("falls back to the range this browser can see with no shared reading", () => {
    const anchor = anchorForHolding({ estimate: null, rangeMid: 175 });
    expect(anchor?.price).toBe(175);
    expect(anchor?.kind).toBe("history");
    expect(anchor?.said).toContain("the last few months");
  });

  it("ignores a shared reading that is not a real price", () => {
    const anchor = anchorForHolding({
      estimate: { price: 0, kind: "estimate", said: "nothing" },
      rangeMid: 175,
    });
    expect(anchor?.kind).toBe("history");
    expect(anchor?.price).toBe(175);
  });

  it("refuses a ladder outright rather than centring one on the price", () => {
    expect(anchorForHolding({ estimate: null, rangeMid: null })).toBeNull();
  });
});
