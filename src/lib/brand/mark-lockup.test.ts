import { describe, expect, it } from "vitest";

import { MARK_SIZE } from "@/components/UpsideLogo";
import {
  ICON_BOX,
  ICON_PRESETS,
  MARK_ASPECT,
  MARK_BOX,
  facetScale,
  presetScale,
} from "@/lib/brand/mark";

/*
  The lockup sizes the mark with literal Tailwind classes, because Tailwind
  only emits arbitrary values it can read as literal strings at build time. A
  literal cannot follow the geometry on its own, so this is what makes it
  follow: move a facet in `mark.ts` and these fail until the classes catch up.

  Without it the failure is silent and ugly. The mark keeps its box and the
  drawing letterboxes inside it, so it shrinks and drifts off the optical
  centre of the lockup by a couple of pixels -- enough to look wrong in the
  app bar, never enough to look like a bug.
*/

/** `h-[1.4em] w-[1.74em]` -> `{ h: 1.4, w: 1.74 }`. */
function parse(classes: string) {
  const h = classes.match(/h-\[([\d.]+)(em|rem)\]/);
  const w = classes.match(/w-\[([\d.]+)(em|rem)\]/);
  if (!h || !w) throw new Error(`not a height/width pair: ${classes}`);
  expect(h[2]).toBe(w[2]);
  return { h: Number(h[1]), w: Number(w[1]) };
}

describe("the lockup's mark sizes", () => {
  it.each(Object.entries(MARK_SIZE))(
    "%s is drawn at the mark's own aspect",
    (_name, size) => {
      const { h, w } = parse(size.classes);
      /*
        Half a percent of the height. The classes are rounded to the hundredth
        of an em, so an exact match is not on offer; anything looser than this
        is a visible letterbox at splash size.
      */
      expect(Math.abs(w - h * MARK_ASPECT)).toBeLessThan(h * 0.005);
    }
  );

  it("cuts the hairlines from a size each lockup actually lands at", () => {
    /*
      The app bar draws the mark at about 24px, where the hairlines between
      the facets are three quarters of a pixel and the mosaic turns to mud, so
      it has to be swelled. The splash draws it at 208px, where the same
      hairlines are the whole point of the mark and must not be.

      A `drawnAt` that drifted from its class -- someone changes the box and
      leaves the number -- would not throw. It would just cut the mark for the
      wrong size, and the only symptom is a logo that looks slightly off.
    */
    expect(facetScale(MARK_SIZE.stack.drawnAt)).toBe(1);
    expect(facetScale(MARK_SIZE.wordmark.drawnAt)).toBeGreaterThan(1);

    // 16px root, and the em sizes each variant sets around the mark.
    const expected = { stack: 13 * 16, icon: 1.68 * 28, wordmark: 1.74 * 14 };
    for (const [name, px] of Object.entries(expected)) {
      const size = MARK_SIZE[name as keyof typeof MARK_SIZE];
      expect(Math.abs(size.drawnAt - px)).toBeLessThan(px * 0.06);
    }
  });
});

describe("the icon presets", () => {
  it("never lets the mark leave the crop an adaptive icon reserves", () => {
    /*
      Android crops a maskable icon to a circle 80 percent of the side, and
      some launchers crop closer to a squircle. What has to fit is the
      drawing's diagonal, not its width: a mark that fits the circle across
      can still have a foot outside it on the corner.
    */
    for (const preset of ["maskable", "avatar"] as const) {
      const s = presetScale(preset);
      const diagonal = Math.hypot(MARK_BOX.width * s, MARK_BOX.height * s);
      expect(diagonal).toBeLessThan(ICON_BOX * 0.8);
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

  it("keeps every foot clear of the squircle the system cuts", () => {
    /*
      The feet are the widest part of the mark and they sit lowest, so they
      are the first thing a corner takes. Checked against the actual corner
      arc rather than a bounding box, because a bounding-box check on a
      triangle is far too pessimistic and would push the mark smaller than it
      needs to be.
    */
    for (const preset of ["app", "tile"] as const) {
      const s = presetScale(preset);
      const half = (MARK_BOX.width * s) / 2;
      const footY = ICON_BOX / 2 + (MARK_BOX.height * s) / 2;
      const r = ICON_BOX * 0.225;
      const cy = ICON_BOX - r;
      const dy = Math.max(0, footY - cy);
      const maskX = dy >= r ? r : r - Math.sqrt(r * r - dy * dy);
      expect(ICON_BOX / 2 - half).toBeGreaterThan(maskX + 4);
    }
  });
});
