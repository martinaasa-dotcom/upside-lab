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
  /*
    A JSX comment between the gap div and its first `<Panel>` used to hide
    the offender from this guard entirely: `lines[i + 1]` was read literally,
    so a `{/* Hero KPI Summary *\/}` line (ordinary in this codebase, which
    comments heavily) meant neither the `<Panel` check nor the `&&` check
    matched, and the scan moved on as if the container held nothing of
    interest. That is exactly the shape the compound room's own
    `gap-4` section shipped in -- comment, then `<Panel>` -- and it passed
    this test the whole time. Skip comment and blank lines when looking for
    the next real line, the same way `panelBlocks` below already does.
  */

  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    if (ALLOWED_STACKS.has(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // A container that sets its own vertical gap ...
      const gap = /className=(?:\{cn\()?["`][^"`]*\b(?:flex flex-col|grid)\b[^"`]*\bgap-([\d.]+)/.exec(line);
      if (!gap) return;
      // ... tighter than the shared rhythm's own 2rem. A room is free to
      // set a gap at or above it; what this catches is a room quietly
      // spacing its answers closer than the product does.
      if (Number(gap[1]) >= 8) return;
      /*
       * ... that wraps two or more panels.
       *
       * This used to require the very next JSX line to be a `<Panel>`, and
       * both faults it was written for walked straight past it: Growth put
       * a `{/* Hero KPI Summary *\/}` comment on the next line and Lab put
       * an empty-state conditional there, so one room stacked its panels
       * 16px apart and the other did the same, against a product standard
       * of 32 stepping to 40. Two panels is what makes a column a stack;
       * one panel in a wrapper is spacing nothing.
       */
      /*
       * Panels INSIDE the container, not ones that happen to follow it.
       *
       * A fixed lookahead reads a heading-and-lede pair at `gap-2` as a
       * panel stack because two panels sit a few lines below it as its
       * siblings. Indentation is what tells a child from a sibling here:
       * scan to the container's own close, which is the first line at or
       * left of its indentation, and count only the panels deeper than it.
       */
      const indent = line.search(/\S/);
      let panels = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const row = lines[j] ?? "";
        if (!row.trim()) continue;
        const at = row.search(/\S/);
        if (at <= indent) break;
        if (/<Panel[\s>]/.test(row)) panels += 1;
      }
      if (panels < 2) return;
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

/*
  A card on the field pads like a card, at every width.

  The spacing pass reached `Panel`, the page column and the modals, and
  walked straight past every surface that draws a card by hand. The Circle
  was the whole room built that way: seven `rounded-xl glass ring-1 p-6`
  sections stacked on `gap-3`, so measured against the app's own compiled
  CSS its cards sat **24px inside and 12px apart at every width**, where a
  panel steps 16/20 on a phone and a room stacks at 32/40. The grouping was
  inverted -- a card's last line was nearer the next card's first line than
  its own edge -- which is the exact fault this pass exists to fix and
  worse than the 24-against-24 it started from. The Fund's report cards,
  the admin list, the class banner, the duel and the Today board were all
  in the same state.

  This fails on a flat pad on a glass card. It cannot see a pad built in a
  variable or handed in as a prop, so it is a floor rather than a ceiling.
*/
describe("a card on the field pads like a card", () => {
  /** `glass` + the card ring: the class pair that means "card" here. */
  const CARD = /glass(?![-\w])[^"`]*ring-1 ring-foreground\/20|ring-1 ring-foreground\/20[^"`]*glass(?![-\w])/;
  /** A pad with no breakpoint behind it and no shared class beside it. */
  const FLAT = /\b(?:p|px)-(?:5|6|7|8|10|12)\b/;

  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!CARD.test(line) || !FLAT.test(line)) return;
      // A responsive pair is a different (smaller) problem and is not this
      // one; what this catches is a pad that never steps at all.
      if (/\bsm:(?:p|px)-/.test(line)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }

  it("has no glass card carrying a flat side pad", () => {
    expect(
      offenders,
      "Use PANEL_PAD (or `Panel` itself) so a card's sides step down on a " +
        "phone like every other surface.\nOffenders:\n" + offenders.join("\n")
    ).toEqual([]);
  });
});

/*
  A pad in `@layer components` loses to a utility already in the base.

  This is the first fault in this file read from the other side. There, a
  call site's `p-4` beat the panel's `sm:px-6` only by half; here, the
  shadcn `Empty` primitive carried its own `p-6` and `EmptyState` layered
  `.surface-gutter` on top -- and a utility beats a component layer
  whatever the specificity, so the sides stayed at 24px on a phone while
  the class was asking for 16, with nothing failing. Measured on the real
  component at 360px: 249px of content against the 281 the override was
  supposed to give, and the one sentence that says what to do next wrapped
  to four lines instead of three. Empty states are what a brand new reader
  meets first, so this was the narrowest column in the product on the
  screens that could least afford it.
*/
describe("the empty state's pad is the one it asks for", () => {
  const EMPTY = readFileSync("src/components/ui/empty.tsx", "utf8");
  // Comments only, stripped: the note above the class list names the `p-6`
  // this rule removed, and reading it as markup would fail on the record of
  // its own fix.
  const base = (
    EMPTY.match(/data-slot="empty"[\s\S]*?cn\(\s*([\s\S]*?)\n\s*className/)?.[1] ?? ""
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("leaves the pad to its one caller", () => {
    expect(base, "no padding utility in the primitive's base").not.toMatch(
      /\b(?:p|px|py)-\d/
    );
  });

  it("is padded by the shared gutter, which steps on a phone", () => {
    const empty = PANEL.slice(PANEL.indexOf("export function EmptyState"));
    expect(empty).toMatch(/surface-gutter/);
  });
});

/**
 * Everything below reads a `<Panel>`'s own direct children.
 *
 * Indentation rather than a parser: this repo's JSX is prettier-formatted,
 * so a direct child of a `<Panel>` opened at column N sits at N + 2. That
 * is a floor, not a ceiling -- a panel whose children are built in a
 * variable or spread from a map is beyond it -- but it is exact on the
 * shape these faults actually take, which is markup written out in place.
 */
type PanelBlock = {
  /** The line the `<Panel` opened on, 1-indexed. */
  at: number;
  padded: boolean;
  /** Direct children, comments dropped, in source order. */
  children: { at: number; line: string }[];
  /** Every line of the body, comments dropped, at any depth. */
  body: { at: number; line: string }[];
};

function panelBlocks(src: string): PanelBlock[] {
  const lines = src.split("\n");
  const out: PanelBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = /^(\s*)<Panel(\s|>|$)/.exec(lines[i]!);
    if (!open) {
      i += 1;
      continue;
    }
    const base = open[1]!.length;
    let j = i;
    const head: string[] = [];
    while (j < lines.length && !/>\s*$/.test(lines[j]!) && j - i < 25) {
      head.push(lines[j]!);
      j += 1;
    }
    head.push(lines[j] ?? "");
    if (j >= lines.length || /\/>\s*$/.test(lines[j]!)) {
      i = j + 1;
      continue;
    }
    const children: { at: number; line: string }[] = [];
    const body: { at: number; line: string }[] = [];
    /*
      Comments are dropped, and that is not tidiness: this repo comments
      heavily, and the first version of the header guard read a fixed
      window of lines after the opening tag. On the one panel in Lab whose
      note explains the very fault being guarded, that window was nothing
      but comment, so the check saw neither a heading nor a `PanelHeader`
      and passed. Verified by putting the bare heading back and watching
      it fail.
    */
    let inComment = false;
    let k = j + 1;
    while (k < lines.length && !new RegExp(`^\\s{${base}}</Panel>`).test(lines[k]!)) {
      const line = lines[k]!;
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      if (inComment) {
        if (/\*\/\}?\s*$/.test(trimmed)) inComment = false;
      } else if (/^\{?\/\*/.test(trimmed)) {
        if (!/\*\/\}?\s*$/.test(trimmed)) inComment = true;
      } else if (trimmed) {
        body.push({ at: k + 1, line: trimmed });
        if (indent === base + 2) children.push({ at: k + 1, line: trimmed });
      }
      k += 1;
    }
    out.push({
      at: i + 1,
      padded: !/padded=\{false\}/.test(head.join(" ")),
      children,
      body,
    });
    i = j + 1;
  }
  return out;
}

/*
  A panel spaces its own children, so a child may not space itself.

  AGENTS.md has said this since the design system was written -- "a `Panel`
  spaces its own children, so a direct child must not add `mt-*`/`mb-*`, it
  gets both" -- and nothing enforced it, so nine children were adding one
  anyway: a `mt-4` under a `PanelHeader` in Seasonality, `mt-3` around
  Scenario's tables, `mt-3 mb-4` on a paragraph in Trends. Every one of
  them got the panel's gap *plus* its own margin, and the spacing pass made
  each worse by widening the gap underneath it from 20/24 to 24/32.
*/
describe("a panel's children do not space themselves", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    const src = readFileSync(file, "utf8");
    for (const block of panelBlocks(src)) {
      if (!block.padded) continue;
      for (const { at, line } of block.children) {
      if (!/className=/.test(line)) continue;
      // `padded={false}` panels have no gap of their own, and their rows
      // own their edges on purpose; those are not caught here because the
      // scan only reads children of a panel that opened with a gap.
      const margin = /\b(?:mt|mb|my)-[\d.]+/.exec(line);
      if (margin) offenders.push(`${file}:${at}  ${margin[0]}  ${line.slice(0, 80)}`);
      }
    }
  }

  it("has no direct child of a Panel carrying its own vertical margin", () => {
    expect(
      offenders,
      "A Panel is a `.panel-rhythm` column: its gap already separates these, " +
        "so a margin here is added to it rather than instead of it.\nOffenders:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});

/*
  A panel is headed by `PanelHeader`, not by a heading a room wrote itself.

  Six panels in Lab and Scenario opened on a bare `<h3>` with a `mt-1.5`
  paragraph under it, wrapped in a `<div>` so the pair counted as one
  child. One of them carried a comment working out for itself that a title
  and its subtitle are one child of the panel, which is exactly what
  `PanelHeader` is for. The cost of re-deriving it: those rooms titled at
  **16px where the other 66 call sites title at 18**, and hugged their
  subtitle at 6px where the component hugs at 8 -- measured on the real
  components, before and after. A reader walking from Home into Lab met a
  panel title one step down the type ladder for no reason they could see.

  `padded={false}` panels are exempt: their rows own their own edges, and a
  table panel's header band is a different thing from a panel's header.
*/
describe("a panel is headed by the component that owns that decision", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles("src")) {
    for (const block of panelBlocks(readFileSync(file, "utf8"))) {
      // `padded={false}` panels are exempt: their rows own their own
      // edges, and a table panel's header band is a different thing from
      // a panel's header.
      if (!block.padded) continue;
      /*
        Whichever comes first anywhere in the body, not just as a direct
        child. The fault's real shape in Lab was a `<div>` wrapping an
        `<h3>` and a `<p>` -- the pair counted as one child on purpose, so
        a check that only read the child line saw a `<div>` and passed.
      */
      const heading = block.body.find((l) => /<h[1-4][\s>]/.test(l.line));
      const header = block.body.find((l) => /<PanelHeader/.test(l.line));
      if (heading && (!header || heading.at < header.at)) {
        offenders.push(`${file}:${heading.at}  ${heading.line.slice(0, 70)}`);
      }
    }
  }

  it("has no padded Panel opening on a heading of its own", () => {
    expect(
      offenders,
      "Use PanelHeader so a panel's title sits on the same step of the type " +
        "ladder as every other panel's.\nOffenders:\n" + offenders.join("\n")
    ).toEqual([]);
  });
});

/*
  A modal's title sits on the same step as a panel's.

  Five of the eight modal shells opened on `<h3 className="text-base ...">`
  and three on `<h2 className="font-semibold ...">`, so "Add holding"
  titled at 16px and "Import a CSV" at 18 -- two answers to one question,
  decided by whichever modal was written first. A modal is a card-sized
  surface and its title is the same tier as a panel's, which the `h2` step
  in `globals.css` already sets at 18px; `h2` is also the right level for
  a dialog's own label.

  The size is left to the element rather than stated: a `text-base` or a
  `text-lg` here is a fourth answer waiting to happen.
*/
describe("a modal is titled like the rest of the product", () => {
  const SHELLS = [
    "src/components/CashModal.tsx",
    "src/components/HoldingModal.tsx",
    "src/components/InvitePartnerModal.tsx",
    "src/components/YtdAnchorModal.tsx",
    "src/components/CsvImportModal.tsx",
    "src/components/CostBasisModal.tsx",
    "src/components/SnapshotsModal.tsx",
    "src/components/RenameSheetModal.tsx",
  ];

  for (const shell of SHELLS) {
    it(`${shell} titles with a plain h2`, () => {
      const src = readFileSync(shell, "utf8");
      const first = /<h([1-4])([^>]*)>/.exec(src);
      expect(first, `${shell} has a heading`).not.toBeNull();
      expect(first![1], `${shell}: a modal title is an h2`).toBe("2");
      expect(
        first![2],
        `${shell}: leave the size to the h2 step in globals.css`
      ).not.toMatch(/\btext-(xs|sm|base|lg|xl|2xl)\b/);
    });
  }
});
