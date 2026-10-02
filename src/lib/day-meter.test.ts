import { describe, expect, it } from "vitest";

import { dayMeter } from "@/lib/day-meter";
import { daySize } from "@/lib/typical-move";

describe("today against an ordinary day, drawn", () => {
  it("puts no move at the centre and keeps the band symmetric", () => {
    const m = dayMeter(0, 0.01)!;
    expect(m.at).toBe(0.5);
    expect(m.bandFrom + m.bandTo).toBeCloseTo(1, 10);
  });

  it("agrees with the sentence about whether today was ordinary", () => {
    for (const today of [-0.05, -0.02, -0.016, -0.01, 0, 0.004, 0.0159, 0.017, 0.031, 0.09]) {
      const m = dayMeter(today, 0.01)!;
      expect(m.ordinary, `today ${today}`).toBe(
        daySize(today, { typicalPct: 0.01, days: 60 }) === "ordinary"
      );
      const inside = m.at >= m.bandFrom && m.at <= m.bandTo;
      expect(inside, `marker inside band at ${today}`).toBe(m.ordinary);
    }
  });

  it("keeps a huge day on the line rather than off it", () => {
    const m = dayMeter(-0.2, 0.01)!;
    expect(m.at).toBeGreaterThan(0);
    expect(m.at).toBeLessThan(0.5);
  });

  it("draws nothing it cannot measure", () => {
    expect(dayMeter(null, 0.01)).toBeNull();
    expect(dayMeter(0.01, null)).toBeNull();
    expect(dayMeter(0.01, 0)).toBeNull();
    expect(dayMeter(Number.NaN, 0.01)).toBeNull();
  });
});
