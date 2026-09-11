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

/*
  Modals and tables, measured the same way and with the same rule.

  Nine modal shells carried a flat `p-6` -- 24px on every side at every
  width. Measured on the real CashModal rendered through react-dom/server at
  360px, the sheet is 96% of the screen and its own padding took 48 of that,
  leaving **287px** to set a field in. That is the arithmetic `PANEL_PAD`
  steps down to avoid and that `Reading`'s own flat `p-6` was already
  corrected for; the modals had simply been missed, and a modal is where it
  costs most, because it is the surface a reader types into. After:
  **303px at 360 and 333 at 390**, with the desktop vertical stepping 24 to
  28 so a dialog is no longer tighter than the panel behind it.

  The tables were measured and deliberately left alone -- see the table
  block below for what the numbers said.
*/

const MODAL_SHELLS = [
  "src/components/CashModal.tsx",
  "src/components/HoldingModal.tsx",
  "src/components/InvitePartnerModal.tsx",
  "src/components/YtdAnchorModal.tsx",
  "src/components/FeedbackModal.tsx",
  "src/components/CsvImportModal.tsx",
  "src/components/CostBasisModal.tsx",
  "src/components/SnapshotsModal.tsx",
];

describe("a modal's pad steps down on a phone, like every other surface", () => {
  const CSS = readFileSync("src/app/globals.css", "utf8");

  it("defines .modal-pad and .surface-gutter narrower on a phone", () => {
    const layer = CSS.slice(CSS.indexOf("@layer components {"));
    const split = layer.indexOf("@media (width >= 40rem)");
    const phone = layer.slice(0, split);
    const wide = layer.slice(split);
    const sideOf = (block: string, name: string, prop: string) => {
      const at = block.indexOf(`.${name} {`);
      expect(at, `.${name} is defined`).toBeGreaterThanOrEqual(0);
      const rule = block.slice(at, at + 200);
      const m = rule.match(new RegExp(`${prop}:[^;]*?([\\d.]+)rem\\s*(?:([\\d.]+)rem)?`));
      return m ? Number(m[2] ?? m[1]) : null;
    };
    // `padding: <y> <x>` -- the side is the second value.
    expect(sideOf(phone, "modal-pad", "padding")).toBeLessThan(
      sideOf(wide, "modal-pad", "padding")!
    );
    expect(sideOf(phone, "surface-gutter", "padding-inline")).toBeLessThan(
      sideOf(wide, "surface-gutter", "padding-inline")!
    );
  });

  it("carries the safe-area floor itself, not at each call site", () => {
    // Below `sm` these are bottom sheets and the home indicator sits under
    // them. A `pb-[max(...)]` bolted on per call site is the half-override
    // this layer exists to stop.
    expect(CSS).toMatch(/\.modal-pad\s*\{[^}]*padding-bottom:\s*max\([^)]*safe-area-inset-bottom/);
  });

  for (const shell of MODAL_SHELLS) {
    it(`${shell} states no flat pad of its own`, () => {
      const src = readFileSync(shell, "utf8");
      // A modal shell is the element carrying the sheet's own rounding.
      const shellLines = src
        .split("\n")
        .filter((l) => /rounded-t-xl|scroll-host/.test(l));
      for (const line of shellLines) {
        expect(line, `${shell}: use modal-pad / surface-gutter`).not.toMatch(
          /\bp-6\b|\bpx-6\b/
        );
      }
    });
  }
});

describe("a table row keeps its fixed height, and cells add nothing to it", () => {
  /*
    Measured on the real FluidTable rendered with twenty holdings at 360,
    390, 430, 820 and 1440: the row is a flat **40px** carrying a 20px line
    box, so half the row is air, the column gutter is 12px, and none of it
    moves with the width. That is already tuned, and it is tuned for the
    thing a holdings table is for -- comparing twenty names down a column --
    so nothing here was loosened: spreading a scan table out makes it worse
    to scan, and AGENTS.md says so. The header is separated by its own rule
    at twice the weight of a row's (border-border against border-border/50,
    which composites to about 41/255 against 20/255 on this field), and that
    override was checked through `cn` rather than assumed.

    What this guards is the rule AGENTS.md states and nothing enforced: the
    height lives on the row, and a cell may not add to it. A `min-h` or a
    taller `py` on a cell inside an `items-center` grid row either does
    nothing or breaks the one thing that makes the table scannable, which is
    that every row is the same height.
  */
  const FLUID = readFileSync("src/components/FluidTable.tsx", "utf8");

  it("sets the height on the row", () => {
    const row = FLUID.slice(FLUID.indexOf("export function FluidRow"));
    expect(row).toMatch(/\bh-10\b/);
  });

  it("adds no min-height anywhere in the table primitives", () => {
    expect(FLUID).not.toMatch(/\bmin-h-/);
  });

  it("keeps every cell's vertical padding inside the row's own height", () => {
    // py-1.5 twice (6+6) plus a 20px line is 32, inside the 40px row.
    for (const name of ["cellBase", "cellTicker", "htmlCell"]) {
      const at = FLUID.indexOf(`const ${name} =`);
      expect(at, `${name} exists`).toBeGreaterThanOrEqual(0);
      const value = FLUID.slice(at, at + 400);
      const py = value.match(/\bpy-([\d.]+)/)?.[1];
      expect(Number(py ?? 0), `${name} keeps a small py`).toBeLessThanOrEqual(2);
    }
  });
});
