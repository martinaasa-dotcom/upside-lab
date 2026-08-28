/**
 * Nothing this app draws prints itself over something else, and nothing it
 * opens hangs off the edge of the screen.
 *
 * Three surfaces had the same shape of fault and they are one rule, which
 * is why they are one file. A box was given a width that had nothing to do
 * with what was written in it, and the writing went somewhere else.
 *
 * The tables. Every cell in `FluidTable` and in the `<table>` twin beside
 * it is `whitespace-nowrap`, because a price broken over two lines is not a
 * price. So a column narrower than its content cannot wrap and does not
 * clip: it paints straight across the column next door. Measured on the
 * covered calls table at 1440, "Far from your target" painted 168px inside
 * a 104px track, so the reader got `29.6%Far from your target$330.00` with
 * three separate figures touching. At 820 every header in the table did it
 * at once. The classroom roster did it with `table-fixed` at every width
 * tried, down to a student's own name at 900 and below.
 *
 * The popover. Radix places a popover but cannot shrink one. With
 * `avoidCollisions` it picks the side with more room and then, if the
 * content still does not fit, lets it hang over the edge. Measured on the
 * provenance panel in a 1280x760 window: the popover stood 42px above the
 * top of the viewport with its opening paragraph cut in half, and its own
 * scroller began up there too, so the missing part could not be scrolled
 * back. `DropdownMenuContent` and `SelectContent` had always bounded
 * themselves by the height Radix measured; the popover was the one
 * floating surface in the app that did not.
 *
 * The segmented control. A `gap-px` + `bg-border` grid paints every track
 * and works only while the cells on top of it are opaque. These cells are
 * glass, so the tray's own fill came through each unselected one: measured
 * at 1440, an unselected cell painted 86 of 255 on a page whose panels sit
 * in the twenties, which read as a row of grey slabs beside the app's own
 * near-black cards.
 *
 * Asserted against the source, because each of these is one declaration and
 * the symptom is a coordinate no unit test would ever compute.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { equalCols, tableCols } from "@/components/FluidTable";

/**
 * Source with its comments taken out. Every rule here is about what the app
 * ships, and each of these files explains in prose the very class it must
 * not use.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FLUID = code("src/components/FluidTable.tsx");
const POPOVER = code("src/components/ui/popover.tsx");
const PANEL = code("src/components/ui/Panel.tsx");
const COVERED_CALLS = code("src/components/CoveredCallPanel.tsx");

/** The `Segmented` body, where the filled grid look is built. */
function segmented(): string {
  const start = PANEL.indexOf("export function Segmented");
  if (start < 0) throw new Error("no Segmented in Panel.tsx");
  return PANEL.slice(start, PANEL.indexOf("const PILL_TONES", start));
}

describe("table columns hold what is written in them", () => {
  it("floors every data track at its own content", () => {
    expect(equalCols(4)).toBe("repeat(4, minmax(min-content, 1fr))");
    expect(tableCols(4, false)).toBe("repeat(4, minmax(min-content, 1fr))");
  });

  it("floors them behind a fitted ticker column too", () => {
    expect(tableCols(4, true)).toBe(
      "max-content repeat(3, minmax(min-content, 1fr))"
    );
  });

  it("keeps the row action on its own fixed track", () => {
    /*
     * The action is the one column that must not grow with content: it
     * holds a delete and nothing else, so it stays out of the fight for
     * width rather than joining it.
     */
    expect(tableCols(3, false, true)).toBe(
      "repeat(3, minmax(min-content, 1fr)) 1.75rem"
    );
  });

  it("never hands a data track a zero floor", () => {
    expect(
      FLUID,
      "a `minmax(0, 1fr)` data track is narrower than its own nowrap content sooner or later, and then it paints over the column beside it",
    ).not.toMatch(/minmax\(0, 1fr\)/);
  });

  it("sizes the html table to its content", () => {
    expect(
      FLUID,
      "`table-fixed` hands every column the same width whatever is written in it, which is the same fault the grid had",
    ).not.toMatch(/table-fixed/);
    expect(FLUID).toMatch(/htmlTable = "w-full table-auto/);
  });

  it("keeps the covered calls verdicts short enough to sit in a column", () => {
    /*
     * The widest label sets the width of the whole track, and this one sits
     * between two figures. Fourteen characters is "At your target", which
     * is the longest of them and the width the column was measured at.
     */
    const labels = [...COVERED_CALLS.matchAll(/label: "([^"]+)", className/g)].map(
      (m) => m[1]
    );
    expect(labels.length).toBeGreaterThan(2);
    for (const label of labels) {
      expect(label.length, `"${label}" is too long for the Write column`).toBeLessThanOrEqual(
        14
      );
    }
  });
});

describe("floating surfaces stay on the screen", () => {
  it("bounds a popover by the room the placement found", () => {
    expect(
      POPOVER,
      "without this a popover taller than its side hangs off the viewport, and the part off the screen cannot be scrolled back",
    ).toMatch(/max-h-\(--radix-popover-content-available-height\)/);
  });

  it("lets a popover scroll rather than clip", () => {
    expect(POPOVER).toMatch(/overflow-y-auto/);
  });

  it("keeps the same ceiling on the menus that already had one", () => {
    const menu = code("src/components/ui/dropdown-menu.tsx");
    const select = code("src/components/ui/select.tsx");
    expect(menu).toMatch(/max-h-\(--radix-dropdown-menu-content-available-height\)/);
    expect(select).toMatch(/max-h-\(--radix-select-content-available-height\)/);
  });
});

describe("the segmented control is the app's own material", () => {
  it("does not paint a hairline tray under glass cells", () => {
    expect(
      segmented(),
      "`gap-px` + `bg-border` paints every track, and a transparent cell on top of it shows the track instead of the page",
    ).not.toMatch(/gap-px/);
  });

  it("floats its cells in a well", () => {
    expect(segmented()).toMatch(/card-sheen glass-well/);
  });

  it("still fills the chosen cell with the accent at full lightness", () => {
    /*
     * The one selected surface that must read as chosen from across the
     * room. A veil of the accent over a black field lands on khaki, which
     * is why this is the opaque token and not an alpha of it.
     */
    expect(segmented()).toMatch(/bg-primary text-primary-foreground/);
  });
});
