import { describe, expect, it } from "vitest";
import {
  bandRangePct,
  downsampleSeries,
  lerpScale,
  linearMarkerPct,
  sentimentSparkLayout,
  signedRatioAtPct,
  signedTrackFill,
  sparkGhostDays,
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
  it("places VIX 15.21 in the normal 15 to 25 band of a 10 to 40 track", () => {
    const pct = linearMarkerPct(15.21, 10, 40);
    expect(pct).toBeCloseTo(((15.21 - 10) / 30) * 100, 5);
    const normal = bandRangePct(15, 25, 10, 40);
    expect(normal).not.toBeNull();
    expect(pct!).toBeGreaterThan(normal!.fromPct);
    expect(pct!).toBeLessThan(normal!.toPct);
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

  it("round-trips a probe on the live marker back to the ratio", () => {
    const fill = signedTrackFill(0.081)!;
    expect(signedRatioAtPct(50 + fill)).toBeCloseTo(0.081, 5);
    expect(signedRatioAtPct(50)).toBe(0);
    expect(signedRatioAtPct(50 + signedTrackFill(0.12)!)).toBeCloseTo(0.12, 5);
  });
});

describe("lerpScale", () => {
  it("puts a VIX reading on a 10 to 40 track", () => {
    expect(lerpScale(0, 10, 40)).toBe(10);
    expect(lerpScale(100, 10, 40)).toBe(40);
    expect(lerpScale(((15.21 - 10) / 30) * 100, 10, 40)).toBeCloseTo(15.21, 5);
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
    expect(layout!.probes).toHaveLength(3);
    expect(layout!.streak).toBeNull();
    expect(layout!.ghost).toBeNull();
  });

  it("marks the current stretch on the right of the year", () => {
    const layout = sentimentSparkLayout(
      [100, 102, 104, 110],
      [100, 100, 100, 100],
      240,
      56,
      2
    );
    expect(layout!.streak).not.toBeNull();
    expect(layout!.streak!.x0).toBe(layout!.probes[2]!.x);
    expect(layout!.streak!.x1).toBe(layout!.last.x);
    expect(layout!.ghost).toBeNull();
  });

  it("leaves empty time after today, not a modelled price", () => {
    const layout = sentimentSparkLayout(
      [100, 102, 104, 110],
      [100, 100, 100, 100],
      240,
      56,
      2,
      80,
      252
    );
    expect(layout!.ghost).not.toBeNull();
    expect(layout!.ghost!.x0).toBeCloseTo(layout!.nowX, 5);
    expect(layout!.ghost!.x1).toBeGreaterThan(layout!.ghost!.x0);
    expect(layout!.last.x).toBeCloseTo(layout!.nowX, 5);
  });
});

describe("sparkGhostDays", () => {
  it("draws leftover days to the right of today", () => {
    expect(sparkGhostDays(252, 97, false)).toBe(97);
  });

  it("draws nothing when the run is already the long one", () => {
    expect(sparkGhostDays(252, null, true)).toBe(0);
  });

  it("never shrinks the year below the floor", () => {
    const ghost = sparkGhostDays(252, 400, false);
    expect(252 / (252 + ghost)).toBeGreaterThanOrEqual(0.62);
  });
});
