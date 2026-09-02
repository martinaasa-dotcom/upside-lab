import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GLOSSARY, explainTerm } from "@/lib/glossary";

/*
  There is no jsdom in this repo, so the rendering is checked the way the
  other component rules here are: by reading the source for the decisions
  that would be expensive to get wrong. The content itself is a pure
  function and is tested properly in `glossary.test.ts`.
*/
const source = readFileSync(
  join(process.cwd(), "src/components/ui/Explain.tsx"),
  "utf8"
);

describe("where the words come from", () => {
  it("reads the glossary and never takes text from a call site", () => {
    // The whole reason this exists beside InfoTip, which takes a string.
    expect(source).toContain('from "@/lib/glossary"');
    expect(source).not.toMatch(/\btext\?:\s*string/);
  });

  it("says nothing at all for a word the glossary does not have", () => {
    expect(explainTerm("sortino ratio")).toBeNull();
    expect(source).toContain("if (!entry) return <>{children ?? null}</>;");
  });

  it("answers every spelling the app is likely to ask it for", () => {
    for (const key of [
      "share of your portfolio",
      "cost basis",
      "% of portfolio",
      "margin",
      "etf",
      "roi",
      "why you own it",
    ]) {
      expect(explainTerm(key), key).not.toBeNull();
    }
  });

  it("puts the reader's own figures in, and nothing when it has none", () => {
    const withFigures = explainTerm("paid each", {
      ticker: "$AAPL",
      amount: "$168.40",
    })!;
    expect(withFigures.example).toBe("On $AAPL that average is $168.40 a share.");
    expect(explainTerm("paid each")!.example).toBeNull();
  });
});

describe("the shape", () => {
  it("is a popover at every width, unlike the provenance eye", () => {
    /*
      Not an inconsistency with WhyThis, which is a bottom sheet below md.
      That surface is about four screens of content on a phone. This one is
      two sentences and two short lines, and a sheet for that would cover
      the figure the reader is asking about.
    */
    expect(source).not.toContain("SheetContent");
    expect(source).toContain("PopoverContent");
  });

  it("gives a finger a real target without growing the glyph", () => {
    expect(source).toContain("-inset-3.5");
  });

  it("does not open whatever row it happens to be sitting in", () => {
    expect(source).toContain("onClick={(e) => e.stopPropagation()}");
  });

  it("names the word for somebody who cannot see the glyph", () => {
    expect(source).toContain("aria-label={label}");
    expect(source).toContain("What does ${entry.term.toLowerCase()} mean?");
  });
});

describe("what a reader is never shown", () => {
  it("carries no copy of its own that could drift from the glossary", () => {
    // Every sentence in the panel is an `entry.*`, so there is no second
    // place for the same word to be explained differently.
    const panel = source.slice(source.indexOf("<PopoverContent"));
    const prose = panel.match(/>[^<>{}\n]{12,}</g) ?? [];
    expect(prose).toEqual([]);
  });

  it("uses no dash as a clause break anywhere in the glossary it draws", () => {
    for (const entry of GLOSSARY) {
      expect(entry.alsoCalled ?? "", entry.id).not.toMatch(/[—–]/);
    }
  });
});
