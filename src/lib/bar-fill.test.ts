import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { barFillPct } from "@/lib/format";

/*
  A bar's fill must never be able to paint past its own box.

  "The business" panel drew a period's profit as a percentage of that
  period's revenue: `width: ${(profit / peak) * 100}%`, with `peak` the
  largest revenue among the periods shown. That is safe exactly as long as
  nothing filled inside a bar can exceed the value that set the bar's own
  scale — and the moment it draws a *different* quantity than the one the
  peak was built from, that stops being guaranteed. BitMine (BMNR) reported
  2025 net income of $328.2 million against $6.1 million of revenue: real,
  checkable numbers, a company marking crypto held on its balance sheet
  through net income. The bar's fill computed to `width: 5384%`, which is
  not a rounding error, it is a `style` attribute nothing refuses, so the
  green fill painted straight across the panel and off the edge of the
  screen, dragging the dock and everything below it out of place.

  `barFillPct` is the fix, and this file is what keeps it a fix rather
  than a patch on one component: every place in `src/` that turns a
  computed ratio into a `width: N%` bar fill is walked here, and each one
  must either route through `barFillPct` (directly, or through a variable
  that was itself assigned from it) or be named in `ALLOWED` with the
  reason its own arithmetic cannot exceed 100 by construction. A new bar
  added without either fails this test instead of shipping to a screen.
*/

/**
 * Sites allowed to compute a bar-fill width without `barFillPct`, and why.
 *
 * Every entry here is a fill whose own arithmetic cannot exceed the track
 * it draws on, because it is built from the same bounded scale (an index
 * position already clamped to 0-100, or two ends each individually
 * clamped before the width is their difference). Adding to this list
 * means arguing that the specific expression can never exceed 100 no
 * matter what the data does — not that it happens not to today.
 */
const ALLOWED = new Map<string, string>([
  [
    "src/components/MarketSentimentViz.tsx:455",
    "layout.streak.x0/x1 are day-index positions on the spark's own 0-100 axis, from sentimentSparkLayout, never a ratio of an unrelated quantity.",
  ],
  [
    "src/components/MarketSentimentViz.tsx:464",
    "Same axis as the streak band above, for the ghost projection.",
  ],
  [
    "src/components/MarketSentimentViz.tsx:507",
    "stretch.fillPct comes from stretchFillPct(), which clamps to [FILL_FLOOR, FILL_CEILING] at the source.",
  ],
  [
    "src/components/MarketSentimentViz.tsx:538",
    "fill.fromPct and fill.toPct are each clamped to [0, 100] individually in market-sentiment-viz.ts before the width is their difference.",
  ],
  [
    "src/components/SeasonalityPage.tsx:282",
    "barW = (Math.abs(returnPct) / maxAbs) * 50, and maxAbs is Math.max(...) over the exact same returnPct values being drawn, so no bar can outrun it.",
  ],
  [
    "src/components/SeasonalityPage.tsx:283",
    "Same barW as the row above, mirrored to the other side of the zero line.",
  ],
  [
    "src/components/company/ValueGlance.tsx:251",
    "at(low) and at(high) are computed from a from/span that is built from Math.min/Math.max over {low, high, spot, blend} plus padding, so both ends fall inside the drawn scale by construction.",
  ],
  [
    "src/components/company/ValueGlance.tsx:440",
    "width is Math.min(Math.abs(gap) / 0.6, 1) * 50, already capped at 50 before Math.max(width, 1.5) only raises a floor.",
  ],
]);

/** A bare identifier: `foo`, `someWidth`. Not an expression. */
function isBareIdentifier(expr: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr.trim());
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

type Site = { file: string; line: number; expr: string };

/** Every `width: \`${EXPR}%\`` bar-fill site across `src/`. */
function barFillSites(): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles("src")) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/width:\s*`\$\{([^}]*)\}%`/);
      if (m) sites.push({ file, line: i + 1, expr: m[1]!.trim() });
    });
  }
  return sites;
}

/** Whether `identifier` was assigned in `file` from a `barFillPct(` call. */
function identifierIsClamped(file: string, identifier: string): boolean {
  const text = readFileSync(file, "utf8");
  const re = new RegExp(
    `(?:const|let)\\s+${identifier}\\s*=\\s*barFillPct\\(`
  );
  return re.test(text);
}

describe("barFillPct clamps a fill to the box it draws in", () => {
  it("never exceeds 100 however far the input runs", () => {
    expect(barFillPct(5384.1)).toBe(100);
    expect(barFillPct(Infinity)).toBe(100);
    expect(barFillPct(1e9)).toBe(100);
  });

  it("never drops below the floor it is given", () => {
    expect(barFillPct(-40)).toBe(0);
    expect(barFillPct(-40, 1.5)).toBe(1.5);
    expect(barFillPct(0, 1)).toBe(1);
  });

  it("passes through an ordinary value unchanged", () => {
    expect(barFillPct(42)).toBe(42);
    expect(barFillPct(0)).toBe(0);
    expect(barFillPct(100)).toBe(100);
  });

  it("treats a non-finite input as the floor, never as NaN or Infinity", () => {
    expect(barFillPct(null)).toBe(0);
    expect(barFillPct(undefined)).toBe(0);
    expect(barFillPct(NaN)).toBe(0);
    expect(barFillPct(NaN, 1.5)).toBe(1.5);
  });

  it("reproduces the BMNR fault and confirms it cannot happen again", () => {
    // 2025: $6.1 million revenue, $328.2 million net income (crypto marks).
    const peak = 6.1;
    const profit = 328.2;
    const rawWidth = (profit / peak) * 100; // 5384.1..., the unclamped fault.
    expect(rawWidth).toBeGreaterThan(5000);
    expect(barFillPct(rawWidth)).toBe(100);
  });
});

describe("every bar-fill width in src/ stays inside its own box", () => {
  const sites = barFillSites();

  it("found bar-fill sites to check (the scan itself did not break)", () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  for (const site of sites) {
    const key = `${site.file}:${site.line}`;
    it(`${key}: \`${site.expr}\` is clamped or explicitly justified`, () => {
      const direct = site.expr.includes("barFillPct(");
      const viaVariable =
        isBareIdentifier(site.expr) &&
        identifierIsClamped(site.file, site.expr);
      const allowedReason = ALLOWED.get(key);
      if (!direct && !viaVariable && !allowedReason) {
        throw new Error(
          `${key} computes a bar-fill width ("${site.expr}") without ` +
            `routing through barFillPct(), and is not in this file's ` +
            `ALLOWED list. Wrap it in barFillPct(), or add an entry to ` +
            `ALLOWED arguing the arithmetic can never exceed 100.`
        );
      }
      expect(allowedReason === undefined || allowedReason.length > 0).toBe(
        true
      );
    });
  }

  it("keeps ALLOWED honest: every entry still names a real, unclamped site", () => {
    const liveKeys = new Set(sites.map((s) => `${s.file}:${s.line}`));
    for (const key of ALLOWED.keys()) {
      expect(liveKeys.has(key)).toBe(true);
    }
  });
});

describe("the business panel's money bar cannot overflow its own row", () => {
  const source = readFileSync("src/components/company/BusinessPanel.tsx", "utf8");

  it("clamps both the revenue and profit fills through barFillPct", () => {
    expect(source).toMatch(
      /const revenueWidth = barFillPct\(/
    );
    expect(source).toMatch(/const profitWidth = barFillPct\(/);
  });

  it("clips the bar's own container as a backstop", () => {
    const barRow = source.slice(
      source.indexOf("relative h-7 w-full"),
      source.indexOf("relative h-7 w-full") + 40
    );
    expect(barRow).toContain("overflow-hidden");
  });
});
