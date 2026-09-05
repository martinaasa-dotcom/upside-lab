import { describe, expect, it } from "vitest";
import { membersTabLabel } from "@/lib/members-tab-label";

describe("membersTabLabel", () => {
  it("counts the members, not the join requests", () => {
    // A circle of fourteen with one person waiting used to read
    // "Members · 1", which a reader took for the roster.
    expect(membersTabLabel(14, 0)).toBe("Members · 14");
    expect(membersTabLabel(14, 1)).not.toBe("Members · 1");
    expect(membersTabLabel(14, 1)).toContain("Members · 14");
  });

  it("says a waiting request in words", () => {
    expect(membersTabLabel(14, 1)).toBe("Members · 14, 1 waiting");
    expect(membersTabLabel(3, 2)).toBe("Members · 3, 2 waiting");
  });

  it("carries no number before the roster has loaded", () => {
    expect(membersTabLabel(0, 0)).toBe("Members");
    expect(membersTabLabel(0, 1)).toBe("Members, 1 waiting");
  });
});
