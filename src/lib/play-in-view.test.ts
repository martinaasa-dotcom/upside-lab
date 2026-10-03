/**
 * The arrival watcher and the stylesheet name the same classes, or a chart
 * is held by one and never released by the other (or the reverse: marked
 * as held and animating off screen anyway). Both lists are read here and
 * compared, and every held class must stop moving under reduced motion.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ARRIVAL_SELECTOR, measuredFor, watchArrivals } from "@/lib/play-in-view";

const MOTION = readFileSync("src/app/motion.css", "utf8");
const WATCHER = readFileSync("src/lib/play-in-view.ts", "utf8");
const GLOBALS = readFileSync("src/app/globals.css", "utf8");
const CSS = `${GLOBALS}\n${MOTION}`;

const classes = ARRIVAL_SELECTOR.split(",").map((s) => s.trim().slice(1));

/** The held rule's selector, after its comment. */
function heldRule(): string {
  const title = MOTION.indexOf("HELD UNTIL SEEN");
  expect(title, "the held rule is missing from motion.css").toBeGreaterThan(-1);
  const start = MOTION.indexOf("*/", title) + 2;
  return MOTION.slice(start, MOTION.indexOf("animation-play-state", start));
}

/** Every innermost `selector { body }` pair in the stylesheets. */
const BLOCKS = [...CSS.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (m) => ({ selector: m[1], body: m[2] })
);
const hasClass = (selector: string, name: string) =>
  new RegExp(`\\.${name}(?![\\w-])`).test(selector);

describe("charts arrive where somebody can see them", () => {
  it("holds exactly the classes the watcher looks for", () => {
    const rule = heldRule();
    for (const name of classes) {
      expect(rule, `.${name} is watched but never paused`).toContain(`.${name}`);
    }
    const inRule = [...rule.matchAll(/\.([a-z-]+)/g)].map((m) => m[1]);
    for (const name of new Set(inRule)) {
      expect(classes, `.${name} is paused but never watched`).toContain(name);
    }
  });

  it("pauses rather than removes, so a held element keeps its first frame", () => {
    const start = MOTION.indexOf("HELD UNTIL SEEN");
    const body = MOTION.slice(start, MOTION.indexOf("}", start));
    expect(body).toContain("animation-play-state: paused");
    expect(body).not.toMatch(/animation:\s*none/);
  });

  it("names only classes that really animate, and each stops under reduced motion", () => {
    const calm = [...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)]
      .map((m) => m[1])
      .join("\n");
    for (const name of classes) {
      expect(
        BLOCKS.some((b) => hasClass(b.selector, name) && /animation(-name)?:/.test(b.body)),
        `.${name} has no animation anywhere`
      ).toBe(true);
      expect(hasClass(calm, name), `.${name} keeps moving under reduced motion`).toBe(true);
    }
  });

  it("does nothing on the server", () => {
    const stop = watchArrivals();
    expect(typeof stop).toBe("function");
    stop();
  });
});

/**
 * A held arrival sits on its first frame, and the first frame of a line is
 * clipped to no width and of a bar or a dot is scaled to nothing. Chrome
 * measures an observed element after its clip and transform, so observing
 * the arrival itself reports it off screen forever and it is never
 * released: every chart line on Home stayed invisible with only its end
 * dot drawn. These hold the shape of the fix.
 */
describe("a held arrival can always be released", () => {
  type Fake = { matches: (s: string) => boolean; parentElement: Fake | null; name: string };
  const node = (name: string, arrival: boolean, parent: Fake | null): Fake => ({
    name,
    parentElement: parent,
    matches: (sel: string) => arrival && sel === ARRIVAL_SELECTOR,
  });

  it("is measured on its nearest ancestor that is not itself an arrival", () => {
    const panel = node("panel", false, null);
    const row = node("row", true, panel);
    const bar = node("bar", true, row);
    expect((measuredFor(bar as unknown as Element) as unknown as Fake).name).toBe("panel");
    const svg = node("svg", false, panel);
    const line = node("line", true, svg);
    expect((measuredFor(line as unknown as Element) as unknown as Fake).name).toBe("svg");
  });

  it("never observes the arrival element itself", () => {
    const observed = [...WATCHER.matchAll(/seen\.observe\(([^)]*)\)/g)].map((m) => m[1]);
    expect(observed.length).toBeGreaterThan(0);
    for (const target of observed) expect(target).toBe("box");
    expect(WATCHER).toMatch(/const box = measuredFor\(el\);/);
  });

  it("has a second witness that releases anything on screen the observer missed", () => {
    expect(WATCHER).toMatch(/const sweep = \(\) =>/);
    expect(WATCHER).toMatch(/window\.setTimeout\(sweep, 1500\)/);
  });
});

