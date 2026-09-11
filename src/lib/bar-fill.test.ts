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
  computed ratio into a `width: N%` or `height: N%` bar fill is walked
  here, and each one must either route through `barFillPct` (directly, or
  through a variable that was itself assigned from it) or be named in
  `ALLOWED` with the reason its own arithmetic cannot exceed 100 by
  construction. A new bar added without either fails this test instead of
  shipping to a screen. `height` is covered for the same reason `width`
  is: a vertical bar (the seasonality chart's monthly columns) is the same
  fault rotated 90 degrees, and a ratio that can run away does not care
  which axis it is drawn on.

  `<Progress value={...}>` (`src/components/ui/progress.tsx`) is the same
  fault through a different door: its indicator is
  `translateX(-${100 - value}%)`, and nothing in that component refuses a
  `value` outside [0, 100] — a `value` of `Infinity` reaches the DOM as
  `translateX(-Infinity%)`. `OverviewDashboard`'s portfolio-size bar found
  this by accident: it divided `sheet.totalValue` (read raw) by a peak
  that had been sanitized with `finiteNumber` elsewhere, so a corrupted
  sheet total (NaN or Infinity, from a bad holding upstream) could reach
  `value` unclamped where the peak it was measured against could not.
  Every `<Progress value={...}>` site is walked the same way as a
  `width`/`height` fill, below.

  The last describe block goes one step further than the source scan: it
  actually renders `BusinessPanel` with BMNR's real, reported figures
  through `react-dom/server` and reads the widths back out of the HTML it
  produced. The scan proves the source routes through the clamp; this
  proves the clamp is still wired up to what a browser would actually
  paint, which a source-text check cannot see for itself.
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
    "src/components/playbook/TemperatureLadder.tsx:79",
    "bandWidths() is the gaps between fixed cut points on the ladder's own 0-100 axis (playbook.ts), so the widths sum to exactly 100 by construction and no reader's data enters the arithmetic.",
  ],
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
    "src/components/SeasonalityPage.tsx:283",
    "barW = (Math.abs(returnPct) / maxAbs) * 50, and maxAbs is Math.max(...) over the exact same returnPct values being drawn, so no bar can outrun it.",
  ],
  [
    "src/components/SeasonalityPage.tsx:284",
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

/**
 * Source with block comments blanked out (same line count, so reported
 * line numbers still match the real file).
 *
 * Without this, a comment that quotes a bar-fill expression in prose —
 * exactly what the doc comments in this codebase do, including the ones
 * a few lines up from here — reads as a second, real site. Line comments
 * are left alone: nobody writes a `width: \`${...}%\`` or
 * `<Progress value={...}>` inside a `//` comment in practice, and a
 * full comment-aware parser is more machinery than this scan needs.
 */
function withoutBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
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

type Site = { file: string; line: number; prop: "width" | "height"; expr: string };

/** Every `width: \`${EXPR}%\`` or `height: \`${EXPR}%\`` bar-fill site in `src/`. */
function barFillSites(): Site[] {
  const sites: Site[] = [];
  for (const file of sourceFiles("src")) {
    const lines = withoutBlockComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      const m = line.match(/(width|height):\s*`\$\{([^}]*)\}%`/);
      if (m)
        sites.push({
          file,
          line: i + 1,
          prop: m[1] as "width" | "height",
          expr: m[2]!.trim(),
        });
    });
  }
  return sites;
}

type ProgressSite = { file: string; line: number; expr: string };

/** Every `<Progress value={EXPR}>` site in `src/`. */
function progressValueSites(): ProgressSite[] {
  const sites: ProgressSite[] = [];
  for (const file of sourceFiles("src")) {
    if (file.endsWith("src/components/ui/progress.tsx")) continue;
    const lines = withoutBlockComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (!/<Progress\b/.test(line)) return;
      // The value prop is usually its own line right after the tag; look
      // a few lines ahead rather than assuming it is on the same line.
      for (let j = i; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j]!.match(/\bvalue=\{([^}]*)\}/);
        if (m) {
          sites.push({ file, line: j + 1, expr: m[1]!.trim() });
          return;
        }
      }
    });
  }
  return sites;
}

/**
 * Whether `identifier` was assigned in `file` by a statement whose right
 * side calls `barFillPct(` — anywhere in that statement, not only
 * immediately after the `=`.
 *
 * A plain `const foo = barFillPct(...)` is the common case, but
 * `OverviewDashboard`'s portfolio-size bar is `const width = cond ?
 * barFillPct(...) : 10`, a ternary, where the clamp sits inside one
 * branch rather than right after the `=`. Matching only the immediate
 * next token would call that unclamped when it is not. So this finds the
 * declaration and reads forward to the statement's own terminating `;`
 * (or, failing that, a generous window) rather than pattern-matching the
 * first few characters after `=`.
 */
function identifierIsClamped(file: string, identifier: string): boolean {
  const text = withoutBlockComments(readFileSync(file, "utf8"));
  const declRe = new RegExp(`(?:const|let)\\s+${identifier}\\s*=`);
  const m = declRe.exec(text);
  if (!m) return false;
  const start = m.index + m[0].length;
  const semi = text.indexOf(";", start);
  const end = semi === -1 ? Math.min(start + 400, text.length) : semi;
  return text.slice(start, end).includes("barFillPct(");
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

describe("every bar-fill width or height in src/ stays inside its own box", () => {
  const sites = barFillSites();

  it("found bar-fill sites to check (the scan itself did not break)", () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  for (const site of sites) {
    const key = `${site.file}:${site.line}`;
    it(`${key}: \`${site.prop}: ${site.expr}\` is clamped or explicitly justified`, () => {
      const direct = site.expr.includes("barFillPct(");
      const viaVariable =
        isBareIdentifier(site.expr) &&
        identifierIsClamped(site.file, site.expr);
      const allowedReason = ALLOWED.get(key);
      if (!direct && !viaVariable && !allowedReason) {
        throw new Error(
          `${key} computes a bar-fill ${site.prop} ("${site.expr}") ` +
            `without routing through barFillPct(), and is not in this ` +
            `file's ALLOWED list. Wrap it in barFillPct(), or add an ` +
            `entry to ALLOWED arguing the arithmetic can never exceed 100.`
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

describe("every <Progress value={...}> in src/ is clamped, not just floored", () => {
  /*
    `Progress`'s indicator is `translateX(-${100 - value}%)` with nothing
    refusing a `value` outside [0, 100]. `Math.min(100, x)` alone is not
    enough: `Math.min` returns NaN the moment either argument is NaN, so a
    site that floors with `Math.max` but ceilings with a bare `Math.min`
    still hands the DOM `translateX(-NaN%)` on the one input (a corrupted
    upstream total) this whole file exists because of. Every site here is
    required to route through `barFillPct`, full stop — there is no
    ALLOWED list for this one, because unlike a `width` fill built from
    the same array as its own peak, nothing about a `<Progress value>`
    prop is safe by construction; it is a bare number from wherever the
    caller got it.
  */
  const sites = progressValueSites();

  it("found <Progress value={...}> sites to check", () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  for (const site of sites) {
    const key = `${site.file}:${site.line}`;
    it(`${key}: \`value={${site.expr}}\` routes through barFillPct`, () => {
      const direct = site.expr.includes("barFillPct(");
      const viaVariable =
        isBareIdentifier(site.expr) && identifierIsClamped(site.file, site.expr);
      if (!direct && !viaVariable) {
        throw new Error(
          `${key} passes Progress a value ("${site.expr}") that does not ` +
            `route through barFillPct(). Math.min(100, x) is not enough: ` +
            `it returns NaN on a NaN input instead of clamping it. Wrap ` +
            `it in barFillPct().`
        );
      }
    });
  }
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

describe("BusinessPanel actually renders BMNR's real figures without overflowing", () => {
  /*
    Everything above checks the source text. This renders the real
    component through react-dom/server with the exact shape of data that
    broke it — a period whose profit is many times its revenue, on a
    balance sheet marked through net income — and reads the widths back
    out of the HTML it actually produced. A source scan can be fooled by
    a refactor that moves the arithmetic somewhere the regex cannot see;
    this cannot, because it is reading what the browser would paint.
  */
  it("keeps every drawn bar at or under 100%, on data shaped like BMNR's", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const React = await import("react");
    const { BusinessPanel } = await import("@/components/company/BusinessPanel");
    const facts = {
      fetchedAt: new Date().toISOString(),
      history: [
        // 2024: no reported revenue, a net loss.
        { year: 2024, revenue: null, netIncome: -3_300_000 },
        // 2025: $6.1M revenue, $328.2M net income — crypto marks on the
        // balance sheet flowing through net income, real and reported.
        { year: 2025, revenue: 6_100_000, netIncome: 328_200_000 },
      ],
      quarters: [],
      surprises: [],
      grossMargin: 0.844,
      operatingMargin: 0.084,
      profitMargin: 0,
    } as unknown as Parameters<typeof BusinessPanel>[0]["facts"];

    const html = renderToStaticMarkup(
      React.createElement(BusinessPanel, { ticker: "BMNR", facts, code: "USD" })
    );

    const widths = [...html.matchAll(/width:(-?\d+(?:\.\d+)?)%/g)].map((m) =>
      Number(m[1])
    );
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    }
  });
});
