import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Two faults, both found by rendering the real components and measuring them
  rather than by reading the markup, and both invisible to every other test
  in this repo.

  1. A responsive pair can only ever be HALF overridden. The panel's rhythm
     was `gap-6 sm:gap-8` and its pad `px-4 py-5 sm:px-6 sm:py-7`. A call
     site asking for a compact panel writes `className="gap-3"` or `"p-4"`,
     which conflicts with the base and replaces it -- and leaves the `sm:`
     half standing, because a modifier is its own group to tailwind-merge.
     Measured on the rendered component, `<Panel className="gap-3">` got
     12px on a phone and 32px from `sm`: a 2.67x jump at one breakpoint, in
     the panel whose author had asked for the tightest gap in the product.
     Five call sites were in that state. The rhythm is one class per role in
     `@layer components` now, so the media query is inside it and a call
     site's utility wins at every width.

  2. `PAGE_MAIN_CLASS` spaces only the panels that are direct children of
     `<main>`, and seven rooms build their own column instead. Home, Lab,
     Pulse, Trends, Scenario and Seasonality were therefore still on the old
     flat 24px (Seasonality on 16) after the spacing pass moved every other
     room to 32/40 -- one product with two answers to the same question,
     decided by a detail of how a room happened to be built.
*/

const PANEL = readFileSync("src/components/ui/Panel.tsx", "utf8");

describe("a panel's rhythm can be overridden whole, not by half", () => {
  const padded = PANEL.match(/padded && `([^`]+)`/)?.[1] ?? "";

  it("states the rhythm and the pad as single classes", () => {
    expect(padded).toContain("panel-rhythm");
    // Interpolated rather than spelled out, so the panel and every call
    // site that reaches for PANEL_PAD cannot drift to two different pads.
    expect(padded).toContain("\${PANEL_PAD}");
  });

  it("carries no responsive spacing utility a call site could half-beat", () => {
    // The whole point: `sm:gap-*` / `sm:p*-*` here survive a call site's
    // own `gap-*` / `p-*` and reappear at the breakpoint.
    expect(padded).not.toMatch(/sm:gap-/);
    expect(padded).not.toMatch(/sm:p[xytblr]?-/);
  });

  it("keeps PANEL_PAD and NESTED_PAD as one class each", () => {
    for (const name of ["PANEL_PAD", "NESTED_PAD"]) {
      const value = PANEL.match(new RegExp(`export const ${name} = "([^"]+)"`))?.[1];
      expect(value, `${name} is a single class`).toBeDefined();
      expect(value!.trim().split(/\s+/), `${name} is one class`).toHaveLength(1);
      expect(value, `${name} carries no breakpoint`).not.toMatch(/:/);
    }
  });
});

/** Every .tsx under src/, tests excluded. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx") && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/*
  Rooms allowed to stack panels on their own gap, with the reason.

  The landing page is its own design and not a room: its cards are sample
  furniture laid out in a marketing grid, not a reader's stack of answers,
  and `landing-paint.test.ts` pins some of those class strings directly.
*/
const ALLOWED_STACKS = new Map<string, string>([
  ["src/components/SignedOutLanding.tsx", "the landing is a marketing layout, not a room of answers"],
]);

describe("a room's stack of panels uses the one shared rhythm", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    if (ALLOWED_STACKS.has(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A container that sets its own vertical gap ...
      if (!/className=(?:\{cn\()?["`][^"`]*\b(?:flex flex-col|grid)\b[^"`]*\bgap-[\d.]/.test(line)) return;
      // ... whose very next JSX element is a <Panel>.
      const next = lines.slice(i + 1, i + 3).join(" ");
      if (!/^\s*<Panel[\s>]/.test(lines[i + 1] ?? "") && !/^\s*\{[^}]*&&\s*\(?\s*$/.test(lines[i + 1] ?? "")) return;
      if (!/<Panel[\s>]/.test(next)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }

  it("has no room stacking panels on a hand-rolled gap", () => {
    expect(
      offenders,
      "Use PANEL_STACK (src/components/ui/Panel.tsx) so every room's panel " +
        "spacing is the one number in .panel-stack, rather than whichever gap " +
        "each room happened to be written with.\nOffenders:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});

describe("prose leading reaches sentences and leaves figures alone", () => {
  const CSS = readFileSync("src/app/globals.css", "utf8");
  const selector = CSS.match(/^(p:not\([^{]*)\{\s*\n\s*line-height: 1\.625;/m)?.[1] ?? "";

  it("is unlayered, or `text-sm` keeps its own line-height and nothing changes", () => {
    // The rule must not sit inside @layer base: text-sm ships a line-height,
    // and a layered rule loses to it on every paragraph that carries one.
    const at = CSS.indexOf("p:not([class*=\"leading-\"])");
    expect(at).toBeGreaterThan(0);
    const before = CSS.slice(0, at);
    const opens = (before.match(/@layer [a-z]+ \{/g) ?? []).length;
    const closes = (before.match(/^\}/gm) ?? []).length;
    expect(opens, "the prose rule sits outside every @layer").toBeLessThanOrEqual(closes);
  });

  it("exempts every marker this design system uses to mean 'not prose'", () => {
    // Geist Mono is every figure; uppercase is the MicroLabel scaffolding
    // voice; font-heading is a status word. None of them is a sentence.
    for (const marker of ["leading-", "font-mono", "tabular-nums", "uppercase", "font-heading"]) {
      expect(selector, `exempts ${marker}`).toContain(`[class*="${marker}"]`);
    }
  });

  it("matches leading-relaxed exactly, so the product has one prose rhythm", () => {
    // 190 paragraphs already say leading-relaxed by hand. Picking a number
    // near it rather than equal to it would leave two rhythms, which is the
    // fault this rule exists to remove.
    expect(CSS).toMatch(/line-height: 1\.625;/);
  });
});
