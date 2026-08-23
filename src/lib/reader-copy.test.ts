import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Nothing a reader sees may contain an em dash or an en dash.

  Not a style preference. A dash used as a clause break is the single
  loudest tell that a sentence was generated rather than written, and this
  app's whole voice is a person explaining their own product. Model output
  was always covered: `stripAiDashes` runs over everything Margus writes.
  Hand-written copy had no guard at all, which is exactly where they had
  collected.

  This used to walk a short list of onboarding files. It now walks the whole
  of src/, because a rule that only holds on the screens somebody remembered
  to list is a rule that decays. The list below is the exceptions, and every
  one of them has a reason next to it.
*/

const EM = "—";
const EN = "–";

/**
 * Files allowed to contain a dash, and why.
 *
 * Every entry here is a place where the character is data rather than
 * copy: something matched against, something stripped out, or something
 * parsed. Adding to this list means arguing that a reader still cannot see
 * it. It is not a place to park copy that has not been fixed yet.
 */
const ALLOWED = new Map<string, string>([
  [
    "src/lib/ai/humanize-copy.ts",
    "Defines the characters it strips out of model output. Removing them here removes the stripper.",
  ],
  [
    "src/lib/ai/margus-persona.ts",
    "Names the character in the Voice rules so the model knows which one is banned.",
  ],
  [
    "src/lib/forecast-conviction.ts",
    "Same: names the character in the forecast prompt's ban list.",
  ],
  [
    "src/lib/plain-error.ts",
    "One map key, matched against a string the server sends. Rewriting it stops it matching and the reader gets the raw error instead. Nothing renders the key.",
  ],
  [
    "src/components/ForecastPanel.tsx",
    "A character class in a regex that parses a year range out of incoming data (2028-2029 / 2028–2029). It reads dashes, it never writes one.",
  ],
]);

/**
 * Strip a trailing `//` comment, without cutting inside a string.
 *
 * A naive `indexOf("//")` eats the rest of any line containing a URL, which
 * would quietly hide real copy from this check rather than fail on it. So
 * this walks the line and only treats `//` as a comment when it is outside
 * every kind of quote.
 */
function stripTrailingComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!;
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

/**
 * Lines a reader could see: not `//`, not a block comment, not `{/* *\/}`.
 *
 * Comments are for whoever maintains this and may punctuate however they
 * like. The rule is about the product, not the source.
 */
function readerFacingLines(file: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let inBlock = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((raw, i) => {
      const t = raw.trim();
      if (inBlock) {
        if (t.includes("*/")) inBlock = false;
        return;
      }
      if (t.startsWith("/*") || t.startsWith("{/*")) {
        if (!t.includes("*/")) inBlock = true;
        return;
      }
      if (t.startsWith("//") || t.startsWith("*")) return;
      out.push({ line: i + 1, text: stripTrailingComment(raw) });
    });
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      /*
        Test files are excluded on purpose. No test renders to anybody: a
        dash in an `it(...)` title is read by whoever is debugging it, which
        makes it source, and source is exempt. Excluding them is also what
        lets the guards that must name the character (this file, and the
        screenshot-import copy check) stay out of the exception list.
      */
      !/\.test\.tsx?$/.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("copy reads as a person wrote it", () => {
  const files = sourceFiles("src");

  it("finds the source tree it is supposed to be checking", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("src/lib/welcome-tour.ts");
    expect(files).toContain("src/components/WelcomeTour.tsx");
  });

  it("has no em dash a reader could see, anywhere in src", () => {
    const bad = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        readerFacingLines(f)
          .filter((l) => l.text.includes(EM))
          .map((l) => `${f}:${l.line}: ${l.text.trim()}`)
      );
    expect(bad).toEqual([]);
  });

  it("has no en dash a reader could see, anywhere in src", () => {
    const bad = files
      .filter((f) => !ALLOWED.has(f))
      .flatMap((f) =>
        readerFacingLines(f)
          .filter((l) => l.text.includes(EN))
          .map((l) => `${f}:${l.line}: ${l.text.trim()}`)
      );
    expect(bad).toEqual([]);
  });

  /*
    An exception that no longer contains a dash is an exception somebody can
    delete, and one that names a file that has moved is a hole in the rule
    nobody can see. Both are worth failing over.
  */
  it("keeps the exception list honest", () => {
    for (const [file, why] of ALLOWED) {
      expect(files, `${file} is in ALLOWED but not in src`).toContain(file);
      const text = readFileSync(file, "utf8");
      expect(
        text.includes(EM) || text.includes(EN),
        `${file} no longer has a dash, so drop it from ALLOWED (${why})`
      ).toBe(true);
    }
  });

  /*
    The detector has to actually detect. A test that passes because it is
    looking at nothing is the failure mode this whole file exists to avoid.
  */
  it("reads real lines, and ignores comments", () => {
    const lines = readerFacingLines("src/lib/welcome-tour.ts");
    expect(lines.length).toBeGreaterThan(50);
    expect(lines.some((l) => l.text.includes("WELCOME_TOUR_VERSION"))).toBe(true);
    expect(lines.some((l) => l.text.includes("Raise this by one"))).toBe(false);
  });
});
