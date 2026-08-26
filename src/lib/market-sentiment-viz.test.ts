import { describe, expect, it } from "vitest";
import {
  bandRangePct,
  downsampleSeries,
  linearMarkerPct,
  sentimentSparkLayout,
  signedTrackFill,
  stretchFillPct,
} from "@/lib/market-sentiment-viz";

describe("downsampleSeries", () => {
  it("keeps the first and last point", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    const out = downsampleSeries(values, 10);
    expect(out[0]).toBe(0);
    expect(out[out.length - 1]).toBe(99);
    expect(out).toHaveLength(10);
  });
});

describe("stretchFillPct", () => {
  it("is the share of a typical completed run already used", () => {
    expect(stretchFillPct(98, 97, false)).toBeCloseTo((98 / 195) * 100, 5);
  });

  it("caps an already-long run instead of inventing leftover days", () => {
    expect(stretchFillPct(180, null, true)).toBe(92);
    expect(stretchFillPct(10, null, false)).toBeNull();
  });
});

describe("linearMarkerPct", () => {
  it("places VIX 15.21 in the quiet third of a 10 to 40 track", () => {
    const pct = linearMarkerPct(15.21, 10, 40);
    expect(pct).toBeCloseTo(((15.21 - 10) / 30) * 100, 5);
    const quiet = bandRangePct(12, 20, 10, 40);
    expect(quiet).not.toBeNull();
    expect(pct!).toBeGreaterThan(quiet!.fromPct);
    expect(pct!).toBeLessThan(quiet!.toPct);
  });
});

describe("signedTrackFill", () => {
  it("grows right of centre for a lead, scaled so 12% is nearly a full half", () => {
    const full = signedTrackFill(0.12);
    const mid = signedTrackFill(0.081);
    expect(full).toBeCloseTo(44, 5);
    expect(mid).toBeGreaterThan(0);
    expect(mid!).toBeLessThan(full!);
    expect(signedTrackFill(-0.04)).toBeLessThan(0);
  });
});

describe("sentimentSparkLayout", () => {
  it("colours the last dot from price versus usual, not from the year's start", () => {
    const price = [100, 90, 110];
    const usual = [100, 100, 100];
    const layout = sentimentSparkLayout(price, usual);
    expect(layout).not.toBeNull();
    expect(layout!.last.above).toBe(true);
    expect(layout!.gain.length).toBeGreaterThan(0);
    expect(layout!.priceLine.split(" ")).toHaveLength(3);
  });
});
