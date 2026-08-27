/**
 * The signed-out hero must paint in one frame, both lamps together, and
 * those lamps must stay as the reader scrolls.
 *
 * There is no bitmap to preload. The two lobes are radial gradients on
 * `.page-frame::before`, `position: fixed`, same as every signed-in room.
 * They used to be re-boxed to `100svh` so a filter region would stay one
 * WebKit tile; that is the hard cutoff at the fold. A document-tall
 * filtered layer is the other failure: Safari tiles it and the sample
 * card pops in. These checks are against the source because the failure
 * is a CSS shape, not a render of the settled page.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CSS = readFileSync("src/app/globals.css", "utf8");
const LANDING = readFileSync("src/components/SignedOutLanding.tsx", "utf8");
const GATE = readFileSync("src/components/SignInGate.tsx", "utf8");

function ruleOf(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf("}", start));
}

describe("the landing hero lamps stay with the window", () => {
  it("does not clip the lamps to the first screen", () => {
    // A 100svh absolute ::before is the hard cutoff at the fold.
    expect(CSS).not.toContain(".landing-field::before {");
    expect(CSS).not.toContain(".landing-field::after {");
  });

  it("does not turn the gate into a scroll container", () => {
    // overflow-y-auto on the frame either pins the lamps to the first
    // screen of content or, in Safari, stretches the SVG filter to the
    // document. Body already clips sideways.
    expect(GATE).not.toMatch(/overflow-y-auto/);
  });

  it("keeps both lamps on the viewport-fixed page-frame pair", () => {
    const rule = ruleOf(".page-frame::before");
    expect(rule).toContain("position: fixed");
    expect(rule).toContain("url(#ambient-dither)");
    const start = CSS.indexOf(".page-frame::before {");
    const pair = CSS.slice(start, CSS.indexOf("transparent 100%", start) + 20);
    expect(pair).toContain("--primary");
    expect(pair).toContain("--ambient-cool");
  });

  it("does not draw a second field behind the sample card", () => {
    expect(LANDING).not.toMatch(/className="ambient-glow"/);
    expect(GATE).not.toMatch(/className="ambient-glow"/);
    expect(CSS).not.toContain(".ambient-glow {");
    expect(CSS).not.toContain(".sample-still");
    expect(LANDING).not.toMatch(/ring-0/);
    // Same glass shell as Pulse: the rim stays, only the private glow goes.
    expect(LANDING).toContain('className="h-auto gap-5 p-5"');
    expect(LANDING).toContain("items-start");
  });
});

describe("the landing does not hide itself before paint", () => {
  it("does not wait on auth ready behind a spinner", () => {
    expect(GATE).not.toContain("DashboardLoading");
    expect(GATE).not.toMatch(/if\s*\(\s*!ready\s*\)/);
    expect(GATE).toMatch(/if\s*\(\s*user\s*\)\s*return/);
  });

  it("does not run the entrance animation on the hero", () => {
    expect(LANDING).not.toMatch(/signin-rise/);
    expect(CSS).toMatch(
      /\.landing-field \.signin-rise-1,[\s\S]*animation:\s*none/
    );
  });

  it("does not fade sections in on scroll", () => {
    expect(LANDING).not.toContain("IntersectionObserver");
    expect(LANDING).not.toContain("data-reveal");
    expect(LANDING).not.toContain("REVEAL_LEAD");
    expect(CSS).not.toContain("[data-reveal]");
  });

  it("asks WebKit to paint the sample card, not skip it", () => {
    expect(LANDING).toContain("landing-still");
    expect(LANDING).toContain("landing-hero");
    const start = CSS.indexOf(".landing-hero,");
    expect(start).toBeGreaterThan(-1);
    const rule = CSS.slice(start, CSS.indexOf("}", start));
    expect(rule).toContain("content-visibility: visible");
    expect(rule).toMatch(/transform:\s*none/);
    expect(rule).not.toMatch(/transform:\s*translateZ/);
  });

  it("does not put a private glow behind the sample card", () => {
    expect(CSS).not.toContain(".ambient-glow {");
    expect(LANDING).not.toMatch(/className="ambient-glow"/);
  });

  it("does not pulse the live dot on the landing", () => {
    expect(CSS).toMatch(
      /\.landing-field \.signin-live-dot[\s\S]*?animation:\s*none/
    );
  });

  it("drops backdrop-filter on the phone landing, so the card cannot fill in", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*?\.landing-field \.glass,[\s\S]*?backdrop-filter:\s*none/
    );
  });

  it("seeds invite routes so the marketing landing never paints first", () => {
    const community = readFileSync("src/app/communities/join/page.tsx", "utf8");
    const account = readFileSync("src/app/account/join/page.tsx", "utf8");
    expect(GATE).toMatch(/useState<InviteLanding \| null>\(seededInvite\)/);
    expect(community).toMatch(/<SignInGate invite=\{JOIN_COMMUNITY_INVITE\}>/);
    expect(account).toMatch(/<SignInGate invite=\{JOIN_SHEET_INVITE\}>/);
  });
});
