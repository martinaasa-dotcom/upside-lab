import { describe, expect, it } from "vitest";

import {
  buildLearnedRecord,
  learnedLead,
  recordIsEmpty,
  settledLine,
} from "@/lib/learned";
import { LAST_BOX } from "@/lib/recall-deck";
import type { WordsLookedUp } from "@/lib/words-looked-up";

function words(...rows: [string, string, number][]): WordsLookedUp {
  const out: WordsLookedUp = {};
  for (const [id, last, times] of rows) {
    out[id] = { id, first: last, last, times };
  }
  return out;
}

describe("the learning record", () => {
  it("counts only what the reader actually did", () => {
    const record = buildLearnedRecord({
      words: words(["cash", "2026-09-01", 1], ["borrowed", "2026-09-08", 3]),
      deck: {
        "a": { box: 1, due: "2026-09-09" },
        "b": { box: LAST_BOX, due: "2026-11-01" },
      },
    });
    expect(record.words.length).toBe(2);
    expect(record.answered).toBe(2);
    expect(record.settled).toBe(1);
  });

  it("puts the most recently read word first", () => {
    // The one still being chewed on is the one to put in front of them.
    const record = buildLearnedRecord({
      words: words(["cash", "2026-09-01", 1], ["borrowed", "2026-09-08", 1]),
      deck: {},
    });
    expect(record.words.map((w) => w.id)).toEqual(["borrowed", "cash"]);
  });

  it("draws nothing until something has been opened or answered", () => {
    /*
      An empty version of this panel is a room telling somebody on day one
      what they have not done yet.
    */
    expect(
      recordIsEmpty(buildLearnedRecord({ words: {}, deck: {} }))
    ).toBe(true);
    expect(
      recordIsEmpty(
        buildLearnedRecord({ words: words(["cash", "2026-09-01", 1]), deck: {} })
      )
    ).toBe(false);
  });

  it("never praises, never sets a target, never prints a total", () => {
    /*
      The rule the whole module exists behind. "You are getting the hang of
      this" is unfalsifiable and unearned, a streak is a reason to open a
      price app on a day with nothing in it, and a bar out of a total needs
      a denominator that would be this app's opinion about how much
      somebody ought to know.
    */
    const record = buildLearnedRecord({
      words: words(["cash", "2026-09-01", 1], ["gain", "2026-09-02", 1]),
      deck: { a: { box: LAST_BOX, due: "2026-11-01" } },
    });
    const copy = [learnedLead(record), settledLine(record) ?? ""].join(" ");
    for (const banned of [
      "well done",
      "great",
      "keep it up",
      "streak",
      "unlocked",
      "level",
      "badge",
      "congrat",
      "getting the hang",
      "out of",
      "%",
    ]) {
      expect(copy.toLowerCase()).not.toContain(banned);
    }
  });

  it("says nothing about questions that have not come back yet", () => {
    /*
      The deck's widest gap is two months, so a reader in their first week
      cannot have any. A "0 came back" line reads as a failure at exactly
      the moment nothing has failed.
    */
    const fresh = buildLearnedRecord({
      words: {},
      deck: { a: { box: 1, due: "2026-09-09" } },
    });
    expect(settledLine(fresh)).toBeNull();
  });

  it("reads as a sentence for one of each", () => {
    const one = buildLearnedRecord({
      words: words(["cash", "2026-09-01", 1]),
      deck: { a: { box: 1, due: "2026-09-09" } },
    });
    expect(learnedLead(one)).toBe("You have looked up 1 word and 1 question.");

    const wordsOnly = buildLearnedRecord({
      words: words(["cash", "2026-09-01", 1], ["gain", "2026-09-02", 1]),
      deck: {},
    });
    expect(wordsOnly).toBeTruthy();
    expect(learnedLead(wordsOnly)).toBe("You have looked up 2 words.");
  });
});
