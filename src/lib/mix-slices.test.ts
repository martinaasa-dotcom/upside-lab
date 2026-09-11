import { describe, expect, it } from "vitest";

import { MAX_MIX_SLICES, mixSlices } from "@/lib/mix-slices";

const SECTORS = [
  "Technology and software",
  "Everyday household goods",
  "Banks and finance",
  "Oil, gas and energy",
  "Healthcare and medicines",
  "Property",
  "Factories, machines and transport",
  "Electricity, water and gas",
];

/** One holding per sector, each worth less than the one before. */
function spread(count: number) {
  return SECTORS.slice(0, count).map((sector, i) => ({
    ticker: `T${i}`,
    currentValue: 1000 - i * 50,
    sector,
  }));
}

describe("the picture of what a portfolio is made of", () => {
  it("gives the biggest slices the best-separated colours", () => {
    const slices = mixSlices(spread(4));
    const colors = slices.map((s) => s.color);
    expect(new Set(colors).size).toBe(colors.length);
    // Biggest first, so the ramp is spent in the order it was tuned for.
    expect(slices[0]!.pct).toBeGreaterThanOrEqual(slices[1]!.pct);
  });

  it("does not fold a portfolio of ordinary size", () => {
    /*
      A real portfolio spans four or five kinds of business, so the fold
      almost never fires. It exists for the tail, not as a cap somebody
      meets.
    */
    const slices = mixSlices(spread(MAX_MIX_SLICES));
    expect(slices.length).toBe(MAX_MIX_SLICES);
    expect(slices.some((s) => s.key === "everything-else")).toBe(false);
  });

  it("folds the tail into one honest group rather than four slivers", () => {
    const slices = mixSlices(spread(8));
    expect(slices.length).toBe(MAX_MIX_SLICES + 1);
    const rest = slices[slices.length - 1]!;
    expect(rest.key).toBe("everything-else");
    expect(rest.label).toBe("2 smaller groups");
    // The shares still add to everything, so no money goes missing.
    const total = slices.reduce((sum, s) => sum + s.pct, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("names a single leftover rather than calling it a group of one", () => {
    const slices = mixSlices(spread(MAX_MIX_SLICES + 1));
    const last = slices[slices.length - 1]!;
    expect(last.label).toBe(SECTORS[MAX_MIX_SLICES]);
    expect(last.label).not.toContain("smaller");
  });

  it("carries the money as well as the share", () => {
    const slices = mixSlices(spread(3));
    for (const slice of slices) {
      expect(slice.value).toBeGreaterThan(0);
      expect(slice.pct).toBeGreaterThan(0);
    }
  });

  it("has nothing to draw for an empty portfolio", () => {
    expect(mixSlices([])).toEqual([]);
    expect(mixSlices([{ ticker: "AAA", currentValue: 0 }])).toEqual([]);
  });
});

describe("two charts drawn to be compared", () => {
  it("gives one group the same colour in both", () => {
    /*
      Circle draws the room's mix and the reader's own side by side to
      answer how one differs from the other. Coloured by rank inside each
      list, the same group would arrive in two different colours on two
      bars drawn to be compared, which makes the comparison unreadable.
    */
    const room = mixSlices([
      { ticker: "A", currentValue: 900, sector: "Technology and software" },
      { ticker: "B", currentValue: 600, sector: "Everyday household goods" },
      { ticker: "C", currentValue: 300, sector: "Banks and finance" },
    ]);
    const byLabel = new Map(room.map((s) => [s.label, s.color]));

    // The reader holds the same three in a different order of size.
    const mine = mixSlices(
      [
        { ticker: "C", currentValue: 900, sector: "Banks and finance" },
        { ticker: "A", currentValue: 100, sector: "Technology and software" },
      ],
      { colorFor: (label) => byLabel.get(label) }
    );

    for (const slice of mine) {
      expect(slice.color, slice.label).toBe(byLabel.get(slice.label));
    }
    // And the ranking really did differ, so the test is not vacuous.
    expect(room[0]!.label).not.toBe(mine[0]!.label);
  });

  it("falls back to its own ramp for a group the other chart lacks", () => {
    const mine = mixSlices(
      [{ ticker: "D", currentValue: 100, sector: "Oil, gas and energy" }],
      { colorFor: () => undefined }
    );
    expect(mine[0]!.color).toBeTruthy();
  });
});
