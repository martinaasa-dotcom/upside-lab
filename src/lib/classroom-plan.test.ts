import { describe, expect, it } from "vitest";
import {
  allowClassAction,
  classifyImportWrite,
  holdingWriteActions,
  parseClassPlan,
  resolveClassroomTrade,
  startPeriodNow,
} from "./classroom";

/*
  The class plan's transitions, pinned at their boundaries.

  The create and join paths are covered elsewhere; what had no dedicated
  coverage was the moments a plan changes state under students: the minute
  a buy period ends, two periods overlapping, the teacher flipping the
  class mid-period, and the malformed rows an older client might have
  stored. Each of these decides whether a student's trade goes through,
  so the boundary semantics are asserted exactly rather than roughly.
*/

const T0 = "2026-09-01T08:00:00.000Z";
const T_END = "2026-09-05T16:00:00.000Z";

function buyWindowPlan() {
  return parseClassPlan(
    {
      purpose: "Term one",
      periods: [{ id: "p1", kind: "buy", startsAt: T0, endsAt: T_END }],
    },
    new Date(T0)
  );
}

describe("a period's end is exact", () => {
  it("one millisecond before the close the buy stands, the sell does not", () => {
    const trade = resolveClassroomTrade(
      buyWindowPlan(),
      new Date(Date.parse(T_END) - 1)
    );
    expect(trade.kind).toBe("buy");
    expect(allowClassAction(trade, "buy")).toBe(true);
    expect(allowClassAction(trade, "sell")).toBe(false);
    expect(trade.until).toBe(T_END);
  });

  it("at the close, to the millisecond, the class is back to open", () => {
    const trade = resolveClassroomTrade(buyWindowPlan(), new Date(T_END));
    expect(trade.kind).toBe("open");
    expect(allowClassAction(trade, "sell")).toBe(true);
  });
});

describe("overlapping periods", () => {
  it("the later-starting period is the one in force", () => {
    // The teacher scheduled a buy week, then closed the class for exam
    // day inside it. During the overlap the closure wins; when it lifts,
    // the buy window is still live underneath.
    const plan = parseClassPlan(
      {
        periods: [
          { id: "buy", kind: "buy", startsAt: T0, endsAt: T_END },
          {
            id: "exam",
            kind: "closed",
            startsAt: "2026-09-03T00:00:00.000Z",
            endsAt: "2026-09-04T00:00:00.000Z",
          },
        ],
      },
      new Date(T0)
    );
    const during = resolveClassroomTrade(
      plan,
      new Date("2026-09-03T10:00:00.000Z")
    );
    expect(during.kind).toBe("closed");
    expect(allowClassAction(during, "buy")).toBe(false);
    expect(allowClassAction(during, "cash")).toBe(false);

    const after = resolveClassroomTrade(
      plan,
      new Date("2026-09-04T10:00:00.000Z")
    );
    expect(after.kind).toBe("buy");
  });
});

describe("the teacher flips the class mid-period", () => {
  it("startPeriodNow closes what covers now and opens the new state", () => {
    const now = new Date("2026-09-02T12:00:00.000Z");
    const flipped = startPeriodNow(buyWindowPlan(), "closed", now);
    const trade = resolveClassroomTrade(flipped, new Date(now.getTime() + 1));
    expect(trade.kind).toBe("closed");
    // And the buy window did not survive underneath: its end was pulled
    // in to the flip, so lifting the closure later cannot resurrect it.
    const later = resolveClassroomTrade(
      flipped,
      new Date("2026-09-04T10:00:00.000Z")
    );
    expect(later.kind).toBe("closed");
  });

  it("flipping to the state the class is already in changes nothing", () => {
    const plan = buyWindowPlan();
    expect(startPeriodNow(plan, "buy", new Date(T0))).toBe(plan);
  });
});

describe("what an older client might have stored", () => {
  it("drops malformed rows instead of letting them decide anything", () => {
    const plan = parseClassPlan(
      {
        periods: [
          { id: "ok", kind: "buy", startsAt: T0, endsAt: T_END },
          { id: "bad-kind", kind: "yolo", startsAt: T0 },
          { id: "bad-date", kind: "closed", startsAt: "someday" },
          { id: "inverted", kind: "closed", startsAt: T_END, endsAt: T0 },
        ],
      },
      new Date(T0)
    );
    expect(plan.periods.map((p) => p.id)).toEqual(["ok"]);
  });

  it("drops periods that already ended, so a stale plan cannot re-close a class", () => {
    const plan = parseClassPlan(
      {
        periods: [
          {
            id: "last-term",
            kind: "closed",
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2026-06-01T00:00:00.000Z",
          },
        ],
      },
      new Date(T0)
    );
    expect(plan.periods).toEqual([]);
    expect(resolveClassroomTrade(plan, new Date(T0)).kind).toBe("open");
  });
});

describe("what counts as which action", () => {
  it("renaming a ticker needs both sides of the trade allowed", () => {
    expect(
      holdingWriteActions({ isNew: false, isDelete: false, tickerChanged: true })
    ).toEqual(["buy", "sell"]);
    // So inside a buy-only window a rename is refused: it is a sell of
    // the old name wearing an edit's clothes.
    const trade = resolveClassroomTrade(buyWindowPlan(), new Date(T0));
    expect(allowClassAction(trade, "sell")).toBe(false);
  });

  it("a replace-import sells what it drops", () => {
    const actions = classifyImportWrite({
      cash: false,
      replace: true,
      rows: [{ ticker: "NVDA", shares: 5 }],
      existing: [
        { ticker: "NVDA", shares: 5 },
        { ticker: "AAPL", shares: 2 },
      ],
    });
    expect(actions).toContain("sell");
  });
});
