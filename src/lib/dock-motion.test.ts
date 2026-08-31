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
  DOCK_MOTION,
  MARKER_MS,
  SAMPLE_MS,
  SWELL_PEAK,
  markGeometry,
  sameMark,
  swellFrames,
  travelDirection,
  travelKeyframes,
} from "@/lib/dock-motion";

const CSS = readFileSync("src/app/dock.css", "utf8");

describe("dock marker geometry", () => {
  it("is a cell's left edge and its width", () => {
    expect(markGeometry(120, 96)).toEqual({ left: 120, width: 96 });
  });

  it("never reports a negative width", () => {
    expect(markGeometry(0, -5).width).toBe(0);
  });

  it("is idempotent, so measuring cannot re-render forever", () => {
    const a = markGeometry(120, 96);
    const b = markGeometry(120, 96);
    expect(sameMark(a, b)).toBe(true);
    expect(sameMark(a, null)).toBe(false);
    expect(sameMark(null, null)).toBe(true);
  });
});

describe("dock marker direction", () => {
  it("reads the way it is going off the left edge", () => {
    const home = markGeometry(0, 96);
    const away = markGeometry(300, 96);
    expect(travelDirection(home, away)).toBe("right");
    expect(travelDirection(away, home)).toBe("left");
  });

  it("calls a pure resize no direction at all", () => {
    // The cell grew or shrank under a still marker. There is no journey,
    // so neither edge leads and both settle together.
    expect(
      travelDirection(markGeometry(120, 96), markGeometry(120, 110))
    ).toBe(null);
  });
});

describe("the marker travels on the compositor", () => {
  const from = markGeometry(0, 120);
  const to = markGeometry(124, 120);
  const frames = travelKeyframes(from, to);
  const px = (f: Keyframe) =>
    Number(String(f.transform).match(/translateX\((-?[\d.]+)px\)/)![1]);
  const sx = (f: Keyframe) =>
    Number(String(f.transform).match(/scaleX\(([\d.]+)\)/)![1]);

  it("moves with a transform, never with a layout property", () => {
    /*
     * `left` and `right` are laid out on the main thread, which is exactly
     * what a route change is busy with: measured on a phone recording,
     * every travel stalled four to six frames mid-flight and then jumped.
     */
    for (const f of frames) expect(String(f.transform)).toMatch(/^translateX\(/);
    expect(CSS).toMatch(/transform-origin:\s*0 50%/);
    expect(CSS, "geometry must not transition").not.toMatch(
      /transition-property:\s*left/
    );
  });

  it("starts where it was and lands exactly on the cell", () => {
    expect(px(frames[0])).toBeCloseTo(0, 3);
    expect(sx(frames[0])).toBeCloseTo(1, 3);
    const last = frames[frames.length - 1];
    expect(px(last)).toBeCloseTo(124, 3);
    expect(sx(last), "at rest the caps must be circles").toBeCloseTo(1, 6);
  });

  it("stretches, gently, and never runs backwards", () => {
    const peak = Math.max(...frames.map(sx));
    expect(peak, "no lag, no stretch").toBeGreaterThan(1.02);
    expect(peak, "a big lag on a round cap reads as an egg").toBeLessThan(1.2);
    for (let i = 1; i < frames.length; i += 1) {
      expect(px(frames[i])).toBeGreaterThanOrEqual(px(frames[i - 1]) - 0.001);
    }
  });

  it("has a value for every frame the browser could draw", () => {
    // "More frames" is the sampling: at 8ms the curve is the curve rather
    // than an approximation of it.
    expect(SAMPLE_MS).toBeLessThanOrEqual(8);
    expect(frames.length).toBeGreaterThan(MARKER_MS / SAMPLE_MS);
  });

  it("leans the stretch toward where it is going", () => {
    const back = travelKeyframes(to, from);
    const mid = back[Math.floor(back.length / 3)];
    expect(px(mid)).toBeLessThan(124);
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
    expect(reduced).toContain(".dock-breathe");
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
    // The reference peaked at +3.99% on the frame this was traced from, and
    // the phone bar is the surface it was traced off, so it may sit near
    // that rather than at half of it.
    expect(SWELL_PEAK).toBeGreaterThan(1.02);
    expect(SWELL_PEAK).toBeLessThanOrEqual(1.04);
  });

  it("is off outright at a peak of 1, rather than sixteen frames of nothing", () => {
    /*
     * The laptop bar's off switch. Frames of `scale(1)` would draw the same
     * picture and still hand the compositor an animation to run and the
     * type under it to re-raster, so the switch has to be the absence of
     * an animation and not a scale of one.
     */
    expect(swellFrames("right", 1)).toBe(null);
    expect(swellFrames("left", 1)).toBe(null);
    expect(swellFrames("right", DOCK_MOTION.wide.swellPeak)).toBe(null);
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

describe("each bar breathes at the moment its input gives it", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");
  const WIDE = readFileSync("src/components/BookModeDock.tsx", "utf8");
  const PHONE = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");

  it("never lurches the laptop bar on a click", () => {
    /*
     * A bar that swells every time you press it is arguing with a decision
     * you have already made, and it is the one part of the dock that has to
     * re-raster nine cells of type to do it. The marker says where you are
     * going; the capsule has nothing to add.
     */
    expect(DOCK_MOTION.wide.swellPeak).toBe(1);
    expect(swellFrames("right", DOCK_MOTION.wide.swellPeak)).toBe(null);
  });

  it("does not slide the laptop marker across the bar at all", () => {
    /*
     * The travelling pill is the piece of this design that reads worst with
     * a pointer. A finger has nothing else going on while it waits, so a
     * marker crossing the bar is company; a mouse has already arrived, and
     * watching the bar take 220ms to agree with the cell you clicked is the
     * bar being slower than you are. `glide` writes the resting geometry
     * and returns at a duration of zero, so the marker is simply there.
     */
    expect(DOCK_MOTION.wide.travelMs).toBe(0);
    expect(HOOK).toMatch(/if \(opts\.durationMs <= 0\) return;/);
    // The phone keeps its travel: different input, different numbers.
    expect(DOCK_MOTION.phone.travelMs).toBeGreaterThan(0);
  });

  it("keeps the laptop swell barely there", () => {
    // 0.6% on a 1,164px bar is about 3.5px an edge: it says the bar
    // noticed the pointer, and nothing more.
    expect(DOCK_MOTION.wide.hoverPeak).toBeGreaterThan(1);
    expect(DOCK_MOTION.wide.hoverPeak).toBeLessThanOrEqual(1.008);
  });

  it("gives the laptop bar the pointer instead, held for as long as it is pointed at", () => {
    // A transition, not an animation: this is a state the bar sits in while
    // the pointer is on it, the same gesture the Margus button makes.
    expect(DOCK_MOTION.wide.hoverPeak).toBeGreaterThan(1);
    expect(WIDE).toContain("dock-breathe");
    expect(WIDE).toContain("--dock-breathe-peak");
    expect(WIDE).toContain("--dock-breathe-ms");

    const at = CSS.indexOf(".dock-breathe:hover");
    expect(at, "the hover swell is in the stylesheet").toBeGreaterThan(-1);
    expect(CSS.slice(at, at + 200)).toMatch(/transform:\s*scale\(/);
    expect(CSS.slice(at, at + 200)).not.toMatch(/animation:/);
  });

  it("keeps the pointer swell off a screen that has no pointer", () => {
    // A touch screen latches `:hover` after a tap, which would leave the
    // phone's bar permanently 1.5% larger than it is.
    const at = CSS.indexOf(".dock-breathe");
    const gate = CSS.lastIndexOf("@media (hover: hover)", at);
    expect(gate).toBeGreaterThan(-1);
    expect(CSS.slice(gate, at)).toContain("pointer: fine");
    expect(PHONE).not.toContain("dock-breathe");
  });

  it("does not change the scale when a cell is pressed", () => {
    /*
     * The cells have their own press (0.955) and the capsule holding still
     * under the finger is what makes that press read as landing on
     * something solid. A second scale on the bar itself would be the
     * lurch this change exists to remove, arriving through `:active`.
     */
    expect(CSS).not.toMatch(/\.dock-breathe:active/);
  });

  it("gives the phone bar the fuller breath, since the travel is all it has", () => {
    /*
     * No pointer, so the travel carries every bit of this bar's motion, and
     * it is the surface the reference recording was traced off: six glyphs,
     * no letterform to distort, measured free at every CPU throttle. It
     * should read louder and run longer than it did when both bars shared
     * one set of numbers.
     */
    expect(DOCK_MOTION.phone.swellPeak).toBeGreaterThan(1.02);
    expect(DOCK_MOTION.phone.swellMs).toBeGreaterThan(400);
    expect(DOCK_MOTION.phone.travelMs).toBeGreaterThan(DOCK_MOTION.wide.travelMs);
    // A longer lag is a longer smear: the trailing edge falls further
    // behind the leading one, which is the whole of what reads as liquid.
    expect(DOCK_MOTION.phone.lagMs).toBeGreaterThan(DOCK_MOTION.wide.lagMs);
  });

  it("still lands the phone's stretch short of an egg", () => {
    // The pill's caps are circles at rest and go oval only in flight. A
    // one-cell move on a 120px cell is the common case and must stay well
    // under the reference's own 1.29x.
    const from = markGeometry(0, 120);
    const to = markGeometry(120, 120);
    const widest = Math.max(
      ...travelKeyframes(from, to, {
        durationMs: DOCK_MOTION.phone.travelMs,
        lagMs: DOCK_MOTION.phone.lagMs,
      }).map((f) => Number(String(f.transform).match(/scaleX\(([\d.]+)\)/)![1]))
    );
    expect(widest).toBeGreaterThan(1.05);
    expect(widest).toBeLessThan(1.3);
  });
});

describe("the phone bar stays wordless, and both bars weight the active glyph", () => {
  const PHONE = readFileSync("src/components/mobile/MobileTabBar.tsx", "utf8");
  const WIDE = readFileSync("src/components/BookModeDock.tsx", "utf8");
  const CSSFILE = readFileSync("src/app/globals.css", "utf8");

  it("says the pressed room's name rather than painting six of them", () => {
    /*
     * PAINTED NAMES WERE TRIED AND TAKEN BACK OUT, and the arithmetic is
     * why: the reference bar carries four destinations across ~380px, about
     * 95px each, and this one carries six across 374px, about 57px each --
     * 60% of the room for the same icon-over-word cell. Built and measured,
     * nothing truncated and the bar came down to 52px, and it still read as
     * a wall of text, because six words at 12px in 374px is one however it
     * is set. The name is spoken on the press instead, on `pointerdown`
     * rather than `click`, because a name arriving after the tap it was
     * meant to answer is a name nobody needed.
     */
    expect(PHONE).toContain("dock-say");
    expect(PHONE).toMatch(/onPointerDown=\{\(e\) => say\(shortLabel/);
    // A keyboard never presses anything, so focus is that person's press.
    expect(PHONE).toMatch(/onFocus=\{\(e\) => say\(shortLabel/);
    expect(CSS).toContain(".dock-say");
  });

  it("keeps the capsule hugging its glyphs", () => {
    // Six names need the whole page; six glyphs do not, and a bar that hugs
    // is the thing that reads as a floating capsule rather than a slab.
    expect(PHONE).toContain("w-fit");
    expect(PHONE).not.toContain("{shortLabel}</span>");
  });

  it("says which room you are in with weight, on both bars", () => {
    /*
     * The one thing kept from the labelled round. Filled against outline is
     * the read the reference uses and it does not survive this icon set,
     * half of which is open paths (a line chart, a trend arrow) that fill
     * into a blot. Weight reads the same and reads on all six.
     */
    expect(PHONE).toMatch(/strokeWidth=\{on \? 2\.5 : 1\.75\}/);
    expect(WIDE).toMatch(/strokeWidth=\{active \? 2\.5 : 1\.75\}/);
    expect(WIDE).toMatch(/strokeWidth=\{onCircle \? 2\.5 : 1\.75\}/);
  });

  it("holds the dock fill above the colour-step threshold", () => {
    /*
     * The bar is a tint of whatever room is under it, so when the room
     * changes the bar changes in one frame. Measured off a recording of the
     * real app between Circle and Home it stepped 5.15 in luminance and 9.8
     * in red-minus-blue at the old 45%-through fill, on a surface whose own
     * mean is in the teens. At 28% through it steps 3.14 and 6.0. Nothing
     * can ease it -- what changed is the page -- so the fill is the only
     * lever, and past roughly 22% the pane goes darker than the field and
     * reads as a hole cut in the page.
     */
    const at = CSSFILE.indexOf(".glass-dock {");
    expect(at).toBeGreaterThan(-1);
    const rule = CSSFILE.slice(at, at + 200);
    const through = Number(rule.match(/transparent (\d+)%/)![1]);
    expect(through).toBeLessThanOrEqual(30);
    expect(through).toBeGreaterThanOrEqual(20);
  });

  it("warms the room on the press rather than on the commit", () => {
    /*
     * Measured on the real bar, a tap dispatches its click about 2ms after
     * `pointerdown`, so nothing about the navigation waits on the motion.
     * What this covers is the address Link never warmed: Circle's href is
     * resolved in the browser and changes after mount.
     */
    const hook = readFileSync("src/lib/use-dock-marker.ts", "utf8");
    const aim = hook.slice(hook.indexOf("const aim ="), hook.indexOf("const press ="));
    expect(aim).toContain("router.prefetch");
    expect(aim).toContain('getAttribute("href")');
  });
});

describe("a bet the router is about to confirm is not called off", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");

  it("treats a click on the aimed cell as a commitment, not a bet", () => {
    /*
     * THE GLITCH THIS EXISTS TO STOP. `callOff` repositions the marker to
     * whatever is still lit, and during a navigation that is the cell you
     * are LEAVING -- so any pointer event landing off the cell while the
     * room renders sent the marker all the way home and all the way back.
     *
     * Measured off a recording of the real app: the marker completed its
     * travel, sat on the new cell for about 350ms, then teleported back
     * and replayed the journey the moment the room arrived. Reproduced
     * against the real component with a 350ms commit, it logged two
     * travels 7ms apart, `312 -> 4` then `4 -> 312`.
     */
    expect(HOOK).toContain("going.current = true");
    // The release guard stands down once the click has landed.
    expect(HOOK).toMatch(/if \(!aimed\.current \|\| going\.current\) return;/);
    // A cancel BEFORE the click is still a genuinely abandoned press.
    expect(HOOK).toMatch(/const abandon[\s\S]{0,120}going\.current/);
    expect(HOOK).toContain('addEventListener("pointercancel", abandon)');
  });

  it("makes a reverted bet arrive rather than travel", () => {
    // Reverting is a correction, not a journey: animating it draws a
    // second full trip across the bar for a room nobody went to.
    expect(HOOK).toContain("reverting.current = true");
    expect(HOOK).toMatch(/glide\(pane, reverting\.current \|\| arriving \? null : lastMark\.current/);
    // ...and it must not breathe for a journey that is not happening.
    expect(HOOK).toMatch(/lastMark\.current && next && !reverting\.current && !arriving/);
  });

  it("solves the travel curve once rather than on every press", () => {
    /*
     * `travelKeyframes` runs synchronously inside `pointerdown`, before the
     * browser can dispatch the click that navigates. Binary-searching the
     * bezier twice per sample is about 2,100 solver iterations per tap for
     * a curve that never changes.
     */
    const src = readFileSync("src/lib/dock-motion.ts", "utf8");
    expect(src).toContain("easeTable");
    // It takes no curve: a table keyed to nothing would answer for the
    // wrong one if a second curve were ever passed in.
    expect(src).toMatch(/function eased\(t: number\)/);
    const table = travelKeyframes(markGeometry(0, 120), markGeometry(120, 120), {
      durationMs: 340,
      lagMs: 18,
    });
    // Still the same curve: monotonic, starts where it was, ends on the mark.
    const xs = table.map((f) => Number(String(f.transform).match(/translateX\(([-\d.]+)px\)/)![1]));
    expect(xs[0]).toBeCloseTo(0, 4);
    expect(xs[xs.length - 1]).toBeCloseTo(120, 4);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-6);
  });
});

describe("a bar in a hidden room does not measure itself", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");

  it("refuses to measure, animate or bet while it has no layout box", () => {
    /*
     * THE ONE THAT PUT THE MARKER ON THE WRONG CELL.
     *
     * `WorkspaceShell` keeps every visited room mounted behind `hidden`,
     * and each room draws its own dock: two of these on the book, three
     * once you have been to Circle. A hidden element has no layout box, so
     * `offsetLeft` and `offsetWidth` are both 0, and measuring one records
     * `{left: 0, width: 0}` as the marker's last known place. Show that
     * room again and the travel is computed from there -- a zero-width pill
     * at the far left sweeping across the whole bar.
     *
     * And the cell you PRESS belongs to the bar about to be hidden, while
     * the bar you end up looking at is a different element with a different
     * hook instance, so the bet is placed on one bar and settled on another.
     *
     * Measured by walking the real app through twelve room changes at 1x,
     * 4x and 6x CPU, three times over: before this guard, **7 of 36 landed
     * on the wrong cell and 105 painted frames carried a collapsed marker
     * at the bar's left edge**. After it, 0 and 0.
     */
    expect(HOOK).toMatch(/function onScreen\(el: HTMLElement\)/);
    expect(HOOK).toContain("getClientRects().length > 0");
    expect(HOOK).toMatch(/if \(!visible\.current\) \{/);
    // ...and the answer is cached off the render path: asking for it in a
    // layout effect that runs after every render forces a synchronous
    // layout per render per mounted dock. Profiled on one hop at 4x CPU
    // that was 323ms of 942ms. The ResizeObserver hands it over for free.
    expect(HOOK).toContain("entry.contentRect.width > 0");
    // the bet dies with the room
    const guard = HOOK.slice(HOOK.indexOf("if (!visible.current)"), HOOK.indexOf("const arriving"));
    expect(guard).toContain("wasHidden.current = true");
    expect(guard).toContain("aimed.current = null");
    expect(guard).toContain("return;");
  });

  it("arrives rather than travels on the frame a room is shown again", () => {
    // Whatever the reader last saw on that bar is not a place the marker
    // should be seen crossing back from.
    expect(HOOK).toContain("const arriving = wasHidden.current");
    expect(HOOK).toMatch(/reverting\.current \|\| arriving \? null : lastMark\.current/);
    expect(HOOK).toMatch(/!reverting\.current && !arriving/);
  });

  it("keeps the hover pane off a cell with no box either", () => {
    expect(HOOK).toMatch(/host\.contains\(cell\) && onScreen\(cell\)/);
  });
});

describe("a press says where it is going, so the page can answer it", () => {
  const HOOK = readFileSync("src/lib/use-dock-marker.ts", "utf8");
  const BOOK = readFileSync("src/components/Dashboard.tsx", "utf8");

  it("publishes the aimed cell's address on the press", () => {
    /*
     * THE MEASUREMENT THIS EXISTS FOR. Screencast frame by frame at 4x CPU,
     * tapping Growth: for 600ms only about 2% of the pixels changed -- the
     * dock marker, and nothing else -- and then 21% of the screen swapped
     * in a single frame. `<Link>` navigates inside `startTransition`, and a
     * transition keeps the old screen up until the new one is completely
     * built, so a tap buys no answer at all until the very end. That gap,
     * not the total, is what a slow tap is.
     */
    const aim = HOOK.slice(HOOK.indexOf("const aim ="), HOOK.indexOf("const press ="));
    expect(aim).toContain("aimRoute(href)");
    // a bet that loses withdraws the page's aim with the marker's
    expect(HOOK).toMatch(/aimed\.current = null;[\s\S]{0,80}aimRoute\(null\)/);
  });

  it("shows the aimed tab now, and lets the path settle it", () => {
    expect(BOOK).toContain("onRouteAim");
    // an ordinary state update, never a transition: it has to render on the
    // next frame, which is the whole point.
    expect(BOOK).toContain("setAimedPath");
    expect(BOOK).toContain("const shownPath = aimedPath ?? pathname");
    // the room answering is the truth from there on
    expect(BOOK).toMatch(/setAimedPath\(null\);\s*\}, \[pathname\]\)/);
  });

  it("refuses to bet on a room the book cannot draw", () => {
    // Circle and the Fund are other rooms; this component cannot show them
    // early, and pretending would draw the wrong screen.
    expect(BOOK).toMatch(/workspaceRoomId\(path\) !== "book"/);
    // and it gives up rather than sitting on a bet nothing answered
    expect(BOOK).toContain("AIM_GIVES_UP_MS");
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
