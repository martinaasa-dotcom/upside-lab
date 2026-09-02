import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  explainTerm,
  glossaryEntry,
  outsideWordLine,
} from "@/lib/glossary";

/*
  A dictionary that explains one hard word with another is worse than no
  dictionary, so most of these tests are about the writing rather than the
  lookup. The ban list is the persona's own, and every entry has to survive
  being read out loud to somebody who has never bought anything.
*/
const SLANG =
  /\b(sleeve|marks|tape|dry powder|beta|risk-on|risk-off|drawdown|rotation|digestion|liquidity|alpha|moat|TAM|capex|hedged|overexposed|OTM|NAV|basis points|equity|position|cost basis|yield|volatility)\b/i;

describe("the writing", () => {
  it("says every term in two sentences a person would say out loud", () => {
    for (const entry of GLOSSARY) {
      const sentences = entry.meaning
        .split(/(?<=\.)\s+/)
        .filter((s) => s.trim().length > 0);
      expect(sentences.length, entry.id).toBeLessThanOrEqual(3);
      expect(entry.meaning.split(/\s+/).length, entry.id).toBeLessThan(50);
    }
  });

  it("never explains a word with the words this app refuses to print", () => {
    for (const entry of GLOSSARY) {
      // "cost basis" is a term people arrive with, so it is a spelling that
      // can be looked up; it is never how anything is explained.
      expect(entry.meaning, entry.id).not.toMatch(SLANG);
      expect(entry.term, entry.id).not.toMatch(SLANG);
    }
  });

  it("keeps every outside word out of the sentence that has to carry it", () => {
    /*
      `alsoCalled` is the one field allowed to print a banned word, and the
      whole of what makes that safe is that deleting it changes nothing. So
      the check is not that the word is absent, it is that the definition
      standing on its own never needed it.
    */
    for (const entry of GLOSSARY) {
      if (!entry.alsoCalled) continue;
      const bare = entry.alsoCalled.replace(/^(a|an|the|your) /, "");
      const first = bare.split(/, | and /)[0]!.toLowerCase();
      expect(entry.meaning.toLowerCase(), entry.id).not.toContain(first);
      expect(entry.term.toLowerCase(), entry.id).not.toContain(first);
    }
  });

  it("names the outside word as somebody else's, never as the app's own", () => {
    const entry = glossaryEntry("share of your portfolio")!;
    expect(outsideWordLine(entry)).toBe(
      "Elsewhere you will see this called concentration, or position size."
    );
    expect(outsideWordLine(glossaryEntry("cash"))).toBeNull();
    expect(outsideWordLine(null)).toBeNull();
  });

  it("teaches the words a reader will actually walk into", () => {
    // The point of the field is the four or five that a broker's own screen
    // prints and this app deliberately does not.
    const all = GLOSSARY.map((e) => e.alsoCalled ?? "").join(" ");
    for (const word of ["cost basis", "margin", "concentration", "volatility"]) {
      expect(all, word).toContain(word);
    }
  });

  it("carries no dash used as a clause break and no marketing vocabulary", () => {
    for (const entry of GLOSSARY) {
      expect(entry.meaning, entry.id).not.toMatch(/[—–]/);
      expect(entry.meaning, entry.id).not.toMatch(
        /\b(unlock|leverage|seamless|robust|delve|elevate|empower)\b/i
      );
    }
  });

  it("never tells anybody what to do with their money", () => {
    /*
      Describing what a broker can do to somebody is not an instruction to
      them, so the test looks for the reader being addressed rather than for
      the words buy and sell, which the honest sentences need.
    */
    for (const entry of GLOSSARY) {
      expect(entry.meaning, entry.id).not.toMatch(
        /\byou should\b|\bwe recommend\b|\b(consider|try) (buying|selling)\b|\bworth (buying|selling)\b/i
      );
      for (const sentence of entry.meaning.split(/(?<=\.)\s+/)) {
        expect(sentence.trim(), entry.id).not.toMatch(
          /^(Buy|Sell|Hold|Add|Trim|Avoid|Keep buying)\b/
        );
      }
    }
  });

  it("has one entry per idea and no two terms colliding", () => {
    const ids = GLOSSARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = GLOSSARY.flatMap((e) => [
      e.term.toLowerCase(),
      ...(e.also ?? []).map((a) => a.toLowerCase()),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("looking a word up", () => {
  it("finds a term by its id, its printed word, or a spelling somebody arrives with", () => {
    expect(glossaryEntry("paid-each")!.id).toBe("paid-each");
    expect(glossaryEntry("Paid each")!.id).toBe("paid-each");
    expect(glossaryEntry("cost basis")!.id).toBe("paid-each");
    expect(glossaryEntry("  ROI ")!.id).toBe("gain");
  });

  it("answers null for a word it does not have, rather than guessing", () => {
    expect(glossaryEntry("sharpe ratio")).toBeNull();
    expect(explainTerm("nothing at all")).toBeNull();
  });
});

describe("the reader's own numbers", () => {
  it("says the idea again with their figures in it", () => {
    const answer = explainTerm("gain", {
      ticker: "$AAPL",
      amount: "$1,180",
      second: "28%",
    })!;
    expect(answer.term).toBe("Gain");
    expect(answer.example).toBe("On $AAPL that is $1,180, or 28% of what you paid.");
  });

  it("leaves the example out rather than inventing a figure", () => {
    expect(explainTerm("gain")!.example).toBeNull();
    expect(explainTerm("value", { ticker: "$AAPL" })!.example).toBeNull();
    expect(explainTerm("dividend", { amount: "$12" })!.example).toBeNull();
  });

  it("counts one share as a share", () => {
    expect(explainTerm("share", { ticker: "$AAPL", count: 1 })!.example).toBe(
      "You hold 1 share of $AAPL."
    );
    expect(explainTerm("share", { ticker: "$AAPL", count: 12 })!.example).toBe(
      "You hold 12 shares of $AAPL."
    );
  });
});
