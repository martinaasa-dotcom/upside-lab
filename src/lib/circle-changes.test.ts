import { describe, expect, it } from "vitest";
import {
  circleChangeSentence,
  circleChanges,
  type CircleBookSnapshot,
} from "@/lib/circle-changes";
import { namedRoom, RoomNoun, roomNoun, thisRoom } from "@/lib/community-words";

const names: Record<string, string> = {
  u1: "Rasmus",
  u2: "Liisa",
  u3: "Jaan",
};
const who = (id: string) => names[id] ?? "Someone";

function book(
  rows: Array<[string, string, number]>,
  owners: Array<[string, string]> = [
    ["p1", "u1"],
    ["p2", "u2"],
  ]
): CircleBookSnapshot {
  return {
    ownership: owners.map(([portfolio_id, user_id]) => ({
      portfolio_id,
      user_id,
    })),
    holdings: rows.map(([portfolio_id, ticker, shares]) => ({
      portfolio_id,
      ticker,
      shares,
    })),
  };
}

describe("what changed since you last looked", () => {
  it("names a company bought and a company sold", () => {
    const before = book([
      ["p1", "NVDA", 10],
      ["p2", "PFE", 40],
    ]);
    const after = book([
      ["p1", "NVDA", 10],
      ["p1", "AMD", 5],
    ]);
    const out = circleChanges(before, after, who);
    // Whole companies first, then alphabetical by person, which is stable
    // across a re-render and picks no favourites.
    expect(out.map((c) => circleChangeSentence(c, (t) => `$${t}`))).toEqual([
      "Liisa sold $PFE.",
      "Rasmus bought $AMD.",
    ]);
  });

  it("says nothing at all the first time, when there is nothing to compare", () => {
    expect(circleChanges(null, book([["p1", "NVDA", 1]]), who)).toEqual([]);
  });

  /*
    The failure this would otherwise have: a cache from before somebody
    joined reads every one of their holdings as bought this week, so a new
    member's arrival prints eleven lines of news that never happened.
  */
  it("skips a person who was not in the cached copy at all", () => {
    const before = book([["p1", "NVDA", 10]], [["p1", "u1"]]);
    const after = book(
      [
        ["p1", "NVDA", 10],
        ["p3", "TSLA", 3],
        ["p3", "AAPL", 8],
      ],
      [
        ["p1", "u1"],
        ["p3", "u3"],
      ]
    );
    expect(circleChanges(before, after, who)).toEqual([]);
  });

  it("ignores a small change in the share count", () => {
    const before = book([["p1", "VOO", 100]]);
    const after = book([["p1", "VOO", 104]]);
    expect(circleChanges(before, after, who)).toEqual([]);
  });

  it("calls a real change adding to or trimming, never a share count", () => {
    const before = book([
      ["p1", "VOO", 100],
      ["p2", "AAPL", 50],
    ]);
    const after = book([
      ["p1", "VOO", 160],
      ["p2", "AAPL", 20],
    ]);
    const out = circleChanges(before, after, who);
    const lines = out.map((c) => circleChangeSentence(c, (t) => `$${t}`));
    expect(lines).toContain("Rasmus added to $VOO.");
    expect(lines).toContain("Liisa trimmed $AAPL.");
    // A number of shares is a statement about how much money somebody has.
    for (const line of lines) expect(line).not.toMatch(/\d/);
  });

  it("puts whole companies before size changes", () => {
    const before = book([
      ["p1", "VOO", 100],
      ["p2", "AAPL", 10],
    ]);
    const after = book([
      ["p1", "VOO", 200],
      ["p2", "AAPL", 10],
      ["p2", "MSFT", 4],
    ]);
    expect(circleChanges(before, after, who).map((c) => c.kind)).toEqual([
      "bought",
      "added",
    ]);
  });

  it("pools the portfolios one person owns", () => {
    const before = book(
      [["p1", "NVDA", 10]],
      [
        ["p1", "u1"],
        ["p2", "u1"],
      ]
    );
    const after = book(
      [
        ["p1", "NVDA", 10],
        ["p2", "NVDA", 10],
      ],
      [
        ["p1", "u1"],
        ["p2", "u1"],
      ]
    );
    expect(circleChanges(before, after, who).map((c) => c.kind)).toEqual([
      "added",
    ]);
  });
});

describe("one word for the room", () => {
  it("says circle for a circle and class for a class", () => {
    expect(roomNoun("circle")).toBe("circle");
    expect(roomNoun("classroom")).toBe("class");
    expect(RoomNoun("classroom")).toBe("Class");
    expect(thisRoom("classroom")).toBe("this class");
  });

  it("treats an unknown or missing kind as a circle", () => {
    expect(roomNoun(null)).toBe("circle");
    expect(roomNoun(undefined)).toBe("circle");
    expect(roomNoun("something-new")).toBe("circle");
  });

  it("prefers the room's own name when it has one", () => {
    expect(namedRoom("circle", "Aasa family")).toBe("Aasa family");
    expect(namedRoom("circle", "  ")).toBe("this circle");
    expect(namedRoom("classroom", null)).toBe("this class");
  });
});
