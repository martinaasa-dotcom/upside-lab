import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  indexProxyName,
  indexProxyNote,
  isIndexProxy,
} from "@/lib/market/index-proxy";

describe("an S&P tracker is the baseline, not a competitor", () => {
  it("knows the European listing a reader actually held", () => {
    expect(indexProxyName("SXR8.DE")).toBe("S&P 500");
    expect(indexProxyName("sxr8.de")).toBe("S&P 500");
    expect(isIndexProxy("CSPX.L")).toBe(true);
    expect(isIndexProxy("VUSA.L")).toBe(true);
  });

  it("knows the US listings and the index itself", () => {
    for (const t of ["SPY", "VOO", "IVV", "^GSPC", "ES=F"]) {
      expect(isIndexProxy(t)).toBe(true);
    }
  });

  it("leaves an ordinary holding alone", () => {
    for (const t of ["NVDA", "CRWV", "RKLB", "BTC-USD", "RHM.DE", "LHV1T.TL"]) {
      expect(isIndexProxy(t)).toBe(false);
      expect(indexProxyName(t)).toBeNull();
    }
  });

  it("says nothing when no tracker is held", () => {
    expect(indexProxyNote(["NVDA", "AMD"])).toBeNull();
    expect(indexProxyNote([])).toBeNull();
  });

  it("names one tracker in plain words", () => {
    const note = indexProxyNote(["NVDA", "SXR8.DE"]);
    expect(note).toMatch(/\$SXR8\.DE is the S&P 500/);
    expect(note).toMatch(/middle line/);
    expect(note).not.toMatch(/—|–/);
  });

  it("names more than one without a stray comma", () => {
    const note = indexProxyNote(["SPY", "VOO", "NVDA"])!;
    expect(note).toBe(
      "$SPY and $VOO are the S&P 500, so they are the middle line here rather than a name in the ranking."
    );
  });
});

describe("Trends keeps the tracker out of the ranking", () => {
  const PANEL = readFileSync(
    join(process.cwd(), "src/components/TrendsPanel.tsx"),
    "utf8"
  );

  it("filters the ranking and names the window in the heading", () => {
    expect(PANEL).toMatch(/isIndexProxy\(r\.ticker\)/);
    expect(PANEL).toMatch(/13 weeks, about three months/);
    expect(PANEL).toMatch(/not measured\s*\n?\s*from the day you bought/);
  });
});
