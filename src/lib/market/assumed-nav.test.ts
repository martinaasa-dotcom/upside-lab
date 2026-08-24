/**
 * The assumed NAV line is the chart a reader looks at to see what their
 * year did. It had no tests, and it drew a rise that never happened
 * whenever two holdings had different amounts of price history.
 */
import { describe, expect, it } from "vitest";
import {
  applyYtdAnchor,
  downsampleToWeeks,
  paintBookNavSeries,
  reconstructAssumedNav,
  startNavFromYtdPct,
} from "@/lib/market/assumed-nav";

/** `n` days of a flat price, starting on the given day of January. */
function flat(fromDay: number, n: number, close: number) {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-01-${String(fromDay + i).padStart(2, "0")}`,
    close,
  }));
}

describe("reconstructAssumedNav", () => {
  it("does not invent a rise when one name's history starts later", () => {
    // Nothing moves all week. The old shape valued the newer name at zero
    // for three days and drew +50%.
    const out = reconstructAssumedNav(
      0,
      [
        { ticker: "OLD", shares: 100 },
        { ticker: "NEW", shares: 100 },
      ],
      { OLD: flat(1, 6, 100), NEW: flat(4, 3, 50) }
    );
    expect(out).toHaveLength(3);
    expect(out[0]!.date).toBe("2026-01-04");
    for (const point of out) expect(point.nav).toBe(15_000);
  });

  it("values the whole book on every day it draws", () => {
    const out = reconstructAssumedNav(
      1_000,
      [
        { ticker: "A", shares: 10 },
        { ticker: "B", shares: 20 },
      ],
      { A: flat(1, 3, 50), B: flat(1, 3, 25) }
    );
    expect(out.map((p) => p.nav)).toEqual([2_000, 2_000, 2_000]);
  });

  it("carries a missing day forward, which is a different thing", () => {
    // B does not trade on the 2nd, a holiday on its exchange. Its last
    // close still values it, because there is one to carry.
    const out = reconstructAssumedNav(
      0,
      [
        { ticker: "A", shares: 1 },
        { ticker: "B", shares: 1 },
      ],
      {
        A: [
          { date: "2026-01-01", close: 100 },
          { date: "2026-01-02", close: 110 },
          { date: "2026-01-03", close: 120 },
        ],
        B: [
          { date: "2026-01-01", close: 10 },
          { date: "2026-01-03", close: 10 },
        ],
      }
    );
    expect(out.map((p) => p.nav)).toEqual([110, 120, 130]);
  });

  it("adds cash to every point", () => {
    const out = reconstructAssumedNav(500, [{ ticker: "A", shares: 1 }], {
      A: flat(1, 2, 100),
    });
    expect(out.map((p) => p.nav)).toEqual([600, 600]);
  });

  it("has nothing to say without positions or history", () => {
    expect(reconstructAssumedNav(100, [], {})).toEqual([]);
    expect(
      reconstructAssumedNav(100, [{ ticker: "A", shares: 1 }], { A: [] })
    ).toEqual([]);
    expect(
      reconstructAssumedNav(100, [{ ticker: "A", shares: 0 }], { A: flat(1, 3, 10) })
    ).toEqual([]);
  });
});

describe("startNavFromYtdPct", () => {
  it("works the year back from where it ended", () => {
    // Up 25% to $12,500 means it started at $10,000.
    expect(startNavFromYtdPct(12_500, 0.25)).toBe(10_000);
    expect(startNavFromYtdPct(7_500, -0.25)).toBe(10_000);
  });

  it("gives the live figure back rather than dividing by nothing", () => {
    expect(startNavFromYtdPct(10_000, -1)).toBe(10_000);
    expect(startNavFromYtdPct(0, 0.1)).toBe(0);
  });
});

describe("applyYtdAnchor", () => {
  it("pins both ends and keeps the shape between them", () => {
    const points = [
      { date: "a", nav: 100 },
      { date: "b", nav: 150 },
      { date: "c", nav: 200 },
    ];
    const out = applyYtdAnchor(points, 1_000, 2_000);
    expect(out[0]!.nav).toBe(1_000);
    expect(out[2]!.nav).toBe(2_000);
    // Halfway along the source span stays halfway along the new one.
    expect(out[1]!.nav).toBe(1_500);
  });

  it("draws a straight line when the source never moved", () => {
    const flatPoints = [
      { date: "a", nav: 100 },
      { date: "b", nav: 100 },
      { date: "c", nav: 100 },
    ];
    const out = applyYtdAnchor(flatPoints, 1_000, 1_300);
    expect(out.map((p) => p.nav)).toEqual([1_000, 1_150, 1_300]);
  });

  it("leaves a path it cannot anchor alone", () => {
    const one = [{ date: "a", nav: 100 }];
    expect(applyYtdAnchor(one, 1_000, 2_000)).toEqual(one);
  });
});

describe("paintBookNavSeries", () => {
  const hist = [
    { date: "2026-01-01", nav: 100 },
    { date: "2026-01-02", nav: 110 },
  ];

  it("draws nothing when the history is another portfolio's", () => {
    expect(
      paintBookNavSeries({ hist, histBelongsToBook: false, liveNav: 120 })
    ).toEqual([]);
  });

  it("adds today when it differs from the last recorded night", () => {
    const out = paintBookNavSeries({ hist, histBelongsToBook: true, liveNav: 120 });
    expect(out[out.length - 1]).toEqual({ date: "Live", nav: 120 });
  });

  it("replaces the last point when today matches it", () => {
    const out = paintBookNavSeries({
      hist,
      histBelongsToBook: true,
      liveNav: 110.2,
    });
    expect(out).toHaveLength(2);
    expect(out[1]!.nav).toBe(110.2);
  });

  it("keeps a single recorded night drawable", () => {
    const out = paintBookNavSeries({
      hist: [{ date: "2026-01-01", nav: 100 }],
      histBelongsToBook: true,
      liveNav: 100,
    });
    expect(out).toHaveLength(2);
  });

  it("drops a zero or missing value rather than dropping the line to the floor", () => {
    const out = paintBookNavSeries({
      hist: [
        { date: "2026-01-01", nav: 100 },
        { date: "2026-01-02", nav: 0 },
        { date: "2026-01-03", nav: 120 },
      ],
      histBelongsToBook: true,
      liveNav: 120,
    });
    expect(out.every((p) => p.nav > 0)).toBe(true);
  });
});

describe("downsampleToWeeks", () => {
  it("keeps the last print of each week and today", () => {
    const daily = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      nav: 100 + i,
    }));
    const out = downsampleToWeeks(daily);
    expect(out.length).toBeLessThan(daily.length);
    expect(out[out.length - 1]).toEqual(daily[daily.length - 1]);
  });

  it("leaves a short series alone", () => {
    const two = [
      { date: "2026-01-01", nav: 1 },
      { date: "2026-01-02", nav: 2 },
    ];
    expect(downsampleToWeeks(two)).toEqual(two);
  });
});
