import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { holdingLadders } from "@/lib/company/holding-ladders";
import type { CompanyAnchors } from "@/lib/company/company-anchor-types";

/**
 * A COMPANY IS WORTH WHAT IT IS WORTH, ON EVERY SCREEN THAT DRAWS IT.
 *
 * The ladder is its anchor times a set of multiples, so the anchor is
 * the whole claim. This app used to answer it three ways for one
 * company: the blended estimate on a research page, that holding's own
 * end-of-year forecast target on the holdings map, and the middle of the
 * trading range in a circle, which has no member's targets to read. A
 * reader saw NBIS in "a long way below" on their own page and "close to
 * fair value" in their circle on the same afternoon, and the two
 * pictures they were meant to compare could not be compared.
 *
 * What fixed it is one shared reading (`loadCompanyAnchors`) handed to
 * one builder. These are the two halves of that: every caller asks for
 * it, and two callers who have the same reading and different price
 * history still draw the same ladder.
 */
describe("one anchor per company", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  const CALLERS = [
    "src/components/Dashboard.tsx",
    "src/components/CommunityView.tsx",
  ];

  it("every ladder is built from the shared reading", () => {
    for (const file of CALLERS) {
      const src = read(file);
      const calls = [...src.matchAll(/holdingLadders\(\{[\s\S]*?\n {4}\}\)/g)];
      expect(calls.length, `${file}: builds at least one ladder`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(
          call[0],
          `${file}: a ladder built without the shared company reading is a ladder only this browser agrees with`
        ).toMatch(/anchors:/);
        /*
          An end-of-year target is a claim about where the price is
          going, this app writes one for every holding whether or not
          anybody chose it, and it lives in one browser's storage. It
          anchored these ladders once and must not again.
        */
        expect(
          call[0],
          `${file}: end-of-year targets do not anchor a price ladder`
        ).not.toMatch(/\b(house)?[Oo]verrides:/);
      }
    }
  });

  it("the research room draws one ladder, not one per owner", () => {
    const src = read("src/components/company/StockRoom.tsx");
    expect(
      src,
      "StockRoom: a reader who owns the share gets the same anchor as one who does not"
    ).not.toMatch(/anchorForHolding/);
  });

  it("two rooms with different price history still draw the same ladder", () => {
    // The circle and the holdings page hold different windows of the same
    // name: this is the shape that used to put one company in two bands.
    const ninety = Array.from({ length: 90 }, (_, i) => 100 + (50 * i) / 89);
    const fifteen = ninety.slice(-15);
    const spot = ninety[ninety.length - 1];
    const anchors: CompanyAnchors = {
      TEST: {
        price: 120,
        kind: "estimate",
        said: "$120.00, the blended estimate.",
        high: 150,
        low: 100,
      },
    };
    const bandFor = (closes: number[]) =>
      holdingLadders({
        anchors,
        rows: [{ ticker: "TEST", spot, closes, value: 1000 }],
      })[0].ladder;

    const book = bandFor(ninety);
    const circle = bandFor(fifteen);
    expect(book?.anchor).toBe(120);
    expect(circle?.anchor).toBe(120);
    expect(circle?.atId).toBe(book?.atId);
    expect(circle?.step).toBe(book?.step);
  });

  it("a name the feed could not answer about still gets its old ladder", () => {
    const ninety = Array.from({ length: 90 }, (_, i) => 100 + (50 * i) / 89);
    const spot = ninety[ninety.length - 1];
    const row = holdingLadders({
      anchors: {},
      rows: [{ ticker: "TEST", spot, closes: ninety, value: 1000 }],
    })[0];
    expect(row.ladder?.anchor).toBeCloseTo(125, 5);
    expect(row.ladder?.anchorKind).toBe("history");
  });
});
