import { describe, expect, it } from "vitest";
import { anchorForHolding } from "@/lib/company/ladder-anchor";

/**
 * The order of these branches is the whole feature: the reader's own
 * target always wins, the house account's own target is read only where
 * the reader has none, and the plain trading-range default is the last
 * resort. `holding-ladders.ts` passes `houseTarget` regardless of
 * `targetIsYours`, so this is what actually keeps the reader's own figure
 * from ever being outranked.
 */
describe("anchorForHolding", () => {
  it("keeps the reader's own target over a house one", () => {
    const anchor = anchorForHolding({
      target: 200,
      targetIsYours: true,
      houseTarget: 150,
      rangeMid: 175,
    });
    expect(anchor?.price).toBe(200);
    expect(anchor?.kind).toBe("target");
  });

  it("falls back to the house account's own target when the reader has none", () => {
    const anchor = anchorForHolding({
      target: null,
      targetIsYours: false,
      houseTarget: 150,
      rangeMid: 175,
    });
    expect(anchor?.price).toBe(150);
    expect(anchor?.kind).toBe("house");
    expect(anchor?.said).toContain("this app's own account");
  });

  it("falls back further, to the trading range, with no house target either", () => {
    const anchor = anchorForHolding({
      target: null,
      targetIsYours: false,
      houseTarget: null,
      rangeMid: 175,
    });
    expect(anchor?.price).toBe(175);
    expect(anchor?.kind).toBe("history");
  });

  it("ignores a house target that is not a real price", () => {
    const anchor = anchorForHolding({
      target: null,
      targetIsYours: false,
      houseTarget: 0,
      rangeMid: 175,
    });
    expect(anchor?.kind).toBe("history");
  });
});
