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

  it("is spent only where the content is more than a screen down", () => {
    /*
     * Measured at 390x800. Holdings: covered calls start at 2,277px and
     * the forecast at 4,081px of an 8.1-screen page, well past the one
     * screen of lead time, and they are 532 of the room's 957 elements.
     * Verified after: both report zero rendered elements until reached.
     *
     * Growth was tried and taken back out, and that is the instructive
     * half: its projection section starts at 1,218px with the fold at
     * about 917, so it is below the fold but LESS THAN ONE SCREEN below
     * it -- the observer fired immediately and 619 elements still
     * rendered. It carries `defer-paint` instead.
     */
    expect(HOLDINGS).toContain("<BelowFold reserve={420}>");
    expect(GROWTH).not.toContain("<BelowFold");
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
    // cards a reader sees one of.
    expect(PULSE).toContain("defer-paint");
    // Growth's projection panels, which are below the fold but too close
    // for BelowFold to help.
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
