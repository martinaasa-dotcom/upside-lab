import { describe, expect, it } from "vitest";
import { raceRead, raceTrack, TRACK_PAD } from "@/lib/fund-race";

const NAME = "the Nasdaq 100 tracker";

describe("raceRead", () => {
  it("states the gap in points, in the direction it runs", () => {
    expect(raceRead(0.05, 0.02, NAME)?.line).toBe(
      "3.0 points ahead of the Nasdaq 100 tracker since the start."
    );
    expect(raceRead(-0.08, 0.023, NAME)?.line).toBe(
      "10.3 points behind the Nasdaq 100 tracker since the start."
    );
  });

  it("says one point, not one points", () => {
    expect(raceRead(0.03, 0.02, NAME)?.line).toMatch(/^1\.0 point ahead/);
  });

  it("calls two returns within a twentieth of a point level", () => {
    const r = raceRead(0.0501, 0.05, NAME);
    expect(r?.lead).toBe("level");
    expect(r?.line).toContain("Level with");
  });

  it("says nothing when either return is missing", () => {
    expect(raceRead(null, 0.02, NAME)).toBeNull();
    expect(raceRead(0.02, undefined, NAME)).toBeNull();
    expect(raceRead(Number.NaN, 0.02, NAME)).toBeNull();
  });

  it("carries no instruction or verdict", () => {
    for (const [a, b] of [
      [0.1, 0.02],
      [-0.1, 0.02],
      [0.02, 0.02],
    ] as const) {
      const line = raceRead(a, b, NAME)!.line.toLowerCase();
      expect(line).not.toMatch(/\b(buy|sell|should|winning|losing|beat|good|bad)\b/);
    }
  });
});

describe("raceTrack", () => {
  it("keeps the start line and both runners inside the padded track", () => {
    for (const [f, b] of [
      [-0.08, 0.023],
      [0.2, 0.05],
      [-0.3, -0.1],
      [0, 0],
    ] as const) {
      const t = raceTrack(f, b);
      for (const x of [t.zero, t.fund, t.bench]) {
        expect(x).toBeGreaterThanOrEqual(TRACK_PAD - 1e-9);
        expect(x).toBeLessThanOrEqual(1 - TRACK_PAD + 1e-9);
      }
    }
  });

  it("orders the runners the way their returns are ordered", () => {
    const t = raceTrack(-0.08, 0.023);
    expect(t.fund).toBeLessThan(t.zero);
    expect(t.zero).toBeLessThan(t.bench);
  });
});
