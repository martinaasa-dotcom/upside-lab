import { describe, expect, it } from "vitest";
import {
  arrivalsLine,
  arrivalsSeenKey,
  recentArrivals,
  waitingLine,
} from "@/lib/circle-access-notice";

const NOW = Date.parse("2026-09-05T12:00:00Z");
const days = (n: number) =>
  new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const nameOf = (id: string) => ({ a: "Anu", b: "Rasmus", c: "Karoliine" })[id] ?? id;

describe("recentArrivals", () => {
  it("names the people who arrived inside the window, newest first", () => {
    const { joined, newest } = recentArrivals({
      members: [
        { user_id: "a", joined_at: days(5) },
        { user_id: "b", joined_at: days(1) },
      ],
      nameOf,
      seenThrough: null,
      now: NOW,
    });
    expect(joined.map((p) => p.name)).toEqual(["Rasmus", "Anu"]);
    expect(newest).toBe(days(1));
  });

  it("forgets an arrival older than the window", () => {
    const { joined } = recentArrivals({
      members: [{ user_id: "a", joined_at: days(90) }],
      nameOf,
      seenThrough: null,
      now: NOW,
    });
    expect(joined).toEqual([]);
  });

  it("never tells the same reader about the same arrival twice", () => {
    const { joined } = recentArrivals({
      members: [
        { user_id: "a", joined_at: days(5) },
        { user_id: "b", joined_at: days(1) },
      ],
      nameOf,
      seenThrough: days(3),
      now: NOW,
    });
    expect(joined.map((p) => p.name)).toEqual(["Rasmus"]);
  });

  it("is never news about yourself", () => {
    const { joined } = recentArrivals({
      members: [{ user_id: "a", joined_at: days(1), is_you: true }],
      nameOf,
      seenThrough: null,
      now: NOW,
    });
    expect(joined).toEqual([]);
  });

  it("ignores a stamp it cannot read rather than guessing a date", () => {
    const { joined } = recentArrivals({
      members: [{ user_id: "a", joined_at: "not a date" }],
      nameOf,
      seenThrough: null,
      now: NOW,
    });
    expect(joined).toEqual([]);
  });
});

describe("arrivalsLine", () => {
  const person = (name: string) => ({ userId: name, name, joinedAt: days(1) });

  it("says names, never a bare count", () => {
    expect(arrivalsLine([person("Anu")])).toBe("Anu joined.");
    expect(arrivalsLine([person("Anu"), person("Rasmus")])).toBe(
      "Anu and Rasmus joined."
    );
    expect(
      arrivalsLine([person("Anu"), person("Rasmus"), person("Karoliine")])
    ).toBe("Anu, Rasmus and 1 other joined.");
    expect(
      arrivalsLine([
        person("Anu"),
        person("Rasmus"),
        person("Karoliine"),
        person("Martin"),
      ])
    ).toBe("Anu, Rasmus and 2 others joined.");
  });

  it("says nothing when nobody arrived", () => {
    expect(arrivalsLine([])).toBe("");
  });
});

describe("waitingLine", () => {
  it("counts people, in words", () => {
    expect(waitingLine(1)).toBe("1 person is waiting to join.");
    expect(waitingLine(3)).toBe("3 people are waiting to join.");
  });
});

describe("arrivalsSeenKey", () => {
  it("is per circle, so one circle's news is not another's", () => {
    expect(arrivalsSeenKey("abc")).not.toBe(arrivalsSeenKey("def"));
  });
});
