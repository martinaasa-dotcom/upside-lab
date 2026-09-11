import { describe, expect, it } from "vitest";

import { MAX_MIX_SLICES, mixGapLine, mixSlices } from "@/lib/mix-slices";

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

describe("where you differ from the room", () => {
  const hold = (sector: string, value: number) => ({
    ticker: sector.slice(0, 3).toUpperCase(),
    currentValue: value,
    sector,
  });

  it("finds a group the room holds too little of to draw", () => {
    /*
      The fault this replaced. The old line walked the ROOM's drawn slices
      and looked each up on the reader's side, so a sector the reader is
      heavily in could not be the answer unless the room also held enough
      of it to survive the fold. Measured on a reader who is entirely in
      utilities inside a circle holding half a per cent of it, the panel
      said "27 points less of Technology and software": true, and not what
      anybody opened the panel to find out.
    */
    const room = [
      hold("Technology and software", 5000),
      hold("Banks and finance", 4000),
      hold("Healthcare and medicines", 3000),
      hold("Everyday household goods", 2500),
      hold("Oil, gas and energy", 2000),
      hold("Property", 1500),
      hold("Electricity, water and gas", 100),
    ];
    const you = [hold("Electricity, water and gas", 9000)];
    const line = mixGapLine(room, you);
    expect(line).toMatch(/Electricity, water and gas/);
    expect(line).toMatch(/more/);
  });

  it("never compares one chart's folded tail against the other's", () => {
    /*
      Both charts fold their tail under the key `everything-else`, and the
      tails are different sectors on each side, so subtracting one from
      the other states a fact about the reader from two unrelated sets of
      companies, in a sentence naming neither.

      The room here holds eight sectors and folds its two smallest; the
      reader holds only the six the room draws and folds nothing. Compared
      as drawn, the fold is a 24 point gap and wins outright, so the panel
      leads with "24 points less of 2 smaller groups". Compared unfolded,
      the answer is one of the two sectors the reader genuinely does not
      hold, by name.
    */
    const room = [
      hold("Technology and software", 100),
      hold("Banks and finance", 99),
      hold("Healthcare and medicines", 98),
      hold("Everyday household goods", 97),
      hold("Oil, gas and energy", 96),
      hold("Property", 95),
      hold("Electricity, water and gas", 94),
      hold("Factories, machines and transport", 93),
    ];
    const you = room.slice(0, MAX_MIX_SLICES);
    const line = mixGapLine(room, you);
    expect(line).not.toMatch(/smaller groups/);
    expect(line).not.toMatch(/everything.else/i);
    // It names one of the two the reader really does not hold.
    expect(line).toMatch(
      /Electricity, water and gas|Factories, machines and transport/
    );
  });

  it("says nothing when the two are the same portfolio", () => {
    const same = [hold("Technology and software", 100), hold("Property", 100)];
    expect(mixGapLine(same, same)).toBeNull();
  });

  it("says nothing when either side holds nothing", () => {
    expect(mixGapLine([], [hold("Property", 100)])).toBeNull();
    expect(mixGapLine([hold("Property", 100)], [])).toBeNull();
  });
});
