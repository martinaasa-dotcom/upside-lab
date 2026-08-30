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
import {
  SWELL_PEAK,
  markGeometry,
  sameMark,
  swellFrames,
  travelDirection,
} from "@/lib/dock-motion";

const CSS = readFileSync("src/app/dock.css", "utf8");

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
  it("lags the trailing edge behind the leading one", () => {
    /*
     * Both edges take the same time and the same curve; the trailing one
     * sets off later. Traced off the reference's own pill, whose trailing
     * edge holds a roughly constant fifth of the journey behind the
     * leading one the whole way. A constant lag is the back of a blob
     * following the front at a fixed distance, which is why the reference
     * reads as one object rather than a stretched rectangle.
     */
    const delay = Number(CSS.match(/--dock-trail-delay:\s*(\d+)ms/)?.[1]);
    expect(delay, "no lag, no stretch").toBeGreaterThan(0);
    expect(delay, "a lag this long tears the pill in two").toBeLessThan(80);
  });

  it("puts the lag on the trailing side, both ways", () => {
    // Going right, the left edge is the one that trails. Swap these and
    // the pill stretches backwards, away from where it is going.
    const right = CSS.slice(CSS.indexOf('[data-dir="right"]'));
    expect(right.slice(0, right.indexOf("}"))).toMatch(
      /--dock-left-delay:\s*var\(--dock-trail-delay\)/
    );
    const left = CSS.slice(CSS.indexOf('[data-dir="left"]'));
    expect(left.slice(0, left.indexOf("}"))).toMatch(
      /--dock-right-delay:\s*var\(--dock-trail-delay\)/
    );
  });

  it("moves the edges themselves, never a transform", () => {
    // A transform cannot stretch a pill without stretching its round ends
    // into ellipses, and the ends are most of what makes it a pill.
    expect(CSS).toMatch(/transition-property:\s*left,\s*right,\s*opacity/);
    expect(CSS).toMatch(/transition-delay:/);
  });

  it("holds still until it has been placed once", () => {
    expect(CSS).toMatch(
      /\.dock-marker:not\(\[data-travels\]\)\s*\{\s*transition:\s*none/
    );
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

describe("the capsule breathes with the travel", () => {
  const scaleOf = (frame: Keyframe) =>
    Number(String(frame.transform).replace(/[^\d.]/g, ""));

  it("does nothing without a direction to lean toward", () => {
    expect(swellFrames(null)).toBe(null);
  });

  it("scales both axes together, never one of them", () => {
    /*
     * THE RULE THIS FILE EXISTS TO HOLD. Traced off the reference, the
     * capsule's width and height move by the same fraction on every frame
     * (+1.96/+2.04, +3.99/+3.95, +2.66/+2.31, +0.67/+0.68). A one-axis
     * scale stretches letterforms sideways, which is what made an earlier
     * version of this bar feel wrong; a uniform scale magnifies type
     * instead of distorting it, which is how the reference moves every
     * label and still looks calm.
     */
    for (const dir of ["left", "right"] as const) {
      for (const frame of swellFrames(dir)!) {
        expect(String(frame.transform)).toMatch(/^scale\([\d.]+\)$/);
        expect(String(frame.transform)).not.toMatch(/scaleX|scaleY/);
      }
    }
  });

  it("starts and ends at rest, and peaks where it was measured", () => {
    const frames = swellFrames("right")!;
    expect(scaleOf(frames[0])).toBe(1);
    expect(scaleOf(frames[frames.length - 1])).toBe(1);
    expect(Math.max(...frames.map(scaleOf))).toBeCloseTo(SWELL_PEAK, 5);
    // The reference peaked at +3.99% on the frame this was traced from.
    expect(SWELL_PEAK).toBeGreaterThan(1.03);
    expect(SWELL_PEAK).toBeLessThan(1.05);
  });

  it("swells rather than snapping, and comes home through an undershoot", () => {
    /*
     * The reference takes 40% of the travel to reach its widest and
     * returns through a slight undershoot before settling, which is what
     * something springy does. An earlier version put the peak at 11% with
     * no undershoot: that is a flinch, not a breath.
     */
    const frames = swellFrames("right")!;
    const peak = Math.max(...frames.map(scaleOf));
    const at = frames.find((f) => scaleOf(f) === peak)!;
    expect(at.offset).toBeGreaterThan(0.3);
    expect(at.offset).toBeLessThan(0.5);
    expect(
      Math.min(...frames.map(scaleOf)),
      "it should dip under rest on the way home"
    ).toBeLessThan(1);
  });

  it("scales about the centre, with no lean", () => {
    // The reference is symmetric: at its widest the left edge had moved
    // -23.8px against the right edge's +23.7px, and the top -3.8 against
    // the bottom +3.9. The marker already says which way you are going.
    for (const frame of swellFrames("right")!) {
      expect(frame.transformOrigin).toBeUndefined();
    }
  });
});

describe("the pointer's pane answers the right inputs", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");
  const listeners = HOOK.slice(
    HOOK.indexOf("const cellUnder"),
    HOOK.indexOf("removeEventListener")
  );

  it("refuses a finger", () => {
    // Or the pane is left under the last cell tapped, which on a phone is
    // every cell the reader has ever pressed, one at a time, forever.
    expect(listeners).toContain('e.pointerType === "touch"');
  });

  it("takes focus only when the browser calls it keyboard focus", () => {
    /*
     * Tapping a link focuses it, so a bare `focusin` handler brings the
     * pane back on a phone through the other door. `:focus-visible` is the
     * browser's own answer to "was this a keyboard?", which is the line we
     * want and not one worth re-deriving from key events.
     */
    expect(listeners).toContain(':focus-visible');
  });

  it("tracks the pointer and the keyboard apart", () => {
    /*
     * One shared flag fails immediately: pressing a cell moves focus to it,
     * firing `focusout` on whatever held focus before, and a single flag
     * cleared there takes the pane out from under the cursor still sitting
     * on the cell.
     */
    expect(listeners).toMatch(/let pointerOn/);
    expect(listeners).toMatch(/let focusOn/);
    expect(listeners, "the pointer is the more immediate of the two").toContain(
      "pointerOn ?? focusOn"
    );
  });
});

describe("the marker leaves on the press, not on the route", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");

  it("aims at the pressed cell before the room answers", () => {
    /*
     * `activeId` is read from `usePathname()`, so without this the marker
     * cannot begin moving until the App Router commits. That ties the whole
     * bar to the network rather than to the finger.
     */
    expect(HOOK).toMatch(/const target = aimed\.current \?\? on/);
  });

  it("only bets on a cell that goes somewhere in this tab", () => {
    const press = HOOK.slice(HOOK.indexOf("const press = "), HOOK.indexOf("const release = "));
    // The add cell opens a dialog and the picker opens a menu: neither is a
    // destination, so neither may move the marker.
    expect(press).toContain("[data-dock-goes]");
    // A middle click or a held modifier opens the room in another tab.
    expect(press).toMatch(/e\.button !== 0/);
    expect(press).toMatch(/e\.metaKey/);
    expect(press).toMatch(/e\.ctrlKey/);
  });

  it("calls the bet off three ways, so the marker cannot lie", () => {
    // Released somewhere other than the cell it started on.
    expect(HOOK).toMatch(/if \(over !== aimed\.current\) callOff\(\)/);
    // The room answered with a different cell, or the cell is gone.
    expect(HOOK).toMatch(/on === aimed\.current \|\| !host\.contains\(aimed\.current\)/);
    // Nothing answered at all.
    expect(HOOK).toMatch(/setTimeout\(callOff, AIM_GIVES_UP_MS\)/);
  });

  it("gives up late rather than early", () => {
    // Snapping home mid-wait looks more broken than standing still.
    const ms = Number(HOOK.match(/AIM_GIVES_UP_MS = (\d+)/)?.[1]);
    expect(ms).toBeGreaterThanOrEqual(2000);
  });
});

describe("both docks spend the accent on news", () => {
  const WIDE = readFileSync("src/components/BookModeDock.tsx", "utf8");
  const PHONE = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");

  it("draws the dot on Home in both bars, not just the phone", () => {
    // The laptop dock drew nothing for months, which was an accident: the
    // two docks are one design and the accent is spent on news.
    for (const src of [WIDE, PHONE]) {
      expect(src).toMatch(/alertCount > 0 && !on|alertCount > 0 && !active/);
      expect(src).toContain("rounded-full bg-primary");
    }
  });

  it("keeps no tooltip that only restates a visible label", () => {
    /*
     * A `title` draws the browser's own unstyled tooltip a second after the
     * pointer settles, which is now a second answer to a gesture the hover
     * pane already answered. The one that stays teaches an interaction that
     * has no other home: right-click to rename or delete.
     */
    const titles = [...WIDE.matchAll(/title=\{?["']?([^"'}\n]*)/g)].map((m) => m[1]);
    expect(titles.length, "only the portfolio cells keep a title").toBe(1);
    expect(WIDE).toMatch(/right-click to rename or delete/);
  });
});
