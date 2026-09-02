import { describe, expect, it } from "vitest";
import { shareCount, shareDigits, sharesLabel } from "@/lib/share-count";

describe("share counts", () => {
  it("keeps a whole number whole", () => {
    expect(shareDigits(12)).toBe(0);
    expect(shareCount(12)).toBe("12");
    expect(shareCount(1500)).toBe("1,500");
  });

  it("shows a fraction rather than rounding it to nothing", () => {
    // The bug this file exists for: 0.12 of a coin printed as "0".
    expect(shareCount(0.12)).toBe("0.12");
    expect(shareCount(2.5)).toBe("2.5");
    expect(shareCount(0.0001)).toBe("0.0001");
  });

  it("trims the zeros nobody typed", () => {
    expect(shareDigits(0.1)).toBe(1);
    expect(shareCount(0.1)).toBe("0.1");
    expect(shareCount(3.4000000001)).toBe("3.4");
  });

  it("stops at four decimals, which is what can be saved", () => {
    expect(shareDigits(0.123456)).toBe(4);
    expect(shareCount(0.123456)).toBe("0.1235");
  });

  it("is honest about a count it cannot read", () => {
    expect(shareCount(Number.NaN)).toBe("0");
  });

  it("says share once and shares the rest of the time", () => {
    expect(sharesLabel(1)).toBe("1 share");
    expect(sharesLabel(12)).toBe("12 shares");
    expect(sharesLabel(0.5)).toBe("0.5 shares");
    expect(sharesLabel(2, "coin")).toBe("2 coins");
  });
});
