import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  A portfolio is called a portfolio in the documentation too.

  `reader-copy.test.ts` holds that line inside src/, by reading JSX text
  nodes. It stops at the repository's own prose, and that is where the old
  wording had quietly survived: the README opened with "See what your book
  did" months after the rename, and four reference docs still described
  somebody's "book" to anybody who opened them. A README is the first page
  a stranger reads about this product, so it is reader-facing by any
  reasonable definition of the phrase.

  The check strips code before it looks. Every name the rename deliberately
  kept -- `portfell_book_snapshots`, `book-snapshots`, `book-shock.ts`,
  `/api/book/nav-history`, `/api/communities/[id]/sheets` -- is written in
  backticks wherever it appears in these files, because it is an
  identifier, and an identifier in prose belongs in code style anyway. So
  stripping code spans is not a loophole in the rule, it is the rule: what
  is left after the strip is exactly the English a person reads.
*/

/** Files whose prose describes the app as it is today. */
const CHECKED = [
  "README.md",
  "CLAUDE.md",
  "docs/AUTH_AND_COMMUNITIES.md",
  "docs/UPSIDE_LAB_CUTOVER.md",
  "docs/COOKIES.md",
  "docs/DISASTER_RECOVERY.md",
  "docs/STRIPE_BILLING.md",
  "docs/ZERO_DOWNTIME_MIGRATIONS.md",
  "docs/BRAND_MARK.md",
  "docs/MVP_AUDIT_LIVE_PASS.md",
];

/*
  Files deliberately not checked, and why. This list is short on purpose
  and each entry is an argument, not a parking space.

  - AGENTS.md states the ban, so it has to name the words being banned. A
    guard that failed on the rule's own text would make the rule
    unwritable. CLAUDE.md is not here: it is one line importing AGENTS.md,
    so it has nothing to exempt and is checked like anything else.
  - DESIGN_TOKENS.md carries a verbatim quote from Martin that uses
    "sheets", and a passage about two literal "sheets of glass" stacked in
    the old dock. Neither is the portfolio sense, and neither may be
    rewritten: one is somebody's own words and the other is a material.
  - Three of the MVP_AUDIT_*.md files are dated records of a pass run on a
    given day rather than descriptions of the app today, and each quotes
    the old wording while explaining something. The fourth, the live pass,
    is already clean and so is checked: an exemption nothing needs is an
    exemption that rots.
*/
const NOT_CHECKED = [
  "AGENTS.md",
  "DESIGN_TOKENS.md",
  "docs/MVP_AUDIT_STATUS.md",
  "docs/MVP_AUDIT_FEATURE_PASS.md",
  "docs/MVP_AUDIT_TECHNICAL_PASS.md",
];

const BANNED = /\b(books?|sheets?)\b/i;

/**
 * The English in a markdown file: fenced blocks, inline code and link
 * targets removed, so only what a person actually reads is left.
 */
export function prose(file: string): { line: number; text: string }[] {
  const raw = readFileSync(file, "utf8");
  const stripped = raw
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  return stripped
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => text.trim() !== "");
}

describe("the documentation calls a portfolio a portfolio", () => {
  for (const file of CHECKED) {
    it(`${file} says portfolio, never book or sheet`, () => {
      const offenders = prose(file)
        .filter(({ text }) => BANNED.test(text))
        .map(({ line, text }) => `${file}:${line}: ${text.trim()}`);
      expect(offenders).toEqual([]);
    });
  }

  /*
    A check that reads nothing passes for the wrong reason. These assert
    the stripper hands back real sentences, and that it really does drop
    the identifiers the rename kept rather than simply never seeing them.
  */
  it("reads the prose and not the code around it", () => {
    const readme = prose("README.md");
    expect(readme.length).toBeGreaterThan(20);
    expect(readme.some((l) => l.text.includes("Not financial advice"))).toBe(
      true
    );
    expect(readme.some((l) => l.text.includes("npm install"))).toBe(false);

    const dr = prose("docs/DISASTER_RECOVERY.md");
    expect(dr.some((l) => l.text.includes("portfell_book_snapshots"))).toBe(
      false
    );
  });

  /*
    The exclusion list has to stay honest the way ALLOWED does next door:
    a file named here that no longer contains the wording has stopped
    needing the exemption, and should be checked rather than skipped.
  */
  it("skips only files that really do need the words", () => {
    const pointless = NOT_CHECKED.filter(
      (file) => !prose(file).some(({ text }) => BANNED.test(text))
    );
    expect(pointless).toEqual([]);
  });
});
