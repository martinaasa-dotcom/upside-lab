import { describe, expect, it } from "vitest";

import { MARK_SIZE } from "@/components/UpsideLogo";
import { ICON_PRESETS, MARK_ASPECT, MARK_BOX } from "@/lib/brand/mark";

/*
  The lockup sizes the mark with literal Tailwind classes, because Tailwind
  only emits arbitrary values it can read as literal strings at build time. A
  literal cannot follow the geometry on its own, so this is what makes it
  follow: move a foot in `mark.ts` and these fail until the classes catch up.

  Without it the failure is silent and ugly. The mark keeps its box and the
  drawing letterboxes inside it, so the letter shrinks and drifts off the
  optical centre of the lockup by a couple of pixels -- enough to look wrong
  in the app bar, never enough to look like a bug.
*/

/** `h-[1.4em] w-[1.23em]` -> `{ h: 1.4, w: 1.23, unit: "em" }`. */
function parse(classes: string) {
  const h = classes.match(/h-\[([\d.]+)(em|rem)\]/);
  const w = classes.match(/w-\[([\d.]+)(em|rem)\]/);
  if (!h || !w) throw new Error(`not a height/width pair: ${classes}`);
  expect(h[2]).toBe(w[2]);
  return { h: Number(h[1]), w: Number(w[1]) };
}

describe("the lockup's mark sizes", () => {
  it.each(Object.entries(MARK_SIZE))(
    "%s is drawn at the letter's own aspect",
    (_name, classes) => {
      const { h, w } = parse(classes);
      /*
        Half a percent of the height. The classes are rounded to the hundredth
        of an em, so an exact match is not on offer; anything looser than this
        is a visible letterbox at splash size.
      */
      expect(Math.abs(w - h * MARK_ASPECT)).toBeLessThan(h * 0.005);
    }
  );
});

describe("the icon presets", () => {
  it("never lets the mark leave the crop an adaptive icon reserves", () => {
    /*
      Android crops a maskable icon to a circle 80 percent of the side, and
      some launchers crop closer to a squircle. What has to fit is the
      drawing's diagonal, not its width: a letter that fits the circle across
      can still have a foot outside it on the diagonal.
    */
    const diagonal = Math.hypot(MARK_BOX.width, MARK_BOX.height);
    for (const preset of ["maskable", "avatar"] as const) {
      expect(diagonal * ICON_PRESETS[preset].glyph).toBeLessThan(64 * 0.8);
    }
  });

  it("keeps the square shapes square, so the system draws the corner", () => {
    /*
      iOS, iPadOS and macOS mask the icon themselves. An icon that arrives
      already rounded gets rounded twice, and the tell is a thin dark crescent
      inside each corner -- which is what every icon in this repo shipped with
      before 2026-08-23.
    */
    expect(ICON_PRESETS.app.radius).toBe(0);
    expect(ICON_PRESETS.maskable.radius).toBe(0);
    expect(ICON_PRESETS.avatar.radius).toBe(0);
  });
});
