/**
 * The ambient field must be dithered, and the dither must have a mean of
 * zero.
 *
 * Every lobe in this app is a very low alpha wash on a true black page, so
 * the whole ramp lives in the bottom of the range: measured on the real
 * landing page the warm lobe travels 36 luminance levels of 255 across
 * 840px and the cool one 31. Thirty levels over eight hundred pixels is a
 * step every twenty-three pixels, and a 1/255 step twenty-three pixels
 * wide is a contour line, which is what a reader was seeing ringing both
 * corners. Eight bits cannot hold that ramp and no arrangement of stops
 * changes it, so the answer is a dither and the filter in `AmbientDither`
 * is it.
 *
 * Two things about it fail silently, which is why they are asserted here
 * rather than left to a look at the page.
 *
 * The AMPLITUDE PAIR. The filter adds a bit of noise worth `2a` and then
 * subtracts `a` everywhere the noise could land. Those two numbers are
 * typed separately, and the day they stop being exactly double and half is
 * the day the field's mean moves: too small a subtraction lifts the black
 * the whole product is built on, too large a one darkens the lobes. It
 * costs nothing to check and nothing on the page would announce it.
 *
 * The CLIP. Both halves are masked by `SourceAlpha`, so a pixel the lobes
 * never reach comes back untouched. Without it the negative half clips at
 * zero, only the positive half survives, and every unlit pixel on the page
 * ends up half a level above black. Measured with the clip in place: pure
 * black pixels went from 0.98% of the frame to 1.37%, i.e. the dither
 * gives black back rather than taking it.
 *
 * And the filter has to be reachable. `url(#ambient-dither)` against an id
 * that is not in the document is not an error in CSS, it is a surface that
 * quietly renders undithered, so the root layout has to keep rendering it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILTER = readFileSync("src/components/AmbientDither.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");
const LAYOUT = readFileSync("src/app/layout.tsx", "utf8");

/** Every surface that has to ramp through the bottom of the range. */
const DITHERED = [".page-frame::before"];

/** Sample cards that must sit on the page field, not a private glow. */
const SAMPLE_SITES = [
  "src/components/SignedOutLanding.tsx",
  "src/components/SignInGate.tsx",
];

function alphaRowOf(matrixValues: string): number {
  // An feColorMatrix row is five numbers; the alpha row is the last five.
  const n = matrixValues.trim().split(/\s+/).map(Number);
  expect(n).toHaveLength(20);
  return n.slice(15).find((v) => v !== 0) ?? 0;
}

describe("the ambient dither", () => {
  it("adds exactly twice what it subtracts, so its mean is zero", () => {
    const matrices = [...FILTER.matchAll(/values="([^"]+)"/g)].map((m) => m[1]);
    expect(matrices).toHaveLength(2);
    const [grain, half] = matrices.map(alphaRowOf);
    expect(grain).toBeGreaterThan(0);
    expect(half).toBeGreaterThan(0);
    expect(grain).toBeCloseTo(half * 2, 10);
  });

  it("keeps the amplitude at two levels of 255", () => {
    // One level left the rings findable, three made the grain itself the
    // artefact. Both measured on the real page.
    const half = alphaRowOf(
      [...FILTER.matchAll(/values="([^"]+)"/g)].map((m) => m[1])[1]
    );
    expect(Math.round(half * 255)).toBe(2);
  });

  it("clips both halves to what the field actually paints", () => {
    expect(FILTER).toMatch(/in="SourceAlpha"[\s\S]*?result="lit"/);
    // the grain is masked by the lit area...
    expect(FILTER).toMatch(/in="grain"\s+in2="lit"\s+operator="in"/);
    // ...and the subtracted half is built from that same mask, not a flat k4
    expect(FILTER).toMatch(/in="lit"[\s\S]*?result="half"/);
    expect(FILTER).not.toMatch(/k4="-/);
  });

  it("is one octave of grain, not a cloud", () => {
    expect(FILTER).toContain('numOctaves="1"');
    const freq = Number(/baseFrequency="([\d.]+)"/.exec(FILTER)?.[1]);
    expect(freq).toBeGreaterThanOrEqual(0.5);
  });

  it("is rendered from the root layout, so the id resolves", () => {
    expect(LAYOUT).toContain("<AmbientDither />");
  });

  it("is defined inline rather than referenced from a data URI", () => {
    // Safari does not resolve a filter from a data URI, which would leave
    // every iPhone undithered and nothing here would fail.
    expect(CSS).not.toMatch(/filter:\s*url\("data:/);
  });

  it("does not put the dither on a landing-only page-tall layer", () => {
    expect(CSS).not.toContain(".landing-field::before {");
    expect(CSS).not.toContain(".landing-field::after {");
  });

  it("does not paint a second field behind the sample card", () => {
    expect(CSS).not.toContain(".ambient-glow {");
    expect(CSS).not.toContain(".landing-field .ambient-glow {");
  });
});

describe("surfaces that ramp through near-black", () => {
  for (const selector of DITHERED) {
    it(`${selector} carries the dither`, () => {
      const start = CSS.indexOf(`${selector} {`);
      expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);
      const rule = CSS.slice(start, CSS.indexOf("}", start));
      expect(rule).toContain("url(#ambient-dither)");
    });
  }

  it("does not put a private glow behind the sample cards", () => {
    expect(CSS).not.toContain(".ambient-glow {");
    for (const path of SAMPLE_SITES) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/className="ambient-glow"/);
      expect(source, "a hand-rolled two stop glow").not.toMatch(
        /bg-gradient-to-\w+[^"]*to-transparent/
      );
    }
  });
});
