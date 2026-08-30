import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A room is three to eight screens tall and a reader sees the first one.
 * These hold the two rules that follow from that, and the measurements
 * behind them, because both are easy to apply somewhere they cost rather
 * than save.
 */
const BELOW = readFileSync("src/components/BelowFold.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");
const HOLDINGS = readFileSync("src/components/Dashboard.tsx", "utf8");
const GROWTH = readFileSync("src/components/CompoundInterestSheet.tsx", "utf8");
const PULSE = readFileSync("src/components/PulsePage.tsx", "utf8");
const CIRCLE = readFileSync("src/components/CircleHome.tsx", "utf8");

describe("a section nobody can see is built when they come to it", () => {
  it("fires a whole screen early, in units of the reader's own screen", () => {
    /*
     * THE NUMBER THAT MAKES THIS SAFE RATHER THAN CLEVER. `rootMargin` in
     * percent is a percentage of the ROOT, so "one screen early" is one
     * screen of whatever device is reading -- taller phone, bigger margin,
     * with nothing to configure. A pixel value would be one guess for
     * every screen there is.
     */
    expect(BELOW).toContain('rootMargin: "100% 0px"');
    expect(BELOW).not.toMatch(/rootMargin:\s*"\d+px/);
  });

  it("shows everything when it cannot observe", () => {
    // The failure mode has to be the behaviour it replaced, never a
    // section that never arrives.
    expect(BELOW).toContain('typeof IntersectionObserver === "undefined"');
    const guard = BELOW.slice(BELOW.indexOf("IntersectionObserver === "));
    expect(guard.slice(0, 120)).toContain("setOpen(true)");
  });

  it("holds a height until it opens, so the page does not lurch", () => {
    expect(BELOW).toMatch(/minHeight: reserve/);
  });

  it("is closed on the first render, whatever its lead says", () => {
    /*
     * The lead decides whether a reader ever sees a section arrive. What
     * splits the work is this: the children are absent from the first
     * render even when the observer will open them on the very next task,
     * so a room's first commit costs only what is on screen. A `useState`
     * seeded `true` would keep the lead and quietly lose the saving.
     */
    expect(BELOW).toMatch(/useState\(false\)/);
    expect(BELOW).toMatch(/\{open \? children : null\}/);
  });

  it("carries the wrapper classes a parent's layout reads", () => {
    /*
     * A wrapped child is no longer a child of the original parent, so a
     * flex `order` or a grid placement left on the inner element stops
     * applying. `CircleHome` orders its sections in a flex column, and
     * without this both of its wrapped sections jump to the top.
     */
    expect(BELOW).toMatch(/className=\{className\}/);
    for (const m of CIRCLE.matchAll(/<BelowFold([^>]*)>/g)) {
      expect(m[1], "a wrapped ordered section keeps its order").toMatch(
        /className="order-\d+"/
      );
    }
  });

  it("Circle's two big sections are the ones deferred", () => {
    // 264 of a circle's 308 elements, both starting below an 800px fold.
    expect(CIRCLE).toMatch(/<BelowFold[^>]*>\s*<CommunityTodayBoard/);
    expect(
      CIRCLE.match(/<BelowFold/g)?.length,
      "the two overview sections, and not the League ones a tab already hides"
    ).toBe(2);
  });

  it("is spent only where the content is more than a screen down", () => {
    /*
     * THE TEST IS THE OFFSET, NOT THE SIZE, and Growth is why that is
     * worth a test rather than a habit.
     *
     * Measured at 390x800 with the fold at 800, so the lead reaches
     * 1,600. Holdings is the easy case: covered calls start at 2,277px
     * and the forecast at 4,081px, 532 of the room's 957 elements, and
     * both report zero rendered elements until reached.
     *
     * Growth's projection section starts at **1,218px** -- below the fold
     * but inside the lead -- so wrapping the section did nothing at all
     * and all 619 elements still rendered. Wrapping it one level in works:
     * the hero panel stays (1,218), and every panel after it starts at
     * **1,907px or lower**, together 555 of the section's 618 elements.
     * Verified: the room went from 713 rendered elements to 154.
     */
    expect(HOLDINGS).toContain("<BelowFold reserve={420}>");
    expect(GROWTH).toContain("<BelowFold");
    /*
     * ...but never around the whole section, which is the shape that was
     * measured to save nothing. The hero panel must stay outside it.
     */
    const section = GROWTH.slice(GROWTH.indexOf("Results & Projections"));
    const hero = section.indexOf("<Panel className={SHEET_PANEL}>");
    const defer = section.indexOf("<BelowFold");
    expect(hero, "the hero panel is still rendered up front").toBeGreaterThan(-1);
    expect(defer, "and the deferral starts after it").toBeGreaterThan(hero);
  });
});

describe("a card in a long list is painted when it comes into view", () => {
  it("lets the browser remember each card's real height", () => {
    // `auto` is the half that makes it usable: the guess is only ever
    // wrong the first time a card is reached, so the scrollbar settles
    // instead of lurching on every scroll.
    expect(CSS).toMatch(/contain-intrinsic-size:\s*auto \d+px/);
    expect(CSS).toContain("content-visibility: auto");
  });

  it("goes on the long lists, which is what it is for", () => {
    // Pulse is 498 elements in one block 5,812px tall: seven screens of
    // cards a reader sees one of, and they cannot be sectioned.
    expect(PULSE).toContain("defer-paint");
    // Growth's projection panels wear both: `BelowFold` keeps them out of
    // the render until the reader is near, and this skips the style and
    // paint for whichever of them is still off screen once they are in.
    expect(GROWTH).toContain("defer-paint");
  });

  it("never contains something with a sticky child", () => {
    /*
     * Containment makes the element its own containing block, so a sticky
     * header inside one sticks to the card rather than to the page. The
     * two places this is used are a Pulse card and a Growth panel; neither
     * carries a `sticky` descendant, and this fails if one appears.
     */
    for (const [name, src] of [["PulsePage", PULSE], ["CompoundInterestSheet", GROWTH]] as const) {
      expect(src, `${name} should use defer-paint`).toContain("defer-paint");
      /*
       * Class usage, not the word: both of these files talk about sticky
       * in comments, and one of them documents that the only sticky
       * sidebar in the codebase was deliberately taken out. A line that
       * both sets a className and asks for sticky is the real thing.
       */
      const offenders = src
        .split("\n")
        .filter((line) => /className|cn\(/.test(line) && /\bsticky\b/.test(line));
      expect(offenders, `${name} grew a sticky element under containment`).toEqual([]);
    }
  });
});
