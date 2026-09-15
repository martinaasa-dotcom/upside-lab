import { describe, expect, it } from "vitest";
import { emptyLabBundle, sanitizeEoyOverrides, sanitizeLadders } from "@/lib/lab-bundle";

describe("sanitizeEoyOverrides", () => {
  it("keeps a sane ticker and year", () => {
    expect(sanitizeEoyOverrides({ nvda: { 2026: 200 } })).toEqual({
      NVDA: { 2026: 200 },
    });
  });

  it("drops a year that is not a plausible calendar year", () => {
    expect(sanitizeEoyOverrides({ NVDA: { y1: 200, "not-a-year": 300 } })).toEqual(
      {}
    );
  });

  it("drops a price that is not a real number", () => {
    expect(
      sanitizeEoyOverrides({ NVDA: { 2026: -5, 2027: Infinity, 2028: 200 } })
    ).toEqual({ NVDA: { 2028: 200 } });
  });

  it("drops a ticker with nothing left after cleaning", () => {
    expect(sanitizeEoyOverrides({ NVDA: { 2026: -5 } })).toEqual({});
  });

  it("rejects a ticker that does not look like one", () => {
    expect(sanitizeEoyOverrides({ "__proto__": { 2026: 200 } })).toEqual({});
  });

  it("is not fooled by junk input", () => {
    expect(sanitizeEoyOverrides(null)).toEqual({});
    expect(sanitizeEoyOverrides([1, 2, 3])).toEqual({});
    expect(sanitizeEoyOverrides({ NVDA: "not an object" })).toEqual({});
  });

  it("rounds to the cent", () => {
    expect(sanitizeEoyOverrides({ NVDA: { 2026: 200.126 } })).toEqual({
      NVDA: { 2026: 200.13 },
    });
  });
});

describe("emptyLabBundle", () => {
  it("carries an empty map for every field, eoyOverrides included", () => {
    expect(emptyLabBundle()).toEqual({
      conviction: {},
      watchlist: [],
      ladders: {},
      eoyOverrides: {},
      eoySources: {},
    });
  });
});

describe("sanitizeLadders still holds its own shape unchanged", () => {
  it("keeps a sane edge", () => {
    expect(sanitizeLadders({ NVDA: { edges: { hold: 1.1 } } })).toEqual({
      NVDA: { edges: { hold: 1.1 } },
    });
  });
});
