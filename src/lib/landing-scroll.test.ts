/**
 * The landing page must never look like it is still loading.
 *
 * The feedback this guards: somebody scrolls down the signed-out page, the
 * next section is not drawn yet, and the reasonable thing to conclude is
 * that the page has ended, so they scroll back up and never see the rest of
 * it. Two things caused it, and both are measurements rather than taste.
 *
 * One, `Reveal` armed its observer with `rootMargin: "0px 0px -12% 0px"`, a
 * negative margin, which shrinks the observer's root instead of growing it.
 * Measured against the real page, a section did not begin arriving until it
 * was already 113px to 188px inside the window, and then took 0.7s to get
 * there. Two, a section's heading and its row of cards were two separate
 * `Reveal` blocks with the cards on a delay, so the commonest thing a
 * reader saw at a boundary was a title with a hole under it.
 *
 * Asserted against the source, because both faults are numbers typed into
 * a component rather than anything a render would show: the page renders
 * identically once everything has arrived, which is the whole problem.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

/** Every `<Reveal …>…</Reveal>` block in the landing, body text included. */
function revealBlocks(source: string): string[] {
  const out: string[] = [];
  const open = /<Reveal(\s[^>]*)?>/g;
  let match: RegExpExecArray | null;
  while ((match = open.exec(source))) {
    const end = source.indexOf("</Reveal>", match.index);
    if (end === -1) continue;
    out.push(source.slice(match.index, end));
  }
  return out;
}

describe("the landing page reveals ahead of the fold", () => {
  it("grows the observer's root rather than shrinking it", () => {
    const lead = LANDING.match(/const REVEAL_LEAD = ([\d.]+);/);
    expect(lead, "REVEAL_LEAD is gone").not.toBeNull();

    // A whole screen at least. Below 1 a section can arrive while the reader
    // is looking at the space it will occupy, which is the bug.
    expect(Number(lead![1])).toBeGreaterThanOrEqual(1);

    // And it has to reach the observer as a positive bottom margin.
    expect(LANDING).toMatch(
      /rootMargin: `0px 0px \$\{Math\.round\(REVEAL_LEAD \* 100\)\}% 0px`/
    );
    expect(LANDING, "a negative rootMargin is the old bug").not.toMatch(
      /rootMargin:[^,\n]*-\d/
    );
  });

  it("draws what is already within the lead instead of fading it", () => {
    // The screenful under the hero is finished before the first scroll,
    // rather than starting to arrive because of one. It also means nothing
    // can flash empty on mount, and that a reload landing halfway down the
    // page draws what is around it rather than animating it.
    expect(LANDING).toContain(
      "el.getBoundingClientRect().top <= window.innerHeight * (1 + REVEAL_LEAD)"
    );
  });

  it("keeps a heading and the cards it heads in one block", () => {
    const blocks = revealBlocks(LANDING);
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      if (!block.includes("<SectionHead")) continue;
      expect(
        block,
        "a SectionHead that arrives without the row it is the heading of"
      ).toMatch(/<(div|PulseStill|MargusStill)/);
    }
  });

  it("staggers nothing, so no part of a section can lag another", () => {
    expect(LANDING).not.toContain("delayMs");
    expect(LANDING).not.toContain("transitionDelay");
  });

  it("finishes the fade quickly enough that a fast reader cannot read it as loading", () => {
    const rule = CSS.match(
      /\[data-reveal\] \{\s*transition:\s*opacity ([\d.]+)s ease-out,\s*transform ([\d.]+)s ease-out;/
    );
    expect(rule, "the [data-reveal] transition is gone").not.toBeNull();
    expect(Number(rule![1])).toBeLessThanOrEqual(0.5);
    expect(Number(rule![2])).toBeLessThanOrEqual(0.5);
  });
});

describe("the landing page leaves no void a reader can mistake for the end", () => {
  it("keeps the gap between two sections under a tenth of a screen", () => {
    /*
      Each section pads itself, so what a reader sees between two of them is
      twice this number: 80px on a phone and 96px on a desktop, against
      sections measuring 435px to 642px. It was 96/128, and 128px was the
      tallest empty band on the page.
    */
    const pad = LANDING.match(/<section className=\{cn\("px-6 py-(\d+) sm:py-(\d+)"/);
    expect(pad, "the Section padding is written differently now").not.toBeNull();
    expect(Number(pad![1])).toBeLessThanOrEqual(10);
    expect(Number(pad![2])).toBeLessThanOrEqual(12);
  });

  it("sets a heading close enough to its cards to read as one thing", () => {
    for (const gap of LANDING.matchAll(/className="mt-(\d+) grid gap-4/g)) {
      expect(Number(gap[1])).toBeLessThanOrEqual(8);
    }
  });
});
