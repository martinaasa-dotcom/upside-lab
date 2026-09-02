import { describe, expect, it } from "vitest";
import { belief, beliefLines, fundBeliefLine } from "@/lib/believe";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

/** Prices wandering between 61 and 93, the way a jumpy company does. */
const CLOSES = Array.from({ length: 40 }, (_, i) =>
  i % 2 === 0 ? 61 + (i % 8) * 4 : 98 - (i % 6) * 5
);

describe("the arithmetic", () => {
  it("says nothing without two real prices", () => {
    expect(belief({ subject: "Apple", spot: 0, target: 120, months: 4 })).toBeNull();
    expect(belief({ subject: "Apple", spot: 83, target: 0, months: 4 })).toBeNull();
    expect(beliefLines({ subject: "Apple", spot: 0, target: 1, months: 1 }, money)).toEqual([]);
  });

  it("works out the whole change asked for", () => {
    const b = belief({ subject: "CoreWeave", spot: 83, target: 120, months: 4 })!;
    expect(b.totalPct).toBeCloseTo(0.4458, 3);
  });

  it("says a rate a year only when the horizon is long enough to mean one", () => {
    expect(belief({ subject: "A", spot: 100, target: 120, months: 4 })!.annualPct).toBeNull();
    const year = belief({ subject: "A", spot: 100, target: 121, months: 24 })!;
    expect(year.annualPct).toBeCloseTo(0.1, 2);
  });

  it("measures the ask against the company's own recent travel", () => {
    const b = belief({
      subject: "CoreWeave",
      spot: 83,
      target: 120,
      months: 4,
      closes: CLOSES,
    })!;
    expect(b.scale).not.toBeNull();
    expect(b.scale!.lowest).toBe(61);
    expect(b.scale!.highest).toBe(93);
    // 37 dollars of ask against a 32 dollar range is a bit over one range.
    expect(b.scale!.ranges).toBeCloseTo(1.16, 1);
  });

  it("leaves the scale out rather than inventing one from three prices", () => {
    const b = belief({
      subject: "A",
      spot: 10,
      target: 20,
      months: 12,
      closes: [10, 11, 12],
    })!;
    expect(b.scale).toBeNull();
    expect(b.typical).toBeNull();
  });
});

describe("the sentences", () => {
  it("puts the ask in plain arithmetic", () => {
    const lines = beliefLines(
      { subject: "CoreWeave", spot: 83, target: 120, months: 4, closes: CLOSES },
      money
    );
    expect(lines[0]).toBe(
      "For CoreWeave to reach $120 in 4 months from $83 today, it has to gain 45%."
    );
    expect(lines.some((l) => l.includes("has been between $61 and $93"))).toBe(true);
  });

  it("says a fall as a fall, without softening it", () => {
    const lines = beliefLines(
      { subject: "Apple", spot: 200, target: 150, months: 12 },
      money
    );
    expect(lines[0]).toContain("has to fall 25%");
    expect(lines[1]).toContain("down");
  });

  it("says so when a target asks for nothing at all", () => {
    const lines = beliefLines(
      { subject: "Apple", spot: 200, target: 200.4, months: 12 },
      money
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no change at all");
  });

  it("says a year rate for a long horizon and not for a short one", () => {
    const short = beliefLines({ subject: "A", spot: 100, target: 130, months: 3 }, money);
    expect(short.some((l) => l.includes("a year"))).toBe(false);
    const long = beliefLines({ subject: "A", spot: 100, target: 260, months: 60 }, money);
    expect(long.some((l) => l.includes("a year, every year"))).toBe(true);
  });

  it("talks about a fund as a whole market", () => {
    const line = fundBeliefLine(
      { subject: "$VOO", spot: 400, target: 800, months: 84 },
      money
    )!;
    expect(line).toContain("holds hundreds of companies");
    expect(line).toContain("the whole market");
    expect(fundBeliefLine({ subject: "$VOO", spot: 400, target: 401, months: 12 }, money)).toBeNull();
  });

  it("never predicts, endorses or refuses the target", () => {
    const all = [
      ...beliefLines({ subject: "A", spot: 83, target: 400, months: 60, closes: CLOSES }, money),
      fundBeliefLine({ subject: "$VOO", spot: 400, target: 800, months: 84 }, money)!,
    ];
    for (const line of all) {
      expect(line).not.toMatch(
        /will |should|likely|unlikely|expect|realistic|too high|too low|buy|sell/i
      );
      expect(line).not.toMatch(/[—–]/);
    }
  });
});
