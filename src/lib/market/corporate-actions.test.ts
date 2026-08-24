/**
 * Hand-worked against real splits, because the whole point of this file is
 * that a position must be worth exactly the same money before and after.
 */
import { describe, expect, it } from "vitest";
import {
  adjustForSplits,
  pendingSplitAdjustments,
  splitLabel,
  splitRatio,
  splitsAfter,
  type SplitEvent,
} from "@/lib/market/corporate-actions";

const NVDA_10_FOR_1: SplitEvent = {
  date: "2024-06-10",
  numerator: 10,
  denominator: 1,
};
const AAPL_4_FOR_1: SplitEvent = {
  date: "2020-08-31",
  numerator: 4,
  denominator: 1,
};
/** A reverse split, which is the case that breaks naive arithmetic. */
const REVERSE_1_FOR_5: SplitEvent = {
  date: "2025-03-03",
  numerator: 1,
  denominator: 5,
};

describe("adjustForSplits", () => {
  it("holds the position's money exactly across Nvidia's 10 for 1", () => {
    const before = { shares: 200, buyPrice: 1096 };
    const after = adjustForSplits(before, [NVDA_10_FOR_1]);
    expect(after).toEqual({ shares: 2000, buyPrice: 109.6, ratio: 10 });
    expect(after!.shares * after!.buyPrice).toBeCloseTo(
      before.shares * before.buyPrice,
      6
    );
  });

  it("holds it across a reverse split too", () => {
    const before = { shares: 500, buyPrice: 2.4 };
    const after = adjustForSplits(before, [REVERSE_1_FOR_5]);
    expect(after).toEqual({ shares: 100, buyPrice: 12, ratio: 0.2 });
    expect(after!.shares * after!.buyPrice).toBeCloseTo(
      before.shares * before.buyPrice,
      6
    );
  });

  it("compounds two splits into one correction", () => {
    const after = adjustForSplits({ shares: 10, buyPrice: 400 }, [
      AAPL_4_FOR_1,
      { date: "2021-01-04", numerator: 2, denominator: 1 },
    ]);
    expect(after).toEqual({ shares: 80, buyPrice: 50, ratio: 8 });
  });

  it("says nothing when there is nothing to apply", () => {
    expect(adjustForSplits({ shares: 10, buyPrice: 100 }, [])).toBeNull();
    expect(
      adjustForSplits({ shares: 10, buyPrice: 100 }, [
        { date: "2024-01-01", numerator: 1, denominator: 1 },
      ])
    ).toBeNull();
  });

  it("refuses a position whose numbers are not numbers", () => {
    expect(adjustForSplits({ shares: 0, buyPrice: 100 }, [NVDA_10_FOR_1])).toBeNull();
    expect(adjustForSplits({ shares: 10, buyPrice: 0 }, [NVDA_10_FOR_1])).toBeNull();
    expect(
      adjustForSplits({ shares: Number.NaN, buyPrice: 100 }, [NVDA_10_FOR_1])
    ).toBeNull();
  });

  it("refuses a reverse split that would round a real position to nothing", () => {
    const tiny = adjustForSplits({ shares: 0.000001, buyPrice: 1 }, [
      { date: "2025-01-01", numerator: 1, denominator: 1000 },
    ]);
    expect(tiny).toBeNull();
  });
});

describe("a spinoff is not a split", () => {
  // Checked against the live Yahoo feed: GE reports a real 1 for 8 reverse
  // in August 2021, then 1281:1000 and 1253:1000, which are the GE
  // HealthCare and Vernova spinoffs. A spinoff restates the price history
  // and leaves the share count alone, so applying one would tell a holder
  // their 100 shares had become 128.1.
  const GE_FEED: SplitEvent[] = [
    { date: "2021-08-02", numerator: 1, denominator: 8 },
    { date: "2023-01-04", numerator: 1281, denominator: 1000 },
    { date: "2024-04-02", numerator: 1253, denominator: 1000 },
  ];

  it("keeps the reverse split and drops both adjustment factors", () => {
    const due = splitsAfter(GE_FEED, "2020-01-01T00:00:00Z");
    expect(due).toEqual([{ date: "2021-08-02", numerator: 1, denominator: 8 }]);
  });

  it("does nothing at all when only the spinoffs are in range", () => {
    expect(splitsAfter(GE_FEED, "2022-01-01T00:00:00Z")).toEqual([]);
    expect(
      adjustForSplits({ shares: 100, buyPrice: 80 }, GE_FEED.slice(1))
    ).toBeNull();
  });

  it("still takes every ratio a real split is written as", () => {
    const real: SplitEvent[] = [
      { date: "2024-01-01", numerator: 2, denominator: 1 },
      { date: "2024-01-02", numerator: 3, denominator: 2 },
      { date: "2024-01-03", numerator: 5, denominator: 4 },
      { date: "2024-01-04", numerator: 20, denominator: 1 },
      { date: "2024-01-05", numerator: 1, denominator: 10 },
    ];
    expect(splitsAfter(real, "2023-01-01T00:00:00Z")).toHaveLength(5);
  });

  it("reduces the fraction before judging it", () => {
    // 20:10 is 2 for 1 written oddly, and is a real split.
    expect(
      splitsAfter([{ date: "2024-01-01", numerator: 20, denominator: 10 }], "2023-01-01T00:00:00Z")
    ).toHaveLength(1);
  });

  it("refuses a ratio that is not whole numbers of shares", () => {
    expect(
      splitsAfter([{ date: "2024-01-01", numerator: 1.5, denominator: 1 }], "2023-01-01T00:00:00Z")
    ).toEqual([]);
  });
});

describe("splitsAfter", () => {
  it("takes only splits later than the day the row was last touched", () => {
    const splits = [AAPL_4_FOR_1, NVDA_10_FOR_1];
    expect(splitsAfter(splits, "2020-01-01T00:00:00Z")).toHaveLength(2);
    expect(splitsAfter(splits, "2021-01-01T00:00:00Z")).toEqual([NVDA_10_FOR_1]);
    expect(splitsAfter(splits, "2025-01-01T00:00:00Z")).toHaveLength(0);
  });

  it("treats a same-day edit as already adjusted", () => {
    // Somebody editing on the day of the split was looking at the new
    // share count while they typed.
    expect(splitsAfter([NVDA_10_FOR_1], "2024-06-10T18:00:00Z")).toHaveLength(0);
  });

  it("says nothing rather than guessing when there is no timestamp", () => {
    expect(splitsAfter([NVDA_10_FOR_1], null)).toHaveLength(0);
    expect(splitsAfter([NVDA_10_FOR_1], "")).toHaveLength(0);
    expect(splitsAfter([NVDA_10_FOR_1], "not a date")).toHaveLength(0);
  });

  it("drops junk a feed might hand over", () => {
    const junk: SplitEvent[] = [
      { date: "2024-06-10", numerator: 0, denominator: 1 },
      { date: "2024-06-10", numerator: 10, denominator: 0 },
      { date: "nonsense", numerator: 2, denominator: 1 },
    ];
    expect(splitsAfter(junk, "2020-01-01T00:00:00Z")).toHaveLength(0);
    expect(splitRatio(junk)).toBe(1);
  });
});

describe("pendingSplitAdjustments", () => {
  const splitsByTicker = { NVDA: [NVDA_10_FOR_1] };

  it("flags a position nobody has touched since the split", () => {
    const out = pendingSplitAdjustments(
      [
        {
          id: "h1",
          ticker: "nvda",
          shares: 200,
          buy_price: 1096,
          updated_at: "2024-01-05T09:00:00Z",
        },
      ],
      splitsByTicker
    );
    expect(out.h1).toMatchObject({ ticker: "NVDA", ratio: 10, shares: 2000, buyPrice: 109.6 });
    expect(splitLabel(out.h1.splits[0])).toBe("10 for 1");
  });

  it("stays quiet about one edited since, because it cannot be sure", () => {
    const out = pendingSplitAdjustments(
      [
        {
          id: "h1",
          ticker: "NVDA",
          shares: 2000,
          buy_price: 109.6,
          updated_at: "2024-07-01T09:00:00Z",
        },
      ],
      splitsByTicker
    );
    expect(out).toEqual({});
  });

  it("leaves every other name alone", () => {
    const out = pendingSplitAdjustments(
      [
        {
          id: "h2",
          ticker: "MSFT",
          shares: 10,
          buy_price: 300,
          updated_at: "2020-01-01T00:00:00Z",
        },
      ],
      splitsByTicker
    );
    expect(out).toEqual({});
  });
});
