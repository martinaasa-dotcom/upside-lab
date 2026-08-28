import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OG_CARD_LINE,
  PRODUCT_HEADLINE,
  PRODUCT_SENTENCE,
} from "@/lib/product";

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

  /*
    The social card is painted from a Node script, not from src/, and the
    GitHub README is the other page a stranger reads before the app. Both
    were outside the walk that used to live here, which is how an em dash
    sat on og.png while every screen in src/ was clean.
  */
  const EXTRA = ["scripts/generate-pwa-icons.mjs", "README.md"];

  it("finds the source tree it is supposed to be checking", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("src/lib/welcome-tour.ts");
    expect(files).toContain("src/components/WelcomeTour.tsx");
    expect(files).toContain("src/lib/product.ts");
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

  it("has no em or en dash on the social card, or in the README", () => {
    const bad = EXTRA.flatMap((f) =>
      readerFacingLines(f)
        .filter((l) => l.text.includes(EM) || l.text.includes(EN))
        .map((l) => `${f}:${l.line}: ${l.text.trim()}`)
    );
    expect(bad).toEqual([]);
  });

  it("paints the social card from product copy, never a hardcoded line", () => {
    const src = readFileSync("scripts/generate-pwa-icons.mjs", "utf8");
    expect(src).toContain("${PRODUCT_HEADLINE[0]}");
    expect(src).toContain("${PRODUCT_HEADLINE[1]}");
    expect(src).toContain("${OG_CARD_LINE}");
    expect(src).not.toMatch(/[\u2014\u2013]/);
    expect(PRODUCT_HEADLINE).toHaveLength(2);
    expect(PRODUCT_SENTENCE).toBe(PRODUCT_HEADLINE.join(" "));
    expect(OG_CARD_LINE).not.toMatch(/[\u2014\u2013]/);
    expect(OG_CARD_LINE.startsWith("Upside Lab.")).toBe(true);
  });

  /*
    Same argument as the dash: a brochure word on a public surface is how
    the product starts sounding generated. The sanitizer already strips
    these out of Margus. This is the hand-written side.
  */
  it("does not use brochure words on public surfaces", () => {
    const brochure =
      /\b(delve|testament|groundbreaking|seamless|cutting-edge|harness|navigating|empower)\b/i;
    const publicCopy = [
      "src/lib/product.ts",
      "src/lib/welcome-tour.ts",
      "src/lib/disclaimer.ts",
      "src/lib/email-letter.ts",
      "src/components/SignedOutLanding.tsx",
      "src/components/SignInGate.tsx",
      "src/components/WelcomeTour.tsx",
      "README.md",
      "scripts/generate-pwa-icons.mjs",
    ];
    const bad = publicCopy.flatMap((f) =>
      readerFacingLines(f)
        .filter((l) => brochure.test(l.text))
        .map((l) => `${f}:${l.line}: ${l.text.trim()}`)
    );
    expect(bad).toEqual([]);
  });

  /*
    Desk vocabulary, on any surface a reader meets.

    Same argument as the dash and the brochure words, one level down: those
    two catch a sentence that reads as generated, and this catches one that
    reads as overheard. A copy pass in 2026-08 found "Rates +75 bps",
    "Semis / lithography", "US large-cap index (UCITS)", "called away",
    "at write level", "no take-backs" and "a chunk of that run is in play"
    sitting on ordinary screens, several of them on the labels a reader
    meets most often, because they had been written by somebody who knows
    what they mean for somebody who does not.

    Every word here is one a reader would have to look up, and every one of
    them has a plain replacement that fits in the same space. The rule in
    AGENTS.md is that a grandmother gets every sentence.

    `NAMES_THE_WORD` is the exception list and it is short on purpose: a
    prompt has to be able to tell the model which words are banned, and a
    sanitizer has to be able to match them. Those two jobs are the only
    reason to write one of these down. A new entry means arguing that
    nothing on a screen renders it, exactly as with the dash list above.
  */
  const DESK_JARGON =
    /\b(bps|HYSA|UCITS|DXY|neo-cloud|observability|desynced|take-backs|word vomit|dry powder|sleeves?|risk-on|risk-off|drawdowns?|called away|write level|moves the needle|in play|large-cap|small-cap)\b/i;

  const NAMES_THE_WORD = new Set([
    // Prompts: the model is told which words it may not use.
    "src/lib/ai/margus-persona.ts",
    "src/lib/ai/cc-advisor.ts",
    "src/lib/weekly-margus.ts",
    "src/lib/forecast-plan.ts",
    "src/lib/forecast-plan-schema.ts",
    "src/lib/book-insights.ts",
    // Sanitizer: it matches these to rewrite them out of model output.
    "src/lib/ai/humanize-copy.ts",
  ]);

  it("does not use desk vocabulary on a screen", () => {
    const bad = files
      .filter((f) => !NAMES_THE_WORD.has(f))
      .flatMap((f) =>
        readerFacingLines(f)
          .filter((l) => DESK_JARGON.test(l.text))
          .map((l) => `${f}:${l.line}: ${l.text.trim()}`)
      );
    expect(bad).toEqual([]);
  });

  it("keeps the desk-vocabulary exception list honest", () => {
    for (const file of NAMES_THE_WORD) {
      expect(files, `${file} is in NAMES_THE_WORD but not in src`).toContain(
        file
      );
      expect(
        readerFacingLines(file).some((l) => DESK_JARGON.test(l.text)),
        `${file} no longer names one of these words, so drop it from the list`
      ).toBe(true);
    }
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
    A portfolio is called a portfolio.

    The rename was declared done and then drifted: "New sheet" sat in the
    portfolio picker's own menu, the account screen offered to delete your
    "sheets", the terms gave a class an empty "sheet", and two error
    screens promised your "book" was safe. Every one of them was a string
    somebody read on a screen.

    This reads JSX text nodes only, which is a floor rather than a ceiling.
    It does not see a label passed as a prop or a sentence built in a
    variable, and widening it past that produced more noise than signal:
    the tree is full of `sheet` identifiers the rename deliberately kept
    (the `Sheet` slide-over primitive, `portfell_*` columns, the
    `?sheet=` bookmark parameter, `restore_sheet`, `sheetCount`). What it
    does catch is the case that actually recurred, which is somebody typing
    the old word straight into the markup.
  */
  const CODE_ISH = /[;={}\[\]|]|=>|\.\w|\w\(/;

  function jsxText(file: string): { line: number; text: string }[] {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => (l.trim().startsWith("//") ? "" : l))
      .join("\n");
    const out: { line: number; text: string }[] = [];
    for (const m of src.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1]!.replace(/\s+/g, " ").trim();
      if (!text.includes(" ")) continue;
      if (!/[A-Za-z]/.test(text)) continue;
      if (CODE_ISH.test(text)) continue;
      out.push({ line: src.slice(0, m.index).split("\n").length, text });
    }
    return out;
  }

  it("calls a portfolio a portfolio on screen, never a sheet or a book", () => {
    const bad = files
      .filter((f) => f.endsWith(".tsx") && f !== "src/components/ui/sheet.tsx")
      .flatMap((f) =>
        jsxText(f)
          .filter((l) => /\b(sheets?|books?)\b/i.test(l.text))
          .map((l) => `${f}:${l.line}: ${l.text}`)
      );
    expect(bad).toEqual([]);
  });

  /*
    Same argument as the dash detector: a check that reads nothing passes
    for the wrong reason. These are two sentences that are really in the
    tree, and one that is really a type annotation rather than copy.
  */
  it("reads what a person sees, and not the code around it", () => {
    const account = jsxText("src/components/AccountPage.tsx");
    expect(account.some((l) => l.text.includes("Download everything"))).toBe(true);
    expect(account.some((l) => /Record</.test(l.text))).toBe(false);
    expect(
      jsxText("src/components/SheetPicker.tsx").some((l) =>
        l.text.includes("New portfolio")
      )
    ).toBe(true);
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
