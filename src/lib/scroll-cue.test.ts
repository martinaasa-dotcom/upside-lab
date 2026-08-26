/*
  The cue at the fold, and the two things it must never go back to being.

  The signed-out page has to say, at the fold, that it continues. It used to
  say it with a `glass-notice` pill fixed to the bottom of the window,
  drawn whenever the document was taller than the screen, and both halves of
  that were wrong.

  IT WAS DRAWN WHERE IT WAS NOT WANTED. On a phone the sample card hangs
  141px off the bottom of the screen, which is the loudest continuation cue
  there is, and the pill sat on top of it saying the same thing in words.

  AND IT WAS WHY THE PAGE FILLED IN AS YOU SCROLLED IT. A `backdrop-filter`
  pinned over moving content re-filters its backdrop every frame, and the
  bottom band of the window is exactly where new content arrives while you
  scroll. Measured on Upside Arena's copy of this page, which is the same
  page with the same pill, at 412x915 with the CPU throttled ten times: one
  pass down it presented 42 frames the compositor had to repaint, the
  worst of them with 38% of the bottom eighth of the screen not yet caught
  up with where the page actually was. Hiding that one element and changing
  nothing else took the same scroll to 9 frames, every one pixel-identical
  to the settled page.

  So the rule is the pair rather than either half, and it is the first thing
  asserted below: nothing here may be fixed over the content AND filter its
  backdrop.

  Asserted against the source, because all of it is numbers and class names
  typed into a component, and the failure is a layout nobody looks at on the
  screen sizes where it matters. Upside Arena's copy is the same component
  under the same rules, in `tests/unit/scroll-cue.test.ts`. Fix both or
  neither.
*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CUE = readFileSync("src/components/ScrollCue.tsx", "utf8");
const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

/*
  The component with its prose taken out. The note above it names the very
  things it must not carry, so a check run over the whole file would fail on
  its own explanation.
*/
const CODE = CUE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

describe("the cue at the fold belongs to the page", () => {
  it("is not pinned to the window", () => {
    expect(CODE, "a fixed cue is the old repaint").not.toMatch(/\bfixed\b/);
    expect(CODE).toContain("absolute");
  });

  it("carries no glass, so it cannot re-filter a moving backdrop", () => {
    for (const material of [
      "glass-notice",
      "glass-overlay",
      "glass-dock",
      "glass-well",
      "backdrop-filter",
      "backdrop-blur",
    ]) {
      expect(CODE, `${material} is what made the page repaint`).not.toContain(
        material
      );
    }
    // `glass` on its own is a substring of the names above, so it is checked
    // the way it would actually be written in a class list.
    expect(CODE).not.toMatch(/["\s]glass["\s]/);
  });

  it("draws in the last band of the first screen, in the page's own units", () => {
    // Measured off the top of the document, which is where the hero starts,
    // rather than off the hero's bottom, which on a short window is a screen
    // and a half further down.
    const band = CODE.match(/top-\[calc\(100svh-([\d.]+)rem\)\]/);
    expect(band, "the cue is positioned differently now").not.toBeNull();
    expect(CODE, "the band's height has to match its offset").toContain(
      `h-${Number(band![1]) * 4}`
    );
  });

  it("uses `svh`, so a retracting address bar cannot move it or the hero", () => {
    expect(CODE).toContain("100svh");
    expect(CODE).not.toContain("100dvh");
    expect(LANDING).toContain("100svh");
    expect(LANDING).not.toContain("100dvh");
  });

  it("never swallows clicks along the bottom of the first screen", () => {
    // Full width and transparent over content. Without this the band eats
    // every click on that line, and the button inside it has to opt back in.
    expect(CODE).toMatch(/pointer-events-none[^"]*absolute/);
    expect(CODE).toContain("pointer-events-auto");
  });
});

describe("the cue stands down when the page is already saying it continues", () => {
  it("measures the sample card against the fold", () => {
    // A card the fold cuts needs no words under it. That is every phone.
    expect(CODE).toContain("[data-scroll-cue-still]");
    expect(CODE).toContain("pageTop(still) + still.offsetHeight > bandTop");
    expect(LANDING).toContain("data-scroll-cue-still");
  });

  it("measures the next section against the fold", () => {
    // Any of the following section on screen and the page is saying it
    // itself, whether that reads as a heading or as a heading being cut.
    expect(CODE).toContain("pageTop(next) < fold");
  });

  it("measures where the page laid things out, not where they are drawn", () => {
    /*
      The bug this closed, and the reason it is a rule rather than a fix.

      Every one of these measurements used to be a `getBoundingClientRect`,
      which reports where a thing is being drawn. The landing hero used to
      run an entrance animation that held the sample card 12px below where
      it lands, with `both` fill, from the first frame until 0.85s in. That
      animation is gone (it is what skipped painting the below-fold half of
      the card on older WebKit), but a font swap still moves a few pixels,
      so the cue still reads layout (`offsetTop`) rather than the screen.
      A rect taken at hydration during a swap would stand the cue down as
      though the fold were cutting the card.

      Measured on the real page at 1440 wide: no cue on any window between
      950px and 961px tall, appearing on one wheel notch. With the layout
      read instead it is drawn 425ms after the document is ready and no
      scroll is needed.
    */
    expect(CODE, "a rect is where the page is drawn, not where it is").not.toContain(
      "getBoundingClientRect"
    );
    expect(CODE).toContain("offsetTop");
    expect(CODE).toContain("offsetParent");
  });

  it("stops drawing once the reader has scrolled or has nowhere to go", () => {
    expect(CODE).toContain("scrollTop");
    expect(CODE).toContain("scrollHeight");
  });

  it("re-measures rather than guessing from a breakpoint", () => {
    /*
      The first read is the one a reader on a reload gets, and the layout
      measurement above is what makes it right. These are for the page
      changing shape afterwards: it decides on a few pixels of clearance,
      and a font swap moves more than that, measured here at 1440x960 with
      the card sitting 11px clear of the band.
    */
    expect(CODE).toContain('window.addEventListener("resize", read)');
    expect(CODE).toContain('window.addEventListener("load", read)');
    expect(CODE).toContain("fonts");
    expect(CODE).toContain("ResizeObserver");
  });

  it("stands down while the cookie question holds the same line", () => {
    // Below `sm` the cookie question is a full-width strip on this exact line.
    expect(CODE).toContain("max-sm:hidden");
  });
});

describe("the cue is laid out inside the hero", () => {
  it("has the hero establish the containing block", () => {
    expect(LANDING).toMatch(
      /<section className="relative min-h-\[calc\(100svh-9rem\)\]/
    );
  });

  it("is mounted once, in the hero rather than beside the footer", () => {
    expect(LANDING.match(/<ScrollCue \/>/g) ?? []).toHaveLength(1);
    const hero = LANDING.slice(
      LANDING.indexOf('<section className="relative min-h-[calc(100svh-9rem)]')
    );
    expect(hero.indexOf("<ScrollCue />")).toBeLessThan(
      hero.indexOf("</section>")
    );
  });

  it("leaves the next section's heading, not its padding, showing on a tall window", () => {
    /*
      The hero's floor is what makes the cue unnecessary on a tall display,
      so the peek has to be worth something: the first 48px of a section is
      its own top padding, and an empty band is not a beginning.
    */
    const peek = LANDING.match(/min-h-\[calc\(100svh-(\d+(?:\.\d+)?)rem\)\]/);
    expect(peek, "the hero carries a height floor").not.toBeNull();
    const pad = LANDING.match(/<section className=\{cn\("px-6 py-\d+ sm:py-(\d+)"/);
    expect(pad, "the Section padding is written differently now").not.toBeNull();
    expect(Number(peek![1]) * 16).toBeGreaterThan(Number(pad![1]) * 4 + 48);
  });

  it("has its nudge defined, so reduced motion can switch it off", () => {
    expect(CODE).toContain("scroll-cue-nudge");
    expect(CSS).toMatch(/\.scroll-cue-nudge\s*\{/);
    expect(CSS).toMatch(/@keyframes scroll-cue-nudge/);
  });
});
