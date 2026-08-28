/**
 * The landing page must never look like it is still loading.
 *
 * The feedback this guards: somebody scrolls down the signed-out page, the
 * next section is not drawn yet, and the reasonable thing to conclude is
 * that the page has ended, so they scroll back up and never see the rest of
 * it. That used to be an IntersectionObserver fade. It is gone. Everything
 * the HTML carries is painted. These checks are against the source, because
 * the settled page looks the same either way, which is the whole problem.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

/**
 * Every `<SectionHead …/>` in the file, each paired with the markup that
 * runs from it to the end of the function it sits in.
 *
 * This used to take a list of section titles typed out here and look each
 * one up. That made a copy pass fail a layout test: rewording a heading on
 * the page broke a check that has nothing to say about wording. The rule
 * being defended is "a heading arrives with the row it heads", so the
 * headings are read out of the source instead of restated here.
 */
function sectionsAfterHeads(source: string): { title: string; block: string }[] {
  const out: { title: string; block: string }[] = [];
  const head = /<SectionHead\b/g;
  let m: RegExpExecArray | null;
  while ((m = head.exec(source))) {
    const from = m.index;
    const next = source.slice(from + 1).search(/\n(?:export )?function /);
    const block = source.slice(from, next === -1 ? undefined : from + 1 + next);
    const title = /title="([^"]+)"/.exec(block)?.[1] ?? "";
    out.push({ title, block });
  }
  return out;
}

describe("the landing page is drawn, not revealed", () => {
  it("never writes a hide attribute, and never observes the fold", () => {
    expect(LANDING).not.toContain("data-reveal");
    expect(LANDING).not.toContain("IntersectionObserver");
    expect(LANDING).not.toContain("REVEAL_LEAD");
    expect(CSS).not.toContain("[data-reveal]");
  });

  it("keeps a heading and the cards it heads in one section", () => {
    const sections = sectionsAfterHeads(LANDING);
    expect(sections.length).toBeGreaterThanOrEqual(3);

    for (const { title, block } of sections) {
      expect(title, "a SectionHead with no title").not.toBe("");
      expect(
        block,
        `"${title}" is a SectionHead that arrives without the row it heads`
      ).toMatch(/<(div|PulseStill|MargusStill)/);
    }
  });

  it("staggers nothing, so no part of a section can lag another", () => {
    expect(LANDING).not.toContain("delayMs");
    expect(LANDING).not.toContain("transitionDelay");
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
