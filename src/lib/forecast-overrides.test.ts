import { describe, expect, it } from "vitest";
import {
  mergeBookEoyOverrides,
  setEoyOverride,
  type PortfolioEoyOverrides,
} from "@/lib/forecast-overrides";

describe("mergeBookEoyOverrides", () => {
  it("carries a ticker that is only in a non-active portfolio", () => {
    // The exact shape of the bug this exists to fix: a reader set a
    // target for BMNR in a second portfolio, and the active one (with
    // nothing set for it) must not make that target disappear from the
    // whole-book picture.
    const active: PortfolioEoyOverrides = {};
    const other = setEoyOverride({}, "BMNR", 2026, 45);
    const merged = mergeBookEoyOverrides([active, other]);
    expect(merged.BMNR).toEqual({ 2026: 45 });
  });

  it("keeps a target set in the active portfolio when another has none", () => {
    const active = setEoyOverride({}, "AAPL", 2026, 300);
    const other: PortfolioEoyOverrides = {};
    const merged = mergeBookEoyOverrides([other, active]);
    expect(merged.AAPL).toEqual({ 2026: 300 });
  });

  it("combines different tickers from different portfolios", () => {
    const a = setEoyOverride({}, "AAPL", 2026, 300);
    const b = setEoyOverride({}, "TSLA", 2027, 500);
    const merged = mergeBookEoyOverrides([a, b]);
    expect(merged.AAPL).toEqual({ 2026: 300 });
    expect(merged.TSLA).toEqual({ 2027: 500 });
  });

  it("has no rule for which portfolio wins on the same ticker, and is explicit that the last one does", () => {
    const first = setEoyOverride({}, "NVDA", 2026, 100);
    const second = setEoyOverride({}, "NVDA", 2026, 200);
    expect(mergeBookEoyOverrides([first, second]).NVDA).toEqual({ 2026: 200 });
    expect(mergeBookEoyOverrides([second, first]).NVDA).toEqual({ 2026: 100 });
  });

  it("returns an empty map for an empty book", () => {
    expect(mergeBookEoyOverrides([])).toEqual({});
  });
});
