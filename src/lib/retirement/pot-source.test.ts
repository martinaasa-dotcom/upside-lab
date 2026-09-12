import { describe, expect, it } from "vitest";
import {
  POT_SOURCE_BOOK,
  POT_SOURCE_CUSTOM,
  potSourceValue,
  resolvedPotOverride,
  type PortfolioPotOption,
} from "@/lib/retirement/pot-source";

const SHEETS: PortfolioPotOption[] = [
  { id: "s1", name: "Retirement", value: 40_000 },
  { id: "s2", name: "House deposit", value: 12_000 },
  { id: "s3", name: "Empty", value: 0 },
];

describe("potSourceValue", () => {
  it("answers with the combined total for book", () => {
    expect(potSourceValue(POT_SOURCE_BOOK, 52_000, SHEETS)).toBe(52_000);
  });

  it("answers with null for book when there is nothing real", () => {
    expect(potSourceValue(POT_SOURCE_BOOK, null, SHEETS)).toBeNull();
    expect(potSourceValue(POT_SOURCE_BOOK, 0, SHEETS)).toBeNull();
  });

  it("names one portfolio and nothing else", () => {
    expect(potSourceValue("s1", 52_000, SHEETS)).toBe(40_000);
    expect(potSourceValue("s2", 52_000, SHEETS)).toBe(12_000);
  });

  it("never answers with a worthless portfolio", () => {
    expect(potSourceValue("s3", 52_000, SHEETS)).toBeNull();
  });

  it("answers with null for custom, and for a portfolio that has gone", () => {
    expect(potSourceValue(POT_SOURCE_CUSTOM, 52_000, SHEETS)).toBeNull();
    expect(potSourceValue("not-a-sheet", 52_000, SHEETS)).toBeNull();
  });
});

describe("resolvedPotOverride", () => {
  it("uses the named source when it names a real portfolio", () => {
    expect(resolvedPotOverride("s2", 52_000, SHEETS)).toBe(12_000);
  });

  it("falls back to the combined total once the source names nothing real", () => {
    /*
      PRESSING A TEMPLATE IS ASKING FOR A WHOLE NEW LIFE, AND THAT LIFE MUST
      NEVER CARRY A MADE-UP POT WHILE A REAL FIGURE IS SITTING THERE. A
      reader on `custom`, or pointed at a portfolio that has since gone, is
      handed their combined total rather than nothing.
    */
    expect(resolvedPotOverride(POT_SOURCE_CUSTOM, 52_000, SHEETS)).toBe(52_000);
    expect(resolvedPotOverride("gone", 52_000, SHEETS)).toBe(52_000);
  });

  it("answers with null only when there is truly nothing real to hold", () => {
    expect(resolvedPotOverride(POT_SOURCE_CUSTOM, null, [])).toBeNull();
    expect(resolvedPotOverride(POT_SOURCE_CUSTOM, 0, [])).toBeNull();
  });
});
