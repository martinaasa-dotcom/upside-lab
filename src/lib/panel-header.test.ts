/**
 * A PANEL SUBTITLE IS THE LONGEST TEXT IN MOST PANELS, SO ON A PHONE IT
 * GETS THE WHOLE COLUMN.
 *
 * The icon and the copy were one flex row, so the subtitle was indented
 * past the icon at every width. That is right on a laptop, where the indent
 * ties the prose to the glyph heading it and costs 44 of a thousand pixels.
 * On a phone it is 44px of a 326px column, an eighth of the line.
 *
 * Measured across the 21 real (title, subtitle) pairs in this app, rendered
 * with the app's own compiled CSS:
 *
 *            subtitle lines   subtitle text width
 *   360px      79 -> 72          237 -> 281
 *   390px      75 -> 65          267 -> 311
 *   430px      65 -> 60          307 -> 351
 *   640px      42 -> 42          501 -> 501   (0 of 21 headers changed)
 *   1100px     26 -> 26          961 -> 961   (0 of 21 headers changed)
 *
 * The two numbers this file guards are the ones that make that true, and
 * both are measurements rather than taste, so a change to either is a
 * change somebody should make on purpose.
 *
 * Asserted against the source rather than a render, because this suite runs
 * in node and there is no jsdom in the repo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(process.cwd(), "src/components/ui/Panel.tsx"),
  "utf8"
);
const header = src.slice(src.indexOf("export function PanelHeader"));

describe("a panel header on a phone", () => {
  it("takes the subtitle out of the icon's column", () => {
    // The icon and the title are a row; the subtitle is the column's own
    // second child, so on a phone it starts at the panel's gutter.
    expect(header).toMatch(/SPLIT_COPY, "flex min-w-0 flex-col"/);
  });

  it("puts the indent back from the first breakpoint up", () => {
    /*
      44px is the icon's 32 plus the row's 12 gap. Only when there is an
      icon: a header without one never had an indent to restore.
    */
    expect(header).toMatch(/icon && "sm:pl-11"/);
  });

  it("keeps the icon from setting the row's height", () => {
    /*
      NOT A NUDGE, A MEASUREMENT. The icon is 32px and a panel title's line
      box is 28, so once the icon and the title are a row of their own the
      row is taller than the title and the subtitle hangs off the row
      rather than off the title: measured, the gap grew from 6px to 10 on a
      phone. Correcting that on the subtitle instead was wrong for a title
      that wraps to two lines, where the icon does not set the height at
      all and the correction fired anyway.

      The 2px the icon already had plus the 4 it overhangs, taken off its
      own box, holds a one-line title, a wrapped one and a hero alike: 0 of
      21 headers moved by a pixel at 640px or 1100px.
    */
    expect(header).toMatch(/subtitle && "mt-0\.5 -mb-1\.5"/);
  });

  it("does not correct the gap on the subtitle instead", () => {
    // That fired on wrapped titles, where there is no overhang to correct.
    expect(header).not.toMatch(/sm:mt-0\.5/);
    expect(header).not.toMatch(/sm:-mt-1/);
  });

  it("hangs the subtitle off its title, closer than sections sit apart", () => {
    /*
      A title and its subtitle are one thing said twice, so the space
      between them has to stay clearly smaller than the space between a
      panel's sections (24px on a phone, 32 from `sm`) -- a subtitle that
      floats as far from its title as the next section does stops reading
      as belonging to it.

      It is 8px rather than the 6 it was, which moved with the rest of the
      spacing pass: the subtitle's own lines opened up to 1.625 at the same
      time, and 6px under a looser paragraph read as the title resting on
      it. Asserted as the rule and its bound rather than as today's class,
      because the exact pin is what broke here on a change that was not
      about this.
    */
    const sub = header.match(
      /"(mt-[\d.]+) text-sm leading-relaxed text-muted-foreground"/
    );
    expect(sub).not.toBeNull();
    const step = Number(sub![1].slice(3));
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(6); // 24px, the panel's own section gap
  });
});
