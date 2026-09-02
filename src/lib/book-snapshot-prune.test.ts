import { describe, expect, it } from "vitest";
import {
  PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS,
  snapshotsToPrune,
} from "@/lib/book-snapshot";

const NOW = Date.parse("2026-09-02T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function rows(ages: number[]) {
  return ages.map((days, i) => ({
    id: `s${i}`,
    created_at: new Date(NOW - days * DAY).toISOString(),
  }));
}

describe("snapshotsToPrune", () => {
  it("keeps the newest rows up to the count", () => {
    const drop = snapshotsToPrune(rows([0, 1, 2, 3]), { keep: 2, now: NOW });
    expect(drop).toEqual(["s2", "s3"]);
  });

  it("keeps everything when the count is not reached and no age is set", () => {
    const drop = snapshotsToPrune(rows([0, 400, 900]), { keep: 30, now: NOW });
    expect(drop).toEqual([]);
  });

  it("drops a row past the age even when the count has room", () => {
    const drop = snapshotsToPrune(rows([1, 29, 31, 400]), {
      keep: 30,
      maxAgeDays: PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS,
      now: NOW,
    });
    expect(drop).toEqual(["s2", "s3"]);
  });

  it("counts a row exactly on the bound as still inside it", () => {
    const drop = snapshotsToPrune(rows([PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS]), {
      keep: 30,
      maxAgeDays: PRE_DELETE_SNAPSHOT_MAX_AGE_DAYS,
      now: NOW,
    });
    expect(drop).toEqual([]);
  });

  it("names a row once when both bounds catch it", () => {
    const drop = snapshotsToPrune(rows([100, 200, 300]), {
      keep: 1,
      maxAgeDays: 30,
      now: NOW,
    });
    expect(drop).toEqual(["s0", "s1", "s2"]);
    expect(new Set(drop).size).toBe(drop.length);
  });

  it("keeps a row whose date cannot be read", () => {
    const drop = snapshotsToPrune(
      [
        { id: "a", created_at: "not a date" },
        { id: "b", created_at: null },
      ],
      { keep: 30, maxAgeDays: 30, now: NOW }
    );
    expect(drop).toEqual([]);
  });

  it("ignores a row with no id", () => {
    const drop = snapshotsToPrune(
      [{ id: null, created_at: new Date(NOW - 900 * DAY).toISOString() }],
      { keep: 0, maxAgeDays: 30, now: NOW }
    );
    expect(drop).toEqual([]);
  });
});
