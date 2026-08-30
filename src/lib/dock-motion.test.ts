/**
 * The dock's marker is two edges moving at two speeds, and that is the
 * whole of what makes it read as liquid rather than as a rectangle being
 * relocated. Both halves of it are easy to undo by accident: a refactor
 * back to a position and a width loses the stretch outright, and equalising
 * the two durations loses it while leaving every class name in place, which
 * is the version nobody would notice in a diff.
 *
 * So the geometry is asserted against the arithmetic and the timing is
 * asserted against the stylesheet, the same way `ambient-dither.test.ts`
 * holds two numbers that have to stay related to each other.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { markGeometry, sameMark, travelDirection } from "@/lib/dock-motion";

const CSS = readFileSync("src/app/dock.css", "utf8");

/** Every `--name: 123ms` in the file, as a lookup. */
function msVars(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [, name, value] of CSS.matchAll(
    /(--dock-[a-z-]+):\s*(\d+)ms/g
  )) {
    (out[name] ??= []).push(Number(value));
  }
  return out;
}

describe("dock marker geometry", () => {
  it("gives two insets that add up to the well", () => {
    const mark = markGeometry(600, 120, 96);
    expect(mark).toEqual({ left: 120, right: 384 });
    expect(mark.left + 96 + mark.right).toBe(600);
  });

  it("never reports a negative inset for a cell wider than the well", () => {
    // A row mid-resize can measure a cell that has not been re-laid out
    // yet. A negative `right` would push the pane off the far edge.
    expect(markGeometry(100, 0, 400).right).toBe(0);
  });

  it("is idempotent, so measuring cannot re-render forever", () => {
    const a = markGeometry(600, 120, 96);
    const b = markGeometry(600, 120, 96);
    expect(sameMark(a, b)).toBe(true);
    expect(sameMark(a, null)).toBe(false);
    expect(sameMark(null, null)).toBe(true);
  });
});

describe("dock marker direction", () => {
  it("reads the way it is going off the left edge", () => {
    const home = markGeometry(600, 0, 96);
    const away = markGeometry(600, 300, 96);
    expect(travelDirection(home, away)).toBe("right");
    expect(travelDirection(away, home)).toBe("left");
  });

  it("calls a pure resize no direction at all", () => {
    // The cell grew or shrank under a still marker. There is no journey,
    // so neither edge leads and both settle together.
    expect(
      travelDirection(markGeometry(600, 120, 96), markGeometry(620, 120, 110))
    ).toBe(null);
  });
});

describe("the marker stretches", () => {
  it("gives the trailing edge longer than the leading edge", () => {
    const vars = msVars();
    const lead = vars["--dock-lead-ms"];
    const trail = vars["--dock-trail-ms"];
    expect(lead?.length, "a leading duration per pane").toBeGreaterThan(0);
    expect(trail?.length).toBe(lead?.length);
    for (let i = 0; i < lead.length; i += 1) {
      expect(
        trail[i],
        "the trailing edge must lag, or the pill does not stretch"
      ).toBeGreaterThan(lead[i]);
    }
  });

  it("puts the leading edge on the leading side, both ways", () => {
    // Going right, the right edge is the one that leads. Swap these and
    // the pill stretches backwards, away from where it is going.
    const right = CSS.slice(CSS.indexOf('[data-dir="right"]'));
    const rightRule = right.slice(0, right.indexOf("}"));
    expect(rightRule).toMatch(/--dock-right-ms:\s*var\(--dock-lead-ms\)/);
    expect(rightRule).toMatch(/--dock-left-ms:\s*var\(--dock-trail-ms\)/);

    const left = CSS.slice(CSS.indexOf('[data-dir="left"]'));
    const leftRule = left.slice(0, left.indexOf("}"));
    expect(leftRule).toMatch(/--dock-left-ms:\s*var\(--dock-lead-ms\)/);
    expect(leftRule).toMatch(/--dock-right-ms:\s*var\(--dock-trail-ms\)/);
  });

  it("moves the edges themselves, never a transform", () => {
    // A transform cannot stretch a pill without stretching its round ends
    // into ellipses, and the ends are most of what makes it a pill.
    expect(CSS).toMatch(/transition-property:\s*left,\s*right,\s*opacity/);
  });

  it("holds still until it has been placed once", () => {
    expect(CSS).toMatch(/\.dock-marker:not\(\[data-travels\]\)\s*\{\s*transition:\s*none/);
  });
});

describe("the dock's motion is optional", () => {
  it("is all switched off under reduced motion", () => {
    const reduced = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
    expect(reduced).toContain(".dock-marker");
    expect(reduced).toContain(".dock-ghost");
    expect(reduced).toContain(".dock-cell");
    expect(reduced).toContain(".dock-glyph");
    expect(reduced).toContain(".dock-say");
    expect(reduced).toMatch(/animation:\s*none/);
  });

  it("never grows a hover glyph on a screen with no pointer", () => {
    // A finger leaves the hover state stuck on the last cell tapped.
    const hover = CSS.indexOf(".dock-cell:hover .dock-glyph");
    const gate = CSS.lastIndexOf("@media (hover: hover)", hover);
    expect(gate, "the hover rules sit inside a pointer query").toBeGreaterThan(-1);
    expect(CSS.slice(gate, hover)).not.toContain("}\n  }");
  });
});

describe("the stylesheet is actually loaded", () => {
  it("is imported by globals.css", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toContain(
      '@import "./dock.css";'
    );
  });
});

describe("measuring stays cheap", () => {
  it("watches the cells, never the panes", () => {
    /*
     * A pane is two insets now, so its width changes on every frame of
     * every travel. Observing it would run a measurement, and the layout
     * read inside it, sixty times a journey to answer a question about
     * cells that have not moved.
     */
    const hook = readFileSync("src/lib/use-dock-marker.ts", "utf8");
    const watch = hook.slice(hook.indexOf("new ResizeObserver"));
    const effect = watch.slice(0, watch.indexOf("watch.disconnect()"));
    expect(effect).toContain("[data-dock-cell]");
    expect(effect, "every child includes the panes").not.toContain(
      "host.children"
    );
  });
});
