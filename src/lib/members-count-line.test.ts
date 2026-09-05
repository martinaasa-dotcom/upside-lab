import { describe, expect, it } from "vitest";
import { membersCountLine } from "@/lib/members-count-line";

describe("membersCountLine", () => {
  it("counts the people in the circle", () => {
    expect(membersCountLine(15, 0)).toBe("15 people");
    expect(membersCountLine(1, 0)).toBe("1 person");
  });

  it("says the waiting in words, never as a bare number", () => {
    expect(membersCountLine(14, 1)).toBe("14 people, 1 waiting to join");
    expect(membersCountLine(3, 2)).toBe("3 people, 2 waiting to join");
  });

  it("has something to say about an empty circle", () => {
    expect(membersCountLine(0, 0)).toBe("Nobody yet");
    expect(membersCountLine(0, 1)).toBe("Nobody yet, 1 waiting to join");
  });
});
