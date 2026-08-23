/**
 * The landing page has to say, at the fold, that it continues.
 *
 * It was built on the idea that a sample card visibly severed by the bottom
 * of the window is its own scroll affordance, which is true and is the
 * strongest one there is. It is also only true while the hero is taller
 * than the window: on a large display the whole opening screen landed
 * inside the fold with nothing cut, and the page read as one screen that
 * had finished. Two things fix it together, and they have to stay in
 * proportion to each other, which is what this file is for.
 *
 *  - The hero carries a height floor a few rem short of a screen, so on a
 *    tall window the next section is always in view.
 *  - `ScrollCue` fades the bottom of the window into the field and pins a
 *    control to it.
 *
 * Asserted against the source, because these are numbers typed into class
 * names and the failure is a layout nobody looks at on the one window size
 * where it matters.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const CUE = readFileSync("src/components/ScrollCue.tsx", "utf8");

/** Tailwind's `h-N` is N quarter-rems. */
function remsFromHeightClass(source: string) {
  const match = source.match(/\bh-(\d+)\b[^"]*bg-gradient-to-t/);
  expect(match, "the fade carries a height").not.toBeNull();
  return Number(match![1]) / 4;
}

/** The hero's floor, as the gap it leaves at the bottom of the window. */
function peekRems(source: string) {
  const match = source.match(/min-h-\[calc\(100svh-(\d+(?:\.\d+)?)rem\)\]/);
  expect(match, "the hero carries a height floor").not.toBeNull();
  return Number(match![1]);
}

describe("the scroll cue", () => {
  it("is mounted on the landing page", () => {
    expect(LANDING).toContain("<ScrollCue />");
  });

  it("is pinned to the window, not laid out under the last card", () => {
    // The old chevron sat below the sample card, which is to say off screen
    // at the one moment the hint is needed.
    expect(CUE).toContain("fixed");
    expect(CUE).toContain("bottom-notice");
  });

  it("stops drawing once the reader has scrolled or has nowhere to go", () => {
    expect(CUE).toContain("scrollTop");
    expect(CUE).toContain("scrollHeight");
  });

  it("never swallows clicks along the bottom of the page", () => {
    // Full width and transparent over content. Without this it eats every
    // click on the bottom strip of every landing.
    const fade = CUE.slice(CUE.indexOf("bg-gradient-to-t") - 400);
    expect(fade).toContain("pointer-events-none");
  });

  it("leaves the next section standing clear of its own fade", () => {
    // A peek shorter than the fade would be faded out by the very thing
    // meant to be pointing at it.
    expect(peekRems(LANDING)).toBeGreaterThan(remsFromHeightClass(CUE));
  });

  it("uses `svh`, so a retracting address bar cannot outgrow the hero", () => {
    expect(LANDING).toContain("100svh");
    expect(LANDING).not.toContain("100dvh");
  });
});
