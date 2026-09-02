/**
 * The two numbers a holding carries that are neither money nor shares. Both
 * reach a reader as a fact: a Call % becomes a strike price on the
 * covered-call table, and a sort order decides what the database is asked
 * to store. The request schema only says they are finite, so the range is
 * these functions' job.
 */
import { describe, expect, it } from "vitest";
import { MAX_SORT_ORDER, isSafeCallPct, isSafeSortOrder } from "@/lib/input-guard";

describe("isSafeCallPct", () => {
  it("accepts a fraction of the share price", () => {
    for (const n of [0, 0.05, 0.15, 0.5, 1]) {
      expect(isSafeCallPct(n), String(n)).toBe(true);
    }
  });

  it("refuses a percent typed as a whole number, which is the real mistake", () => {
    // 15 read as a fraction is a strike sixteen times the share price.
    expect(isSafeCallPct(15)).toBe(false);
    expect(isSafeCallPct(100)).toBe(false);
  });

  it("refuses a negative, which would strike below what the reader paid", () => {
    expect(isSafeCallPct(-0.1)).toBe(false);
  });

  it("refuses anything that is not a number at all", () => {
    expect(isSafeCallPct(Number.NaN)).toBe(false);
    expect(isSafeCallPct(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("isSafeSortOrder", () => {
  it("accepts a place in a list", () => {
    for (const n of [0, 1, 99, MAX_SORT_ORDER]) {
      expect(isSafeSortOrder(n), String(n)).toBe(true);
    }
  });

  it("refuses a number too big for the column", () => {
    expect(isSafeSortOrder(MAX_SORT_ORDER + 1)).toBe(false);
    expect(isSafeSortOrder(1e20)).toBe(false);
  });

  it("refuses a negative and a fraction", () => {
    expect(isSafeSortOrder(-1)).toBe(false);
    expect(isSafeSortOrder(1.5)).toBe(false);
  });
});
