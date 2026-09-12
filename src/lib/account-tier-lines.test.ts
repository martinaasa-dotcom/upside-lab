import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { tierChangeLine, tierChatLine } from "@/lib/account-copy";
import { EXPERIENCE_TIERS } from "@/lib/experience-tier";

const advisor = readFileSync(
  join(process.cwd(), "src/lib/ai/cc-advisor.ts"),
  "utf8"
);

/*
  THE QUESTION MUST NOT HAVE TWO ANSWERS THAT SAY THE SAME THING.

  Account asks how much of the app to show and prints, under each answer,
  what picking it does. Those lines are derived from the tier gate tables so
  they cannot describe an old arrangement -- and every gate table is now
  empty on every tier, with the only room-level consumer left being
  `tier !== "novice"`. So "Comfortable investor" and "Very experienced"
  produced the same sentence word for word, and a reader choosing between
  them was told the app would behave identically either way.

  The difference is real and lives in the chat prompt: each tier gets its
  own paragraph telling Margus how much to explain. That is what the page
  says now, and this is what keeps it true.
*/
describe("each experience answer says something different", () => {
  it("gives every tier its own line", () => {
    const lines = EXPERIENCE_TIERS.map((t) => tierChangeLine(t.id));
    expect(new Set(lines).size, `two answers read the same:\n${lines.join("\n")}`)
      .toBe(EXPERIENCE_TIERS.length);
  });

  it("gives every tier its own chat line", () => {
    const lines = EXPERIENCE_TIERS.map((t) => tierChatLine(t.id));
    expect(new Set(lines).size).toBe(EXPERIENCE_TIERS.length);
  });

  it("only claims a difference the advisor actually makes", () => {
    /*
     * The chat line is a description of `readerBriefing`, which is a prompt
     * and so cannot be read back as prose. What can be checked is that the
     * prompt still branches on all three tiers: the moment it stops, the
     * page is claiming a difference that no longer exists and this fails
     * rather than going quietly stale.
     */
    for (const tier of EXPERIENCE_TIERS) {
      expect(
        advisor.includes(`answer === "${tier.id}"`) || tier.id === "novice",
        `cc-advisor.ts no longer writes differently for "${tier.id}", so ` +
          `Account must stop saying it does`
      ).toBe(true);
    }
    // The novice branch is the fallthrough above those two, so it is checked
    // by the paragraph it owns rather than by a comparison.
    expect(advisor).toMatch(/told us they are new to investing/);
  });

  it("names Margus in the chat line, since that is what differs", () => {
    for (const tier of EXPERIENCE_TIERS) {
      expect(tierChatLine(tier.id)).toMatch(/Margus/);
    }
  });
});
